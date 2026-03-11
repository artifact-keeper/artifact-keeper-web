import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockListArtifacts = vi.fn();
const mockDeleteArtifact = vi.fn();
const mockCreateDownloadTicket = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listArtifacts: (...args: unknown[]) => mockListArtifacts(...args),
  deleteArtifact: (...args: unknown[]) => mockDeleteArtifact(...args),
  createDownloadTicket: (...args: unknown[]) => mockCreateDownloadTicket(...args),
}));

describe("artifactsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list returns paginated artifacts", async () => {
    const data = { items: [{ id: "a1" }], pagination: { total: 1 } };
    mockListArtifacts.mockResolvedValue({ data, error: undefined });
    const { artifactsApi } = await import("../artifacts");
    expect(await artifactsApi.list("repo-key")).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListArtifacts.mockResolvedValue({ data: undefined, error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.list("repo-key")).rejects.toBe("fail");
  });

  it("list maps search param to q for backwards compat", async () => {
    mockListArtifacts.mockResolvedValue({ data: { items: [] }, error: undefined });
    const { artifactsApi } = await import("../artifacts");
    await artifactsApi.list("repo-key", { search: "test" });
    expect(mockListArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ q: "test" }),
      })
    );
  });

  it("get fetches artifact metadata via fetch", async () => {
    const artifact = { id: "a1", path: "com/example/lib.jar" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(artifact),
    });

    const { artifactsApi } = await import("../artifacts");
    const result = await artifactsApi.get("repo-key", "com/example/lib.jar");
    expect(result).toEqual(artifact);

    vi.restoreAllMocks();
  });

  it("get throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const { artifactsApi } = await import("../artifacts");
    await expect(
      artifactsApi.get("repo-key", "missing.jar")
    ).rejects.toThrow("Failed to fetch artifact: 404");

    vi.restoreAllMocks();
  });

  it("delete calls SDK", async () => {
    mockDeleteArtifact.mockResolvedValue({ error: undefined });
    const { artifactsApi } = await import("../artifacts");
    await artifactsApi.delete("repo-key", "lib.jar");
    expect(mockDeleteArtifact).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeleteArtifact.mockResolvedValue({ error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.delete("repo-key", "lib.jar")).rejects.toBe("fail");
  });

  it("getDownloadUrl returns correct URL", async () => {
    const { artifactsApi } = await import("../artifacts");
    expect(artifactsApi.getDownloadUrl("repo-key", "com/lib.jar")).toBe(
      "/api/v1/repositories/repo-key/download/com/lib.jar"
    );
  });

  it("createDownloadTicket returns ticket string", async () => {
    mockCreateDownloadTicket.mockResolvedValue({
      data: { ticket: "tk123" },
      error: undefined,
    });
    const { artifactsApi } = await import("../artifacts");
    expect(await artifactsApi.createDownloadTicket("repo-key", "lib.jar")).toBe("tk123");
  });

  it("createDownloadTicket throws on error", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: undefined, error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.createDownloadTicket("repo-key", "lib.jar")).rejects.toBe("fail");
  });
});
