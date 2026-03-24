"use client";

import { useState, useRef, useCallback } from "react";
import {
  createUploadSession,
  uploadChunk,
  getUploadSession,
  completeUploadSession,
  cancelUploadSession,
  UploadSessionExpiredError,
  ChecksumMismatchError,
} from "@/lib/api/uploads";
import type { CompleteResult } from "@/lib/api/uploads";

// --- Types ---

export type UploadStatus =
  | "idle"
  | "hashing"
  | "uploading"
  | "paused"
  | "finalizing"
  | "complete"
  | "error";

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  chunksCompleted: number;
  chunksTotal: number;
  percentage: number;
  speed: number;
  eta: number;
}

export interface UseChunkedUploadOptions {
  repositoryKey: string;
  artifactPath?: string;
  chunkSize?: number;
  threshold?: number;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (result: CompleteResult) => void;
  onError?: (error: Error) => void;
}

export interface UseChunkedUploadReturn {
  upload: (file: File, path?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  progress: UploadProgress;
  status: UploadStatus;
  error: Error | null;
  hasPendingSession: (file: File, path?: string) => boolean;
}

// --- Constants ---

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const DEFAULT_THRESHOLD = 100 * 1024 * 1024; // 100MB
const SPEED_WINDOW_SIZE = 5;
const MAX_CHUNK_RETRIES = 3;

// --- Helpers ---

function sessionStorageKey(repoKey: string, path: string): string {
  return `upload-session-${repoKey}-${path}`;
}

function saveSession(repoKey: string, path: string, sessionId: string): void {
  try {
    localStorage.setItem(
      sessionStorageKey(repoKey, path),
      JSON.stringify({ sessionId, savedAt: Date.now() })
    );
  } catch {
    // localStorage might be full or unavailable
  }
}

function loadSession(
  repoKey: string,
  path: string
): { sessionId: string; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(repoKey, path));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession(repoKey: string, path: string): void {
  try {
    localStorage.removeItem(sessionStorageKey(repoKey, path));
  } catch {
    // ignore
  }
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const INITIAL_PROGRESS: UploadProgress = {
  bytesUploaded: 0,
  totalBytes: 0,
  chunksCompleted: 0,
  chunksTotal: 0,
  percentage: 0,
  speed: 0,
  eta: 0,
};

// --- Hook ---

export function useChunkedUpload(
  options: UseChunkedUploadOptions
): UseChunkedUploadReturn {
  const {
    repositoryKey,
    artifactPath: defaultPath,
    chunkSize: requestedChunkSize = DEFAULT_CHUNK_SIZE,
    threshold = DEFAULT_THRESHOLD,
    onProgress,
    onComplete,
    onError,
  } = options;

  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState<UploadProgress>(INITIAL_PROGRESS);
  const [error, setError] = useState<Error | null>(null);

  // Refs for controlling the upload loop
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const activePathRef = useRef<string>("");

  const updateProgress = useCallback(
    (p: UploadProgress) => {
      setProgress(p);
      onProgress?.(p);
    },
    [onProgress]
  );

  const hasPendingSession = useCallback(
    (file: File, path?: string): boolean => {
      const effectivePath = path || defaultPath || file.name;
      if (file.size < threshold) return false;
      const saved = loadSession(repositoryKey, effectivePath);
      if (!saved) return false;
      // Sessions older than 23 hours are likely expired (server TTL is 24h)
      const MAX_AGE = 23 * 60 * 60 * 1000;
      return Date.now() - saved.savedAt < MAX_AGE;
    },
    [repositoryKey, defaultPath, threshold]
  );

  const uploadChunks = useCallback(
    async (
      file: File,
      sessionId: string,
      effectivePath: string,
      actualChunkSize: number,
      totalChunks: number,
      startFromChunk: number,
      initialBytesUploaded: number
    ): Promise<void> => {
      const speedSamples: { bytes: number; ms: number }[] = [];
      let bytesUploaded = initialBytesUploaded;

      for (let i = startFromChunk; i < totalChunks; i++) {
        // Check pause/cancel between chunks
        if (cancelledRef.current) return;

        if (pausedRef.current) {
          setStatus("paused");
          await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              if (!pausedRef.current || cancelledRef.current) {
                clearInterval(interval);
                resolve();
              }
            }, 200);
          });
          if (cancelledRef.current) return;
          setStatus("uploading");
        }

        const start = i * actualChunkSize;
        const end = Math.min(start + actualChunkSize, file.size);
        const blob = file.slice(start, end);

        // Retry logic for individual chunks
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
          try {
            const chunkStart = performance.now();
            await uploadChunk(sessionId, start, end, file.size, blob);
            const chunkMs = performance.now() - chunkStart;
            const chunkBytes = end - start;

            // Rolling window for speed calculation
            speedSamples.push({ bytes: chunkBytes, ms: chunkMs });
            if (speedSamples.length > SPEED_WINDOW_SIZE) {
              speedSamples.shift();
            }

            bytesUploaded += chunkBytes;
            const totalSampleBytes = speedSamples.reduce(
              (sum, s) => sum + s.bytes,
              0
            );
            const totalSampleMs = speedSamples.reduce(
              (sum, s) => sum + s.ms,
              0
            );
            const speed =
              totalSampleMs > 0
                ? (totalSampleBytes / totalSampleMs) * 1000
                : 0;
            const remaining = file.size - bytesUploaded;
            const eta = speed > 0 ? remaining / speed : 0;

            updateProgress({
              bytesUploaded,
              totalBytes: file.size,
              chunksCompleted: i + 1,
              chunksTotal: totalChunks,
              percentage: Math.round((bytesUploaded * 100) / file.size),
              speed,
              eta,
            });

            lastError = null;
            break;
          } catch (err) {
            // Don't retry expired sessions
            if (err instanceof UploadSessionExpiredError) {
              clearSession(repositoryKey, effectivePath);
              sessionIdRef.current = null;
              throw err;
            }
            lastError =
              err instanceof Error ? err : new Error("Chunk upload failed");
            if (attempt < MAX_CHUNK_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }

        if (lastError) {
          throw lastError;
        }
      }

      // All chunks uploaded, finalize
      setStatus("finalizing");
      const result = await completeUploadSession(sessionId);
      clearSession(repositoryKey, effectivePath);
      sessionIdRef.current = null;

      updateProgress({
        bytesUploaded: file.size,
        totalBytes: file.size,
        chunksCompleted: totalChunks,
        chunksTotal: totalChunks,
        percentage: 100,
        speed: 0,
        eta: 0,
      });

      setStatus("complete");
      onComplete?.(result);
    },
    [repositoryKey, updateProgress, onComplete]
  );

  const upload = useCallback(
    async (file: File, path?: string): Promise<void> => {
      const effectivePath = path || defaultPath || file.name;
      activePathRef.current = effectivePath;
      pausedRef.current = false;
      cancelledRef.current = false;
      setError(null);

      // Small files use existing single-request upload (caller handles this)
      if (file.size < threshold) {
        return;
      }

      try {
        // Compute SHA256 for the full file
        setStatus("hashing");
        updateProgress({ ...INITIAL_PROGRESS, totalBytes: file.size });

        const checksum = await computeSha256(file);
        if (cancelledRef.current) return;

        setStatus("uploading");

        // Try to resume an existing session, or create a new one
        let sessionId: string;
        let actualChunkSize = requestedChunkSize;
        let totalChunks: number;
        let startFromChunk = 0;
        let initialBytesUploaded = 0;

        const saved = loadSession(repositoryKey, effectivePath);
        if (saved) {
          try {
            const existing = await getUploadSession(saved.sessionId);
            if (
              existing.status === "in_progress" &&
              existing.total_size === file.size
            ) {
              sessionId = saved.sessionId;
              totalChunks = existing.chunks_total;
              startFromChunk = existing.chunks_completed;
              initialBytesUploaded = existing.bytes_received;
            } else {
              // Session is stale or mismatched, create new
              clearSession(repositoryKey, effectivePath);
              const created = await createNewSession();
              sessionId = created.sessionId;
              actualChunkSize = created.chunkSize;
              totalChunks = created.totalChunks;
            }
          } catch (err) {
            // Expired or unreachable session, start fresh
            clearSession(repositoryKey, effectivePath);
            if (err instanceof UploadSessionExpiredError) {
              // Expected for old sessions, just create new
            }
            const created = await createNewSession();
            sessionId = created.sessionId;
            actualChunkSize = created.chunkSize;
            totalChunks = created.totalChunks;
          }
        } else {
          const created = await createNewSession();
          sessionId = created.sessionId;
          actualChunkSize = created.chunkSize;
          totalChunks = created.totalChunks;
        }

        if (cancelledRef.current) {
          await cancelUploadSession(sessionId);
          clearSession(repositoryKey, effectivePath);
          return;
        }

        sessionIdRef.current = sessionId;
        saveSession(repositoryKey, effectivePath, sessionId);

        updateProgress({
          bytesUploaded: initialBytesUploaded,
          totalBytes: file.size,
          chunksCompleted: startFromChunk,
          chunksTotal: totalChunks,
          percentage:
            file.size > 0
              ? Math.round((initialBytesUploaded * 100) / file.size)
              : 0,
          speed: 0,
          eta: 0,
        });

        await uploadChunks(
          file,
          sessionId,
          effectivePath,
          actualChunkSize,
          totalChunks,
          startFromChunk,
          initialBytesUploaded
        );

        // Helper to create a new session and return normalized values
        async function createNewSession() {
          const session = await createUploadSession({
            repository_key: repositoryKey,
            artifact_path: effectivePath,
            total_size: file.size,
            checksum_sha256: checksum,
            chunk_size: requestedChunkSize,
            content_type: file.type || "application/octet-stream",
          });
          return {
            sessionId: session.session_id,
            chunkSize: session.chunk_size,
            totalChunks: session.chunk_count,
          };
        }
      } catch (err) {
        if (cancelledRef.current) return;
        const uploadError =
          err instanceof Error ? err : new Error("Upload failed");

        // Provide user-friendly messages for known error types
        if (err instanceof ChecksumMismatchError) {
          setError(
            new Error(
              "File checksum does not match. The file may have changed during upload."
            )
          );
        } else if (err instanceof UploadSessionExpiredError) {
          clearSession(repositoryKey, effectivePath);
          setError(
            new Error(
              "Upload session expired. Please try again."
            )
          );
        } else {
          setError(uploadError);
        }

        setStatus("error");
        onError?.(uploadError);
        throw uploadError;
      }
    },
    [
      repositoryKey,
      defaultPath,
      requestedChunkSize,
      threshold,
      updateProgress,
      uploadChunks,
      onError,
    ]
  );

  const pause = useCallback(() => {
    if (status === "uploading") {
      pausedRef.current = true;
      setStatus("paused");
    }
  }, [status]);

  const resume = useCallback(() => {
    if (status === "paused") {
      pausedRef.current = false;
      setStatus("uploading");
    }
  }, [status]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    pausedRef.current = false;

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        await cancelUploadSession(sessionId);
      } catch {
        // Best-effort cancel
      }
      clearSession(repositoryKey, activePathRef.current);
      sessionIdRef.current = null;
    }

    setStatus("idle");
    setProgress(INITIAL_PROGRESS);
    setError(null);
  }, [repositoryKey]);

  return {
    upload,
    pause,
    resume,
    cancel,
    progress,
    status,
    error,
    hasPendingSession,
  };
}
