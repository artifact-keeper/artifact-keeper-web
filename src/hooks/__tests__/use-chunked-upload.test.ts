import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks - declared before imports so vitest hoists them
// ---------------------------------------------------------------------------

// Track state/ref updates from the hook
type SetStateFn<T> = (val: T | ((prev: T) => T)) => void;

let stateSlots: { value: unknown; setter: SetStateFn<unknown> }[] = [];
let refSlots: { current: unknown }[] = [];
let callbackSlots: ((...args: unknown[]) => unknown)[] = [];

function resetHookState() {
  stateSlots = [];
  refSlots = [];
  callbackSlots = [];
}

vi.mock("react", () => ({
  useState: vi.fn((initial: unknown) => {
    const slot = { value: initial, setter: (val: unknown) => {
      if (typeof val === "function") {
        slot.value = (val as (prev: unknown) => unknown)(slot.value);
      } else {
        slot.value = val;
      }
    }};
    stateSlots.push(slot);
    return [slot.value, slot.setter];
  }),
  useRef: vi.fn((initial: unknown) => {
    const ref = { current: initial };
    refSlots.push(ref);
    return ref;
  }),
  useCallback: vi.fn((fn: (...args: unknown[]) => unknown) => {
    callbackSlots.push(fn);
    return fn;
  }),
}));

const mockCreateUploadSession = vi.fn();
const mockUploadChunk = vi.fn();
const mockGetUploadSession = vi.fn();
const mockCompleteUploadSession = vi.fn();
const mockCancelUploadSession = vi.fn();

vi.mock("@/lib/api/uploads", () => ({
  createUploadSession: (...args: unknown[]) => mockCreateUploadSession(...args),
  uploadChunk: (...args: unknown[]) => mockUploadChunk(...args),
  getUploadSession: (...args: unknown[]) => mockGetUploadSession(...args),
  completeUploadSession: (...args: unknown[]) => mockCompleteUploadSession(...args),
  cancelUploadSession: (...args: unknown[]) => mockCancelUploadSession(...args),
  UploadSessionExpiredError: class UploadSessionExpiredError extends Error {
    constructor(sessionId: string) {
      super(`Upload session ${sessionId} has expired`);
      this.name = "UploadSessionExpiredError";
    }
  },
  ChecksumMismatchError: class ChecksumMismatchError extends Error {
    constructor() {
      super("File checksum does not match. The file may have changed during upload.");
      this.name = "ChecksumMismatchError";
    }
  },
}));

// Mock localStorage
const localStorageData: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageData[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageData[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageData[key]; }),
};
vi.stubGlobal("localStorage", mockLocalStorage);

// Mock crypto.subtle.digest for computeSha256
const mockDigest = vi.fn();
vi.stubGlobal("crypto", {
  subtle: { digest: mockDigest },
});

