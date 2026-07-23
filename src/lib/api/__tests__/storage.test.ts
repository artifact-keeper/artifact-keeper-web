import { describe, it, expect, vi, beforeEach } from "vitest";

// getUsage now goes through the generated SDK; runGc stays on apiFetch (the
// per-repo /storage-gc operation is still absent from the SDK).
vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();
const mockAssertData = vi.fn(<T,>(d: T) => d);
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  assertData: <T,>(d: T) => mockAssertData(d),
  narrowEnum: <T extends string>(
    value: string,
    allowed: ReadonlySet<T>,
    fallback: T,
  ): T => (allowed.has(value as T) ? (value as T) : fallback),
}));

const mockGetRepositoryStorage = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  getRepositoryStorage: (...args: unknown[]) =>
    mockGetRepositoryStorage(...args),
}));

import { storageApi } from "../storage";

describe("storageApi.getUsage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the generated getRepositoryStorage operation with the key", async () => {
    mockGetRepositoryStorage.mockResolvedValue({
      data: {
        repository_key: "npm-local",
        logical_bytes: 100,
        physical_bytes: 40,
        unique_bytes: 30,
        shared_bytes: 10,
        dedup_ratio: 2.5,
        dedup_scope: "per_repo",
        blob_count: 3,
        instance_unique_bytes: 500,
        computed_at: "2026-07-15T00:00:00Z",
      },
      error: undefined,
    });

    const result = await storageApi.getUsage("npm-local");

    expect(mockGetRepositoryStorage).toHaveBeenCalledWith({
      path: { key: "npm-local" },
    });
    expect(result.logical_bytes).toBe(100);
    expect(result.physical_bytes).toBe(40);
    expect(result.dedup_scope).toBe("per_repo");
    expect(result.instance_unique_bytes).toBe(500);
  });

  it("passes the raw key through (the SDK client does path encoding)", async () => {
    mockGetRepositoryStorage.mockResolvedValue({
      data: {
        repository_key: "a/b",
        logical_bytes: 0,
        dedup_scope: "instance",
        blob_count: 0,
        computed_at: null,
      },
      error: undefined,
    });

    const result = await storageApi.getUsage("a/b");

    expect(mockGetRepositoryStorage).toHaveBeenCalledWith({
      path: { key: "a/b" },
    });
    // computed_at can be null before the first refresh has run.
    expect(result.computed_at).toBeNull();
  });

  it("narrows an unknown dedup_scope to 'instance'", async () => {
    mockGetRepositoryStorage.mockResolvedValue({
      data: {
        repository_key: "npm-local",
        logical_bytes: 1,
        dedup_scope: "galaxy-wide",
        blob_count: 1,
        computed_at: "2026-07-15T00:00:00Z",
      },
      error: undefined,
    });

    const result = await storageApi.getUsage("npm-local");
    expect(result.dedup_scope).toBe("instance");
  });

  it("throws when the SDK returns an error", async () => {
    mockGetRepositoryStorage.mockResolvedValue({
      data: undefined,
      error: { message: "storage boom" },
    });
    await expect(storageApi.getUsage("npm-local")).rejects.toEqual({
      message: "storage boom",
    });
  });

  it("throws on an empty success body (assertData guard)", async () => {
    mockAssertData.mockImplementationOnce(() => {
      throw new Error("Empty response body for storageApi.getUsage");
    });
    mockGetRepositoryStorage.mockResolvedValue({
      data: undefined,
      error: undefined,
    });
    await expect(storageApi.getUsage("npm-local")).rejects.toThrow(
      "Empty response body",
    );
  });
});

describe("storageApi.runGc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs a per-repo dry-run via apiFetch by default", async () => {
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
    // getUsage's SDK path must not be involved in the GC call.
    expect(mockGetRepositoryStorage).not.toHaveBeenCalled();
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

  it("encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue({
      artifacts_removed: 0,
      bytes_freed: 0,
      dry_run: true,
      errors: [],
      storage_keys_deleted: 0,
    });
    await storageApi.runGc("a/b");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/a%2Fb/storage-gc",
      { method: "POST", body: JSON.stringify({ dry_run: true }) },
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("gc boom"));
    await expect(storageApi.runGc("npm-local")).rejects.toThrow("gc boom");
  });
});
