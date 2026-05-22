import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  StorageSnapshot as SdkStorageSnapshot,
  RepositorySnapshot as SdkRepositorySnapshot,
  RepositoryStorageBreakdown as SdkRepositoryStorageBreakdown,
  StaleArtifact as SdkStaleArtifact,
  GrowthSummary as SdkGrowthSummary,
  DownloadTrend as SdkDownloadTrend,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetStorageTrend = vi.fn();
const mockGetStorageBreakdown = vi.fn();
const mockGetGrowthSummary = vi.fn();
const mockGetStaleArtifacts = vi.fn();
const mockGetDownloadTrends = vi.fn();
const mockGetRepositoryTrend = vi.fn();
const mockCaptureSnapshot = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getStorageTrend: (...args: unknown[]) => mockGetStorageTrend(...args),
  getStorageBreakdown: (...args: unknown[]) => mockGetStorageBreakdown(...args),
  getGrowthSummary: (...args: unknown[]) => mockGetGrowthSummary(...args),
  getStaleArtifacts: (...args: unknown[]) => mockGetStaleArtifacts(...args),
  getDownloadTrends: (...args: unknown[]) => mockGetDownloadTrends(...args),
  getRepositoryTrend: (...args: unknown[]) => mockGetRepositoryTrend(...args),
  captureSnapshot: (...args: unknown[]) => mockCaptureSnapshot(...args),
}));

// Realistic SDK fixtures, typed as SDK types for compile-time drift detection.
const SDK_STORAGE: SdkStorageSnapshot = {
  snapshot_date: "2026-05-01",
  total_repositories: 10,
  total_artifacts: 100,
  total_storage_bytes: 1_073_741_824,
  total_downloads: 50,
  total_users: 5,
};

const SDK_REPO_SNAPSHOT: SdkRepositorySnapshot = {
  repository_id: "repo-a",
  repository_name: "main",
  repository_key: "main",
  snapshot_date: "2026-05-01",
  artifact_count: 25,
  storage_bytes: 100_000,
  download_count: 10,
};

const SDK_BREAKDOWN: SdkRepositoryStorageBreakdown = {
  repository_id: "repo-a",
  repository_key: "main",
  repository_name: "Main Repository",
  format: "maven",
  artifact_count: 25,
  storage_bytes: 100_000,
  download_count: 10,
  last_upload_at: "2026-04-30T00:00:00Z",
};

const SDK_STALE: SdkStaleArtifact = {
  artifact_id: "art-1",
  repository_key: "main",
  name: "old.jar",
  path: "/com/example/old.jar",
  size_bytes: 1024,
  created_at: "2025-01-01T00:00:00Z",
  last_downloaded_at: "2025-06-01T00:00:00Z",
  days_since_download: 300,
  download_count: 1,
};

const SDK_GROWTH: SdkGrowthSummary = {
  period_start: "2026-04-01",
  period_end: "2026-05-01",
  storage_bytes_start: 1_000_000,
  storage_bytes_end: 1_100_000,
  storage_growth_bytes: 100_000,
  storage_growth_percent: 10,
  artifacts_start: 100,
  artifacts_end: 110,
  artifacts_added: 10,
  downloads_in_period: 50,
};

const SDK_DOWNLOAD_TREND: SdkDownloadTrend = {
  date: "2026-05-01",
  download_count: 5,
};

