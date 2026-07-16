import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { storageApi } from "../storage";

describe("storageApi.getUsage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs the per-repository storage endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      logical_bytes: 100,
      physical_bytes: 40,
      dedup_scope: "per_repo",
      blob_count: 3,
      computed_at: "2026-07-15T00:00:00Z",
    });
    const result = await storageApi.getUsage("npm-local");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-local/storage",
    );
    expect(result.logical_bytes).toBe(100);
    expect(result.dedup_scope).toBe("per_repo");
  });

  it("encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue({
      logical_bytes: 0,
      dedup_scope: "instance",
      blob_count: 0,
      computed_at: "2026-07-15T00:00:00Z",
    });
    await storageApi.getUsage("a/b");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/a%2Fb/storage",
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("storage boom"));
    await expect(storageApi.getUsage("npm-local")).rejects.toThrow(
      "storage boom",
    );
  });
});

describe("storageApi.runGc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs a dry-run by default", async () => {
    mockApiFetch.mockResolvedValue({
      artifacts_removed: 0,
      bytes_freed: 2048,
      dry_run: true,
      errors: [],
      storage_keys_deleted: 5,
    });
    const result = await storageApi.runGc("npm-local");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-local/storage-gc",
      { method: "POST", body: JSON.stringify({ dry_run: true }) },
    );
    expect(result.bytes_freed).toBe(2048);
    expect(result.dry_run).toBe(true);
  });

  it("can request a real (non-dry-run) GC", async () => {
    mockApiFetch.mockResolvedValue({
      artifacts_removed: 1,
      bytes_freed: 10,
      dry_run: false,
      errors: [],
      storage_keys_deleted: 1,
    });
    await storageApi.runGc("npm-local", false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-local/storage-gc",
      { method: "POST", body: JSON.stringify({ dry_run: false }) },
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("gc boom"));
    await expect(storageApi.runGc("npm-local")).rejects.toThrow("gc boom");
  });
});
