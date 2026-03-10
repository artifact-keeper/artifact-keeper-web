import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockListRepositories = vi.fn();
const mockListArtifacts = vi.fn();
const mockPromoteArtifact = vi.fn();
const mockPromoteArtifactsBulk = vi.fn();
const mockPromotionHistory = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listRepositories: (...args: unknown[]) => mockListRepositories(...args),
  listArtifacts: (...args: unknown[]) => mockListArtifacts(...args),
  promoteArtifact: (...args: unknown[]) => mockPromoteArtifact(...args),
  promoteArtifactsBulk: (...args: unknown[]) => mockPromoteArtifactsBulk(...args),
  promotionHistory: (...args: unknown[]) => mockPromotionHistory(...args),
}));

describe("promotionApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listStagingRepos returns staging repositories", async () => {
    const data = { items: [{ key: "staging-1" }], pagination: { total: 1 } };
    mockListRepositories.mockResolvedValue({ data, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(await promotionApi.listStagingRepos()).toEqual(data);
  });

  it("listStagingRepos throws on error", async () => {
    mockListRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.listStagingRepos()).rejects.toBe("fail");
  });

  it("listStagingArtifacts returns artifacts", async () => {
    const data = { items: [{ id: "a1" }], pagination: { total: 1 } };
    mockListArtifacts.mockResolvedValue({ data, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(await promotionApi.listStagingArtifacts("staging-1")).toEqual(data);
  });

  it("listStagingArtifacts throws on error", async () => {
    mockListArtifacts.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.listStagingArtifacts("staging-1")).rejects.toBe("fail");
  });

  it("listReleaseRepos returns local repositories", async () => {
    const data = { items: [{ key: "release-1" }] };
    mockListRepositories.mockResolvedValue({ data, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(await promotionApi.listReleaseRepos()).toEqual(data);
  });

  it("listReleaseRepos throws on error", async () => {
    mockListRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.listReleaseRepos()).rejects.toBe("fail");
  });

  it("promoteArtifact returns response", async () => {
    const resp = { promoted: true };
    mockPromoteArtifact.mockResolvedValue({ data: resp, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(
      await promotionApi.promoteArtifact("staging-1", "a1", { target_repository_key: "release-1" } as any)
    ).toEqual(resp);
  });

  it("promoteArtifact throws on error", async () => {
    mockPromoteArtifact.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.promoteArtifact("s", "a", {} as any)).rejects.toBe("fail");
  });

  it("promoteBulk returns response", async () => {
    const resp = { promoted: 3, failed: 0 };
    mockPromoteArtifactsBulk.mockResolvedValue({ data: resp, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(
      await promotionApi.promoteBulk("staging-1", { artifact_ids: ["a1", "a2", "a3"], target_repository_key: "release-1" } as any)
    ).toEqual(resp);
  });

  it("promoteBulk throws on error", async () => {
    mockPromoteArtifactsBulk.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.promoteBulk("s", {} as any)).rejects.toBe("fail");
  });

  it("getPromotionHistory returns history", async () => {
    const history = { items: [{ id: "h1" }] };
    mockPromotionHistory.mockResolvedValue({ data: history, error: undefined });
    const { promotionApi } = await import("../promotion");
    expect(await promotionApi.getPromotionHistory("staging-1")).toEqual(history);
  });

  it("getPromotionHistory throws on error", async () => {
    mockPromotionHistory.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.getPromotionHistory("staging-1")).rejects.toBe("fail");
  });

  it("rejectArtifact calls fetch and returns response", async () => {
    const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ rejected: true }) };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { promotionApi } = await import("../promotion");
    const result = await promotionApi.rejectArtifact("staging-1", "a1", { reason: "bad quality" } as any);
    expect(result).toEqual({ rejected: true });

    // Restore
    vi.restoreAllMocks();
  });

  it("rejectArtifact throws on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Invalid artifact" }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.rejectArtifact("staging-1", "a1", { reason: "test" } as any)
    ).rejects.toThrow("Invalid artifact");

    vi.restoreAllMocks();
  });

  it("rejectArtifact handles non-JSON error response", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.rejectArtifact("staging-1", "a1", { reason: "test" } as any)
    ).rejects.toThrow("Rejection failed: 500");

    vi.restoreAllMocks();
  });
});