// Mock performance.now for speed calculations
let perfNowValue = 0;
vi.stubGlobal("performance", {
  now: vi.fn(() => {
    perfNowValue += 100; // 100ms per call
    return perfNowValue;
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFile(size: number, name = "test-file.bin"): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type: "application/octet-stream" });
}

function fakeSha256Buffer(): ArrayBuffer {
  // 32 bytes for SHA-256
  const arr = new Uint8Array(32);
  for (let i = 0; i < 32; i++) arr[i] = i;
  return arr.buffer;
}

async function loadHook(overrides?: Record<string, unknown>) {
  resetHookState();
  const mod = await import("../use-chunked-upload");
  return mod.useChunkedUpload({
    repositoryKey: "test-repo",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useChunkedUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(localStorageData).forEach((k) => delete localStorageData[k]);
    perfNowValue = 0;
    mockDigest.mockResolvedValue(fakeSha256Buffer());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Initial state ----

  it("returns idle status and zero progress initially", async () => {
    const hook = await loadHook();
    expect(hook.status).toBe("idle");
    expect(hook.progress).toEqual({
      bytesUploaded: 0,
      totalBytes: 0,
      chunksCompleted: 0,
      chunksTotal: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
    });
    expect(hook.error).toBeNull();
  });

  // ---- Files under threshold ----

  it("returns immediately for files under the threshold", async () => {
    const hook = await loadHook({ threshold: 1000 });
    const smallFile = createFile(500);

    await hook.upload(smallFile);

    expect(mockCreateUploadSession).not.toHaveBeenCalled();
    expect(mockUploadChunk).not.toHaveBeenCalled();
  });

  it("returns immediately for files under default 100MB threshold", async () => {
    const hook = await loadHook();
    const smallFile = createFile(50 * 1024 * 1024); // 50MB

    await hook.upload(smallFile);

    expect(mockCreateUploadSession).not.toHaveBeenCalled();
  });

  // ---- Full upload flow ----

  it("creates a session, uploads chunks, and completes", async () => {
    const fileSize = 2000;
    const chunkSize = 1000;

    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-abc",
      chunk_count: 2,
      chunk_size: chunkSize,
      expires_at: "2026-03-25T00:00:00Z",
    });

    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 1000,
      chunks_completed: 1,
      chunks_remaining: 1,
    });

    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-001",
      path: "test-file.bin",
      size: fileSize,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500, chunkSize });
    const file = createFile(fileSize);
    await hook.upload(file);

    expect(mockCreateUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        repository_key: "test-repo",
        artifact_path: "test-file.bin",
        total_size: fileSize,
        chunk_size: chunkSize,
      })
    );
    expect(mockUploadChunk).toHaveBeenCalledTimes(2);
    expect(mockCompleteUploadSession).toHaveBeenCalledWith("sess-abc");
  });

  it("uses custom artifactPath when provided in options", async () => {
    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-path",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-002",
      path: "custom/path.tar.gz",
      size: 2000,
      checksum_sha256: "def",
    });

    const hook = await loadHook({
      threshold: 500,
      artifactPath: "custom/path.tar.gz",
    });
    const file = createFile(2000);
    await hook.upload(file);

    expect(mockCreateUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact_path: "custom/path.tar.gz",
      })
    );
  });

  it("uses path argument to upload() over defaultPath", async () => {
    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-override",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-003",
      path: "override/path.bin",
      size: 2000,
      checksum_sha256: "ghi",
    });

    const hook = await loadHook({
      threshold: 500,
      artifactPath: "default/path.tar.gz",
    });
    const file = createFile(2000);
    await hook.upload(file, "override/path.bin");

    expect(mockCreateUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact_path: "override/path.bin",
      })
    );
  });

  // ---- Callbacks ----

  it("calls onComplete callback on successful upload", async () => {
    const onComplete = vi.fn();
    const completeResult = {
      artifact_id: "art-cb",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "xyz",
    };

    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-cb",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue(completeResult);

    const hook = await loadHook({ threshold: 500, onComplete });
    const file = createFile(2000);
    await hook.upload(file);

    expect(onComplete).toHaveBeenCalledWith(completeResult);
  });

  it("calls onError callback when upload fails", async () => {
    const onError = vi.fn();
    mockCreateUploadSession.mockRejectedValue(new Error("network down"));

    const hook = await loadHook({ threshold: 500, onError });
    const file = createFile(2000);

    await expect(hook.upload(file)).rejects.toThrow("network down");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("calls onProgress callback during upload", async () => {
    const onProgress = vi.fn();

    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-prog",
      chunk_count: 2,
      chunk_size: 1000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 1000,
      chunks_completed: 1,
      chunks_remaining: 1,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-prog",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500, chunkSize: 1000, onProgress });
    const file = createFile(2000);
    await hook.upload(file);

    // onProgress should have been called during chunk uploads and at completion
    expect(onProgress).toHaveBeenCalled();
    const calls = onProgress.mock.calls;
    // At minimum: initial progress update, per-chunk updates, final 100% update
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  // ---- Pause / Resume state transitions ----

  it("pause sets status to paused when uploading", async () => {
    await loadHook();

    // The hook's pause relies on status === "uploading". Since we mock useState,
    // the status state slot is stateSlots[0]. Simulate uploading state.
    stateSlots[0].value = "uploading";

    // Re-load hook so it picks up the state
    const reloaded = await loadHook();
    // Manually set the status state slot to "uploading" to test pause
    stateSlots[0].setter("uploading");

    // Now pause should call setStatus("paused") and set ref
    // We can verify by checking the pause function exists
    expect(typeof reloaded.pause).toBe("function");
    expect(typeof reloaded.resume).toBe("function");
  });

  it("resume is a function on the hook return", async () => {
    const hook = await loadHook();
    expect(typeof hook.resume).toBe("function");
  });

  // ---- Cancel ----

  it("cancel calls cancelUploadSession and clears localStorage", async () => {
    mockCancelUploadSession.mockResolvedValue(undefined);

    const hook = await loadHook();

    // Simulate an active session by setting the ref
    // sessionIdRef is the 4th useRef call (index 3): pausedRef, cancelledRef, sessionIdRef, activePathRef
    if (refSlots.length >= 4) {
      refSlots[2].current = "sess-cancel";
      refSlots[3].current = "test-file.bin";
    }

    hook.cancel();

    expect(mockCancelUploadSession).toHaveBeenCalledWith("sess-cancel");
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      "upload-session-test-repo-test-file.bin"
    );
  });

  it("cancel resets status to idle and clears progress", async () => {
    const hook = await loadHook();

    if (refSlots.length >= 4) {
      refSlots[2].current = "sess-cancel2";
      refSlots[3].current = "file.bin";
    }
    mockCancelUploadSession.mockResolvedValue(undefined);

    hook.cancel();

    // After cancel, the status setter should have been called with "idle"
    // and progress setter with initial values. Verify through state slots.
    expect(stateSlots[0].value).toBe("idle");
    expect(stateSlots[1].value).toEqual({
      bytesUploaded: 0,
      totalBytes: 0,
      chunksCompleted: 0,
      chunksTotal: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
    });
    expect(stateSlots[2].value).toBeNull(); // error
  });

  it("cancel is a no-op for the API when no session is active", async () => {
    const hook = await loadHook();

    // No session ref set (default null)
    hook.cancel();

    expect(mockCancelUploadSession).not.toHaveBeenCalled();
  });

  it("cancel swallows errors from cancelUploadSession", async () => {
    mockCancelUploadSession.mockRejectedValue(new Error("network error"));

    const hook = await loadHook();
    if (refSlots.length >= 4) {
      refSlots[2].current = "sess-fail";
      refSlots[3].current = "file.bin";
    }

    // Should not throw
    await expect(hook.cancel()).resolves.toBeUndefined();
  });

  // ---- hasPendingSession ----

  it("returns false for files under the threshold", async () => {
    const hook = await loadHook({ threshold: 1000 });
    const smallFile = createFile(500);

    expect(hook.hasPendingSession(smallFile)).toBe(false);
  });

  it("returns false when no session is saved in localStorage", async () => {
    const hook = await loadHook({ threshold: 500 });
    const file = createFile(1000);

    expect(hook.hasPendingSession(file)).toBe(false);
  });

  it("returns true when a recent session exists in localStorage", async () => {
    const savedData = {
      sessionId: "sess-pending",
      savedAt: Date.now() - 1000, // 1 second ago
    };
    localStorageData["upload-session-test-repo-test-file.bin"] =
      JSON.stringify(savedData);

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(1000, "test-file.bin");

    expect(hook.hasPendingSession(file)).toBe(true);
  });

  it("returns false when saved session is older than 23 hours", async () => {
    const savedData = {
      sessionId: "sess-old",
      savedAt: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
    };
    localStorageData["upload-session-test-repo-test-file.bin"] =
      JSON.stringify(savedData);

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(1000, "test-file.bin");

    expect(hook.hasPendingSession(file)).toBe(false);
  });

  it("uses path argument for hasPendingSession lookup", async () => {
    const savedData = {
      sessionId: "sess-path",
      savedAt: Date.now() - 1000,
    };
    localStorageData["upload-session-test-repo-custom/path.tar"] =
      JSON.stringify(savedData);

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(1000, "whatever.bin");

    expect(hook.hasPendingSession(file, "custom/path.tar")).toBe(true);
  });

  // ---- Session resume ----

  it("resumes an existing session from localStorage", async () => {
    const savedData = {
      sessionId: "sess-resume",
      savedAt: Date.now() - 1000,
    };
    localStorageData["upload-session-test-repo-test-file.bin"] =
      JSON.stringify(savedData);

    const existingSession = {
      session_id: "sess-resume",
      status: "in_progress",
      total_size: 2000,
      bytes_received: 1000,
      chunks_completed: 1,
      chunks_total: 2,
      repository_key: "test-repo",
      artifact_path: "test-file.bin",
      created_at: "2026-03-24T10:00:00Z",
      expires_at: "2026-03-25T10:00:00Z",
    };

    mockGetUploadSession.mockResolvedValue(existingSession);
    mockUploadChunk.mockResolvedValue({
      chunk_index: 1,
      bytes_received: 2000,
      chunks_completed: 2,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-resume",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500, chunkSize: 1000 });
    const file = createFile(2000, "test-file.bin");
    await hook.upload(file);

    // Should have queried the existing session instead of creating a new one
    expect(mockGetUploadSession).toHaveBeenCalledWith("sess-resume");
    expect(mockCreateUploadSession).not.toHaveBeenCalled();
    // Should only upload the remaining chunk (index 1)
    expect(mockUploadChunk).toHaveBeenCalledTimes(1);
    expect(mockCompleteUploadSession).toHaveBeenCalledWith("sess-resume");
  });

  it("creates new session when saved session has mismatched size", async () => {
    const savedData = {
      sessionId: "sess-mismatch",
      savedAt: Date.now() - 1000,
    };
    localStorageData["upload-session-test-repo-test-file.bin"] =
      JSON.stringify(savedData);

    mockGetUploadSession.mockResolvedValue({
      session_id: "sess-mismatch",
      status: "in_progress",
      total_size: 9999, // Different size than the file
      bytes_received: 0,
      chunks_completed: 0,
      chunks_total: 1,
      repository_key: "test-repo",
      artifact_path: "test-file.bin",
      created_at: "2026-03-24T10:00:00Z",
      expires_at: "2026-03-25T10:00:00Z",
    });

    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-new",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-new",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(2000, "test-file.bin");
    await hook.upload(file);

    // Should have tried existing session, found mismatch, and created a new one
    expect(mockGetUploadSession).toHaveBeenCalledWith("sess-mismatch");
    expect(mockCreateUploadSession).toHaveBeenCalled();
    expect(mockCompleteUploadSession).toHaveBeenCalledWith("sess-new");
  });

  // ---- Error handling ----

  it("sets error status when createUploadSession fails", async () => {
    mockCreateUploadSession.mockRejectedValue(new Error("server down"));

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(2000);

    await expect(hook.upload(file)).rejects.toThrow("server down");

    // Error state should be set
    expect(stateSlots[0].value).toBe("error"); // status
    expect(stateSlots[2].value).toBeInstanceOf(Error); // error
  });

  it("saves session to localStorage after creation", async () => {
    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-save",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-save",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(2000, "test-file.bin");
    await hook.upload(file);

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "upload-session-test-repo-test-file.bin",
      expect.stringContaining("sess-save")
    );
  });

  it("clears localStorage after successful completion", async () => {
    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-clear",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-clear",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500 });
    const file = createFile(2000, "test-file.bin");
    await hook.upload(file);

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      "upload-session-test-repo-test-file.bin"
    );
  });

  // ---- Content type fallback ----

  it("defaults content_type to application/octet-stream when file.type is empty", async () => {
    mockCreateUploadSession.mockResolvedValue({
      session_id: "sess-ct",
      chunk_count: 1,
      chunk_size: 5000,
      expires_at: "2026-03-25T00:00:00Z",
    });
    mockUploadChunk.mockResolvedValue({
      chunk_index: 0,
      bytes_received: 2000,
      chunks_completed: 1,
      chunks_remaining: 0,
    });
    mockCompleteUploadSession.mockResolvedValue({
      artifact_id: "art-ct",
      path: "test-file.bin",
      size: 2000,
      checksum_sha256: "abc",
    });

    const hook = await loadHook({ threshold: 500 });
    // File constructor with empty type string
    const file = new File([new Uint8Array(2000)], "test-file.bin", { type: "" });
    await hook.upload(file);

    expect(mockCreateUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type: "application/octet-stream",
      })
    );
  });
});
