"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  X,
  FileIcon,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn, formatBytes } from "@/lib/utils";
import {
  useChunkedUpload,
  type UploadProgress,
  type UploadStatus,
} from "@/hooks/use-chunked-upload";

interface FileUploadProps {
  onUpload: (file: File, path?: string) => Promise<void>;
  showPathInput?: boolean;
  accept?: string;
  className?: string;
  /** When provided, enables chunked upload for files over the threshold */
  repositoryKey?: string;
  /** Chunk size in bytes (default 8MB) */
  chunkSize?: number;
  /** Files larger than this use chunked upload (default 100MB) */
  chunkedThreshold?: number;
  /** Called when chunked upload completes */
  onChunkedComplete?: () => void;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)} min remaining`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.ceil((seconds % 3600) / 60);
  return `~${hours}h ${mins}m remaining`;
}

function ChunkedProgressDisplay({
  progress,
  status,
}: {
  progress: UploadProgress;
  status: UploadStatus;
}) {
  return (
    <div className="space-y-2">
      <Progress value={progress.percentage} className="h-2" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)}
        </span>
        <span className="text-right">
          {progress.percentage}%
        </span>
        {status === "uploading" && progress.speed > 0 && (
          <>
            <span>{formatSpeed(progress.speed)}</span>
            <span className="text-right">{formatEta(progress.eta)}</span>
          </>
        )}
        {status === "hashing" && (
          <span className="col-span-2">Computing file checksum...</span>
        )}
        {status === "finalizing" && (
          <span className="col-span-2">Finalizing upload...</span>
        )}
        {status === "paused" && (
          <span className="col-span-2">Upload paused</span>
        )}
      </div>
      {progress.chunksTotal > 0 && (
        <p className="text-xs text-muted-foreground">
          {progress.chunksCompleted.toLocaleString()} /{" "}
          {progress.chunksTotal.toLocaleString()} chunks
        </p>
      )}
    </div>
  );
}

export function FileUpload({
  onUpload,
  showPathInput = false,
  accept,
  className,
  repositoryKey,
  chunkSize,
  chunkedThreshold = 100 * 1024 * 1024,
  onChunkedComplete,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [customPath, setCustomPath] = useState("");
  const [simpleProgress, setSimpleProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isChunkedMode = !!repositoryKey && !!file && file.size >= chunkedThreshold;

  const chunked = useChunkedUpload({
    repositoryKey: repositoryKey || "",
    chunkSize,
    threshold: chunkedThreshold,
    onComplete: () => {
      onChunkedComplete?.();
      handleClear();
    },
    onError: () => {
      setUploading(false);
    },
  });

  const isActive =
    uploading ||
    chunked.status === "uploading" ||
    chunked.status === "hashing" ||
    chunked.status === "finalizing" ||
    chunked.status === "paused";

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      setSimpleProgress(0);
      setShowResumePrompt(false);
      setError(null);

      if (repositoryKey && f.size >= chunkedThreshold) {
        if (chunked.hasPendingSession(f)) {
          setShowResumePrompt(true);
        }
      }
    },
    [repositoryKey, chunkedThreshold, chunked]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setSimpleProgress(0);
    setCustomPath("");
    setShowResumePrompt(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setSimpleProgress(0);
    setShowResumePrompt(false);
    setError(null);

    try {
      if (isChunkedMode) {
        await chunked.upload(file, customPath || undefined);
      } else {
        await onUpload(file, customPath || undefined);
        handleClear();
      }
    } catch (err) {
      if (!isChunkedMode) {
        const message =
          err instanceof Error ? err.message : "Upload failed";
        setError(message);
      }
    } finally {
      if (!isChunkedMode) {
        setUploading(false);
        setSimpleProgress(0);
      }
    }
  }, [file, customPath, isChunkedMode, chunked, onUpload, handleClear]);

  const handleCancel = useCallback(() => {
    if (isChunkedMode && isActive) {
      chunked.cancel();
      setUploading(false);
    }
    handleClear();
  }, [isChunkedMode, isActive, chunked, handleClear]);

  // Reset uploading state when chunked upload completes or errors
  useEffect(() => {
    if (chunked.status === "complete" || chunked.status === "error") {
      setUploading(false);
    }
  }, [chunked.status]);

  return (
    <div className={cn("space-y-4", className)}>
      {showPathInput && (
        <div className="space-y-2">
          <Label htmlFor="upload-path">Custom path (optional)</Label>
          <Input
            id="upload-path"
            placeholder="e.g. libs/mylib-1.0.jar"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            disabled={isActive}
          />
        </div>
      )}

      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isActive && "pointer-events-none opacity-60"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={!file ? handleBrowse : undefined}
        onKeyDown={
          !file
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleBrowse();
                }
              }
            : undefined
        }
        role={!file ? "button" : undefined}
        tabIndex={!file ? 0 : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {file ? (
          <div className="flex items-center gap-3">
            <FileIcon className="size-5 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="text-muted-foreground">
                {formatBytes(file.size)}
                {isChunkedMode && (
                  <span className="ml-2 text-xs opacity-70">(chunked upload)</span>
                )}
              </p>
            </div>
            {!isActive && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground/60" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a single artifact file
              </p>
            </div>
          </>
        )}
      </div>

      {/* Resume prompt for interrupted chunked uploads */}
      {showResumePrompt && !isActive && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <RotateCcw className="size-4 text-amber-500 shrink-0" />
          <span className="text-muted-foreground">
            A previous upload session was found for this file. Uploading will
            resume from where it left off.
          </span>
        </div>
      )}

      {/* Chunked upload progress */}
      {isChunkedMode && isActive && (
        <ChunkedProgressDisplay
          progress={chunked.progress}
          status={chunked.status}
        />
      )}

      {/* Simple upload progress */}
      {!isChunkedMode && uploading && (
        <div className="space-y-1.5">
          <Progress value={simpleProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-center">
            Uploading... {simpleProgress}%
          </p>
        </div>
      )}

      {(error || (chunked.status === "error" && chunked.error)) && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <p>{error ?? `Upload failed: ${chunked.error?.message}`}</p>
        </div>
      )}

      {file && (
        <div className="flex gap-2 justify-end">
          {/* Pause/Resume for chunked uploads */}
          {isChunkedMode && chunked.status === "uploading" && (
            <Button variant="outline" size="sm" onClick={chunked.pause}>
              <Pause className="size-3.5 mr-1.5" />
              Pause
            </Button>
          )}
          {isChunkedMode && chunked.status === "paused" && (
            <Button variant="outline" size="sm" onClick={chunked.resume}>
              <Play className="size-3.5 mr-1.5" />
              Resume
            </Button>
          )}

          <Button variant="outline" onClick={handleCancel} disabled={chunked.status === "finalizing"}>
            Cancel
          </Button>
          {!isActive && (
            <Button onClick={handleUpload}>
              {showResumePrompt ? "Resume Upload" : "Upload"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
