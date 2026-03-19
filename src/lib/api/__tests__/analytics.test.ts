import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("analyticsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStorageTrend returns data", async () => {
    const trend = [{ timestamp: "2025-01-01", total_bytes: 100 }];
    mockGetStorageTrend.mockResolvedValue({ data: trend, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getStorageTrend();
    expect(result).toEqual(trend);
  });

  it("getStorageTrend throws on error", async () => {
    mockGetStorageTrend.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../analytics");
    await expect(mod.default.getStorageTrend()).rejects.toBe("fail");
  });

  it("getStorageBreakdown returns data", async () => {
    const breakdown = [{ repo_id: "1", bytes: 500 }];
    mockGetStorageBreakdown.mockResolvedValue({ data: breakdown, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getStorageBreakdown();
    expect(result).toEqual(breakdown);
  });

  it("getStorageBreakdown throws on error", async () => {
    mockGetStorageBreakdown.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getStorageBreakdown()).rejects.toBe("err");
  });

  it("getGrowthSummary returns data", async () => {
    const summary = { growth_rate: 0.5 };
    mockGetGrowthSummary.mockResolvedValue({ data: summary, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getGrowthSummary();
    expect(result).toEqual(summary);
  });

  it("getGrowthSummary throws on error", async () => {
    mockGetGrowthSummary.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getGrowthSummary()).rejects.toBe("err");
  });

  it("getStaleArtifacts returns data", async () => {
    const stale = [{ id: "a1" }];
    mockGetStaleArtifacts.mockResolvedValue({ data: stale, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getStaleArtifacts();
    expect(result).toEqual(stale);
  });

  it("getStaleArtifacts throws on error", async () => {
    mockGetStaleArtifacts.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getStaleArtifacts()).rejects.toBe("err");
  });

  it("getDownloadTrends returns data", async () => {
    const trends = [{ date: "2025-01", downloads: 10 }];
    mockGetDownloadTrends.mockResolvedValue({ data: trends, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getDownloadTrends();
    expect(result).toEqual(trends);
  });

  it("getDownloadTrends throws on error", async () => {
    mockGetDownloadTrends.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getDownloadTrends()).rejects.toBe("err");
  });

  it("getRepositoryTrend passes repositoryId and params", async () => {
    const trend = [{ timestamp: "2025-01-01" }];
    mockGetRepositoryTrend.mockResolvedValue({ data: trend, error: undefined });
    const mod = await import("../analytics");
    const result = await mod.default.getRepositoryTrend("repo-1");
    expect(result).toEqual(trend);
    expect(mockGetRepositoryTrend).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: "repo-1" } })
    );
  });

  it("getRepositoryTrend throws on error", async () => {
    mockGetRepositoryTrend.mockResolvedValue({ data: undefined, error: "err" });
    const mod = await import("../analytics");
    await expect(mod.default.getRepositoryTrend("repo-1")).rejects.toBe("err");
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