describe("analyticsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStorageTrend returns data", async () => {
    mockGetStorageTrend.mockResolvedValue({
      data: [SDK_STORAGE],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getStorageTrend();
    expect(out).toEqual([SDK_STORAGE]);
  });

  it("getStorageTrend throws on error", async () => {
    mockGetStorageTrend.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../analytics");
    await expect(mod.default.getStorageTrend()).rejects.toBe("fail");
  });

  it("getStorageBreakdown returns data", async () => {
    mockGetStorageBreakdown.mockResolvedValue({
      data: [SDK_BREAKDOWN],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getStorageBreakdown();
    expect(out[0].repository_id).toBe("repo-a");
    expect(out[0].last_upload_at).toBe("2026-04-30T00:00:00Z");
  });

  it("getStorageBreakdown normalizes last_upload_at undefined to null (#359)", async () => {
    mockGetStorageBreakdown.mockResolvedValue({
      data: [{ ...SDK_BREAKDOWN, last_upload_at: undefined }],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getStorageBreakdown();
    expect(out[0].last_upload_at).toBeNull();
  });

  it("getStorageBreakdown throws on error", async () => {
    mockGetStorageBreakdown.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getStorageBreakdown()).rejects.toBe("err");
  });

  it("getGrowthSummary returns data", async () => {
    mockGetGrowthSummary.mockResolvedValue({
      data: SDK_GROWTH,
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getGrowthSummary();
    expect(out.storage_growth_bytes).toBe(100_000);
  });

  it("getGrowthSummary throws Empty response body when SDK returns no data (#359)", async () => {
    mockGetGrowthSummary.mockResolvedValue({ data: undefined, error: undefined });
    const mod = await import("../analytics");
    await expect(mod.default.getGrowthSummary()).rejects.toThrow(/Empty response body/);
  });

  it("getGrowthSummary throws on error", async () => {
    mockGetGrowthSummary.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getGrowthSummary()).rejects.toBe("err");
  });

  it("getStaleArtifacts returns data", async () => {
    mockGetStaleArtifacts.mockResolvedValue({
      data: [SDK_STALE],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getStaleArtifacts();
    expect(out[0].artifact_id).toBe("art-1");
    expect(out[0].last_downloaded_at).toBe("2025-06-01T00:00:00Z");
  });

  it("getStaleArtifacts normalizes last_downloaded_at undefined to null (#359)", async () => {
    mockGetStaleArtifacts.mockResolvedValue({
      data: [{ ...SDK_STALE, last_downloaded_at: undefined }],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getStaleArtifacts();
    expect(out[0].last_downloaded_at).toBeNull();
  });

  it("getStaleArtifacts throws on error", async () => {
    mockGetStaleArtifacts.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getStaleArtifacts()).rejects.toBe("err");
  });

  it("getDownloadTrends returns data", async () => {
    mockGetDownloadTrends.mockResolvedValue({
      data: [SDK_DOWNLOAD_TREND],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getDownloadTrends();
    expect(out).toEqual([SDK_DOWNLOAD_TREND]);
  });

  it("getDownloadTrends throws on error", async () => {
    mockGetDownloadTrends.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getDownloadTrends()).rejects.toBe("err");
  });

  it("getRepositoryTrend passes repositoryId and params", async () => {
    mockGetRepositoryTrend.mockResolvedValue({
      data: [SDK_REPO_SNAPSHOT],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getRepositoryTrend("repo-a");
    expect(out[0].repository_id).toBe("repo-a");
    expect(mockGetRepositoryTrend).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: "repo-a" } }),
    );
  });

  it("getRepositoryTrend normalizes repository_name/key undefined to null (#359)", async () => {
    mockGetRepositoryTrend.mockResolvedValue({
      data: [{ ...SDK_REPO_SNAPSHOT, repository_name: undefined, repository_key: undefined }],
      error: undefined,
    });
    const mod = await import("../analytics");
    const out = await mod.default.getRepositoryTrend("repo-a");
    expect(out[0].repository_name).toBeNull();
    expect(out[0].repository_key).toBeNull();
  });

  it("getRepositoryTrend throws on error", async () => {
    mockGetRepositoryTrend.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getRepositoryTrend("repo-a")).rejects.toBe("err");
  });

  it("captureSnapshot calls SDK", async () => {
    mockCaptureSnapshot.mockResolvedValue({ error: undefined });
    const mod = await import("../analytics");
    await mod.default.captureSnapshot();
    expect(mockCaptureSnapshot).toHaveBeenCalled();
  });

  it("captureSnapshot throws on error", async () => {
    mockCaptureSnapshot.mockResolvedValue({ error: "fail" });
    const mod = await import("../analytics");
    await expect(mod.default.captureSnapshot()).rejects.toBe("fail");
  });
});
