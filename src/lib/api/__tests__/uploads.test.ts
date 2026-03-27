import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks - declared before imports so vitest hoists them
// ---------------------------------------------------------------------------

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  createUploadSession,
  uploadChunk,
  getUploadSession,
  completeUploadSession,
  cancelUploadSession,
  UploadSessionExpiredError,
  ChecksumMismatchError,
} from "../uploads";
import type {
  CreateSessionResponse,
  ChunkResult,
  UploadSession,
  CompleteResult,
} from "../uploads";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(options: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  textRejects?: boolean;
}): Response {
  const {
    ok = true,
    status = 200,
    json,
    text = "",
    textRejects = false,
  } = options;

  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
    text: textRejects
      ? vi.fn().mockRejectedValue(new Error("body read failed"))
      : vi.fn().mockResolvedValue(text),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploads API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- createUploadSession ----

  describe("createUploadSession", () => {
    it("calls apiFetch with POST and stringified body", async () => {
      const responseData: CreateSessionResponse = {
        session_id: "sess-001",
        chunk_count: 4,
        chunk_size: 8388608,
        expires_at: "2026-03-25T00:00:00Z",
      };
      mockApiFetch.mockResolvedValue(responseData);

      const result = await createUploadSession({
        repository_key: "my-repo",
        artifact_path: "pkg/foo-1.0.tar.gz",
        total_size: 33554432,
        checksum_sha256: "abcdef1234567890",
        chunk_size: 8388608,
        content_type: "application/gzip",
      });

      expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/uploads", {
        method: "POST",
        body: JSON.stringify({
          repository_key: "my-repo",
          artifact_path: "pkg/foo-1.0.tar.gz",
          total_size: 33554432,
          checksum_sha256: "abcdef1234567890",
          chunk_size: 8388608,
          content_type: "application/gzip",
        }),
      });
      expect(result).toEqual(responseData);
    });

    it("propagates errors from apiFetch", async () => {
      mockApiFetch.mockRejectedValue(new Error("API error 500: internal"));

      await expect(
        createUploadSession({
          repository_key: "r",
          artifact_path: "a",
          total_size: 100,
          checksum_sha256: "abc",
        })
      ).rejects.toThrow("API error 500: internal");
    });
  });

  // ---- uploadChunk ----

  describe("uploadChunk", () => {
    it("sends PATCH with correct Content-Range header", async () => {
      const chunkResult: ChunkResult = {
        chunk_index: 0,
        bytes_received: 8388608,
        chunks_completed: 1,
        chunks_remaining: 3,
      };
      mockFetch.mockResolvedValue(
        mockResponse({ ok: true, status: 200, json: chunkResult })
      );

      const blob = new Blob(["x".repeat(100)]);
      const result = await uploadChunk("sess-001", 0, 8388608, 33554432, blob);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/uploads/sess-001",
        expect.objectContaining({
          method: "PATCH",
          credentials: "include",
          body: blob,
        })
      );

      // Verify Content-Range header format: "bytes start-end/total"
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers["Content-Range"]).toBe("bytes 0-8388607/33554432");
      expect(headers["Content-Type"]).toBe("application/octet-stream");

      expect(result).toEqual(chunkResult);
    });

    it("throws UploadSessionExpiredError on 410 status", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 410, text: "gone" })
      );

      const blob = new Blob(["data"]);
      await expect(
        uploadChunk("expired-sess", 0, 100, 200, blob)
      ).rejects.toThrow(UploadSessionExpiredError);
    });

    it("throws generic error with status and body for other failures", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 500, text: "server error" })
      );

      const blob = new Blob(["data"]);
      await expect(
        uploadChunk("sess-001", 0, 100, 200, blob)
      ).rejects.toThrow("Chunk upload failed (500): server error");
    });

    it("throws with empty body when response.text() fails", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 502, textRejects: true })
      );

      const blob = new Blob(["data"]);
      await expect(
        uploadChunk("sess-001", 0, 100, 200, blob)
      ).rejects.toThrow("Chunk upload failed (502): ");
    });

    it("computes correct Content-Range for middle chunk", async () => {
      const chunkResult: ChunkResult = {
        chunk_index: 2,
        bytes_received: 24000,
        chunks_completed: 3,
        chunks_remaining: 1,
      };
      mockFetch.mockResolvedValue(
        mockResponse({ ok: true, status: 200, json: chunkResult })
      );

      const blob = new Blob(["chunk"]);
      await uploadChunk("sess-001", 16000, 24000, 32000, blob);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["Content-Range"]).toBe(
        "bytes 16000-23999/32000"
      );
    });
  });

  // ---- getUploadSession ----

  describe("getUploadSession", () => {
    it("fetches session status with GET", async () => {
      const session: UploadSession = {
        session_id: "sess-001",
        status: "in_progress",
        total_size: 33554432,
        bytes_received: 8388608,
        chunks_completed: 1,
        chunks_total: 4,
        repository_key: "my-repo",
        artifact_path: "pkg/foo-1.0.tar.gz",
        created_at: "2026-03-24T10:00:00Z",
        expires_at: "2026-03-25T10:00:00Z",
      };
      mockFetch.mockResolvedValue(
        mockResponse({ ok: true, status: 200, json: session })
      );

      const result = await getUploadSession("sess-001");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/uploads/sess-001",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        })
      );
      expect(result).toEqual(session);
    });

    it("throws UploadSessionExpiredError on 410 status", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 410, text: "expired" })
      );

      await expect(getUploadSession("old-sess")).rejects.toThrow(
        UploadSessionExpiredError
      );
    });

    it("throws generic error with status for other failures", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 404, text: "not found" })
      );

      await expect(getUploadSession("missing-sess")).rejects.toThrow(
        "Failed to get upload session (404): not found"
      );
    });

    it("throws with empty body when response.text() fails", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 503, textRejects: true })
      );

      await expect(getUploadSession("sess-001")).rejects.toThrow(
        "Failed to get upload session (503): "
      );
    });
  });

  // ---- completeUploadSession ----

  describe("completeUploadSession", () => {
    it("sends PUT to complete endpoint and returns result", async () => {
      const completeResult: CompleteResult = {
        artifact_id: "art-001",
        path: "pkg/foo-1.0.tar.gz",
        size: 33554432,
        checksum_sha256: "abcdef1234567890",
      };
      mockFetch.mockResolvedValue(
        mockResponse({ ok: true, status: 200, json: completeResult })
      );

      const result = await completeUploadSession("sess-001");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/uploads/sess-001/complete",
        expect.objectContaining({
          method: "PUT",
          credentials: "include",
        })
      );
      expect(result).toEqual(completeResult);
    });

    it("throws ChecksumMismatchError on 409 status", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 409, text: "checksum mismatch" })
      );

      await expect(completeUploadSession("sess-001")).rejects.toThrow(
        ChecksumMismatchError
      );
    });

    it("throws UploadSessionExpiredError on 410 status", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 410, text: "expired" })
      );

      await expect(completeUploadSession("sess-001")).rejects.toThrow(
        UploadSessionExpiredError
      );
    });

    it("throws generic error for other failure statuses", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 500, text: "internal error" })
      );

      await expect(completeUploadSession("sess-001")).rejects.toThrow(
        "Failed to finalize upload (500): internal error"
      );
    });

    it("throws with empty body when response.text() fails", async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ ok: false, status: 502, textRejects: true })
      );

      await expect(completeUploadSession("sess-001")).rejects.toThrow(
        "Failed to finalize upload (502): "
      );
    });
  });

  // ---- cancelUploadSession ----

  describe("cancelUploadSession", () => {
    it("calls apiFetch with DELETE for the session", async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await cancelUploadSession("sess-001");

      expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/uploads/sess-001", {
        method: "DELETE",
      });
    });

    it("propagates errors from apiFetch", async () => {
      mockApiFetch.mockRejectedValue(new Error("API error 404: Not Found"));

      await expect(cancelUploadSession("no-such")).rejects.toThrow(
        "API error 404: Not Found"
      );
    });
  });

  // ---- Error classes ----

  describe("UploadSessionExpiredError", () => {
    it("includes session ID in message", () => {
      const err = new UploadSessionExpiredError("sess-123");
      expect(err.message).toBe("Upload session sess-123 has expired");
      expect(err.name).toBe("UploadSessionExpiredError");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("ChecksumMismatchError", () => {
    it("has a descriptive message", () => {
      const err = new ChecksumMismatchError();
      expect(err.message).toBe(
        "File checksum does not match. The file may have changed during upload."
      );
      expect(err.name).toBe("ChecksumMismatchError");
      expect(err).toBeInstanceOf(Error);
    });
  });
});
