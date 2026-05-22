import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RepositoryListResponse as SdkRepositoryListResponse,
  ArtifactListResponse as SdkArtifactListResponse,
  PromotionResponse as SdkPromotionResponse,
  BulkPromotionResponse as SdkBulkPromotionResponse,
  PromotionHistoryResponse as SdkPromotionHistoryResponse,
  RepositoryResponse as SdkRepositoryResponse,
  ArtifactResponse as SdkArtifactResponse,
} from "@artifact-keeper/sdk";

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

const SDK_REPO: SdkRepositoryResponse = {
  id: "r1",
  key: "staging-1",
  name: "Staging 1",
  description: null,
  format: "maven",
  repo_type: "staging",
  is_public: false,
  storage_used_bytes: 0,
  quota_bytes: null,
  upstream_url: null,
  upstream_auth_type: null,
  upstream_auth_configured: false,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_REPO_LIST: SdkRepositoryListResponse = {
  items: [SDK_REPO],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};

const SDK_ARTIFACT: SdkArtifactResponse = {
  id: "a1",
  repository_key: "staging-1",
  path: "/a/b.jar",
  name: "b.jar",
  version: "1.0",
  size_bytes: 1024,
  checksum_sha256: "abc",
  content_type: "application/java-archive",
  download_count: 0,
  created_at: "2026-04-01T00:00:00Z",
  metadata: null,
};

const SDK_ARTIFACT_LIST: SdkArtifactListResponse = {
  items: [SDK_ARTIFACT],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};

const SDK_PROMOTION: SdkPromotionResponse = {
  promoted: true,
  source: "staging-1",
  target: "release-1",
  promotion_id: "p1",
  policy_violations: [],
  message: "ok",
};

const SDK_BULK_PROMOTION: SdkBulkPromotionResponse = {
  total: 3,
  promoted: 3,
  failed: 0,
  results: [SDK_PROMOTION],
};

const SDK_HISTORY: SdkPromotionHistoryResponse = {
  items: [
    {
      id: "h1",
      artifact_id: "a1",
      artifact_path: "/a/b.jar",
      source_repo_key: "staging-1",
      target_repo_key: "release-1",
      promoted_by: "u1",
      promoted_by_username: "alice",
      policy_result: { passed: true, violations: [] },
      notes: "ok",
      status: "promoted",
      rejection_reason: null,
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};

describe("promotionApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listStagingRepos returns staging repositories", async () => {
    mockListRepositories.mockResolvedValue({
      data: SDK_REPO_LIST,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.listStagingRepos();
    expect(out.items[0].key).toBe("staging-1");
    expect(out.pagination.total).toBe(1);
  });

  it("listStagingRepos passes type=staging", async () => {
    mockListRepositories.mockResolvedValue({
      data: SDK_REPO_LIST,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    await promotionApi.listStagingRepos({ format: "maven" });
    expect(mockListRepositories).toHaveBeenCalledWith({
      query: { format: "maven", type: "staging" },
    });
  });

  it("listStagingRepos throws on error", async () => {
    mockListRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.listStagingRepos()).rejects.toBe("fail");
  });

  it("listStagingArtifacts returns artifacts", async () => {
    mockListArtifacts.mockResolvedValue({
      data: SDK_ARTIFACT_LIST,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.listStagingArtifacts("staging-1");
    expect(out.items[0].id).toBe("a1");
  });

  it("listStagingArtifacts throws on error", async () => {
    mockListArtifacts.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.listStagingArtifacts("staging-1"),
    ).rejects.toBe("fail");
  });

  it("listReleaseRepos pins type=local + per_page=100 (#359)", async () => {
    mockListRepositories.mockResolvedValue({
      data: SDK_REPO_LIST,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    await promotionApi.listReleaseRepos({ format: "maven" });
    expect(mockListRepositories).toHaveBeenCalledWith({
      query: { format: "maven", type: "local", per_page: 100 },
    });
  });

  it("listReleaseRepos throws on error", async () => {
    mockListRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(promotionApi.listReleaseRepos()).rejects.toBe("fail");
  });

  it("promoteArtifact returns response", async () => {
    mockPromoteArtifact.mockResolvedValue({
      data: SDK_PROMOTION,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.promoteArtifact("staging-1", "a1", {
      target_repository: "release-1",
    });
    expect(out.promoted).toBe(true);
    expect(out.promotion_id).toBe("p1");
  });

  it("promoteArtifact forwards body fields (#359)", async () => {
    mockPromoteArtifact.mockResolvedValue({
      data: SDK_PROMOTION,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    await promotionApi.promoteArtifact("staging-1", "a1", {
      target_repository: "release-1",
      skip_policy_check: true,
      notes: "promote it",
    });
    expect(mockPromoteArtifact).toHaveBeenCalledWith({
      path: { key: "staging-1", artifact_id: "a1" },
      body: {
        target_repository: "release-1",
        skip_policy_check: true,
        notes: "promote it",
      },
    });
  });

  it("promoteArtifact narrows unknown violation severity to info (#359)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPromoteArtifact.mockResolvedValue({
      data: {
        ...SDK_PROMOTION,
        policy_violations: [{ rule: "X", severity: "weird", message: "y" }],
      },
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.promoteArtifact("staging-1", "a1", {
      target_repository: "release-1",
    });
    expect(out.policy_violations[0].severity).toBe("info");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("promoteArtifact throws on error", async () => {
    mockPromoteArtifact.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.promoteArtifact("s", "a", { target_repository: "x" }),
    ).rejects.toBe("fail");
  });

  it("promoteBulk returns response", async () => {
    mockPromoteArtifactsBulk.mockResolvedValue({
      data: SDK_BULK_PROMOTION,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.promoteBulk("staging-1", {
      artifact_ids: ["a1", "a2", "a3"],
      target_repository: "release-1",
    });
    expect(out.total).toBe(3);
    expect(out.results[0].promoted).toBe(true);
  });

  it("promoteBulk throws on error", async () => {
    mockPromoteArtifactsBulk.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.promoteBulk("s", {
        artifact_ids: [],
        target_repository: "x",
      }),
    ).rejects.toBe("fail");
  });

  it("getPromotionHistory returns history", async () => {
    mockPromotionHistory.mockResolvedValue({
      data: SDK_HISTORY,
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.getPromotionHistory("staging-1");
    expect(out.items[0].id).toBe("h1");
    expect(out.items[0].status).toBe("promoted");
    expect(out.pagination.total).toBe(1);
  });

  it("getPromotionHistory normalizes optional fields to undefined (#359)", async () => {
    mockPromotionHistory.mockResolvedValue({
      data: {
        ...SDK_HISTORY,
        items: [
          {
            ...SDK_HISTORY.items[0],
            promoted_by: null,
            promoted_by_username: null,
            policy_result: null,
            notes: null,
            rejection_reason: null,
          },
        ],
      },
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.getPromotionHistory("staging-1");
    expect(out.items[0].promoted_by).toBeUndefined();
    expect(out.items[0].promoted_by_username).toBeUndefined();
    expect(out.items[0].policy_result).toBeUndefined();
    expect(out.items[0].notes).toBeUndefined();
    expect(out.items[0].rejection_reason).toBeUndefined();
  });

  it("getPromotionHistory narrows unknown status (#359)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPromotionHistory.mockResolvedValue({
      data: {
        ...SDK_HISTORY,
        items: [{ ...SDK_HISTORY.items[0], status: "frobbed" }],
      },
      error: undefined,
    });
    const { promotionApi } = await import("../promotion");
    const out = await promotionApi.getPromotionHistory("staging-1");
    expect(out.items[0].status).toBe("pending_approval");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("getPromotionHistory throws on error", async () => {
    mockPromotionHistory.mockResolvedValue({ data: undefined, error: "fail" });
    const { promotionApi } = await import("../promotion");
    await expect(
      promotionApi.getPromotionHistory("staging-1"),
    ).rejects.toBe("fail");
  });

  it("rejectArtifact calls fetch and returns response", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ rejected: true }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const { promotionApi } = await import("../promotion");
    const result = await promotionApi.rejectArtifact("staging-1", "a1", {
      reason: "bad quality",
    });
    expect(result).toEqual({ rejected: true });

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
      promotionApi.rejectArtifact("staging-1", "a1", { reason: "test" }),
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
      promotionApi.rejectArtifact("staging-1", "a1", { reason: "test" }),
    ).rejects.toThrow("Rejection failed: 500");

    vi.restoreAllMocks();
  });
});
