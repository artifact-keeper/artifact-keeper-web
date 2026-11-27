import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListBuilds = vi.fn();
const mockGetBuild = vi.fn();
const mockCreateBuild = vi.fn();
const mockUpdateBuild = vi.fn();
const mockGetBuildDiff = vi.fn();

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/fetch")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@artifact-keeper/sdk", () => ({
  listBuilds: (...args: unknown[]) => mockListBuilds(...args),
  getBuild: (...args: unknown[]) => mockGetBuild(...args),
  createBuild: (...args: unknown[]) => mockCreateBuild(...args),
  updateBuild: (...args: unknown[]) => mockUpdateBuild(...args),
  getBuildDiff: (...args: unknown[]) => mockGetBuildDiff(...args),
}));

// Minimal SDK BuildResponse fixture; the adapter maps every field 1:1 with
// `null → undefined` normalization for optional fields.
function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    name: "build-1",
    number: 1,
    status: "success",
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    ...overrides,
  };
}

function adaptedBuildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    name: "build-1",
    number: 1,
    status: "success",
    started_at: undefined,
    finished_at: undefined,
    duration_ms: undefined,
    agent: undefined,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    artifact_count: undefined,
    modules: undefined,
    vcs_url: undefined,
    vcs_revision: undefined,
    vcs_branch: undefined,
    vcs_message: undefined,
    metadata: undefined,
    ...overrides,
  };
}

describe("buildsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deleteMany posts the ids and returns the per-id result", async () => {
    const result = { deleted: ["a"], failed: [{ id: "b", reason: "forbidden" }] };
    mockApiFetch.mockResolvedValue(result);
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.deleteMany(["a", "b"])).resolves.toEqual(result);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/builds/delete", {
      method: "POST",
      body: JSON.stringify({ ids: ["a", "b"] }),
    });
  });

  it("deleteMany splits more than 100 ids over several requests", async () => {
    mockApiFetch.mockImplementation((_path: string, init: RequestInit) => {
      const { ids } = JSON.parse(init.body as string) as { ids: string[] };
      return Promise.resolve({ deleted: ids, failed: [] });
    });
    const { buildsApi } = await import("../builds");
    const ids = Array.from({ length: 205 }, (_, i) => `b${i}`);
    const result = await buildsApi.deleteMany(ids);
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(result.deleted).toEqual(ids);
  });

  it("list returns paginated builds", async () => {
    const response = { items: [buildFixture()], pagination: { total: 1 } };
    mockListBuilds.mockResolvedValue({ data: response, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.list();
    expect(result).toEqual({
      items: [adaptedBuildFixture()],
      pagination: { total: 1 },
    });
  });

  it("list throws on error", async () => {
    mockListBuilds.mockResolvedValue({ data: undefined, error: "fail" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.list()).rejects.toBe("fail");
  });

  it("get returns a single build", async () => {
    mockGetBuild.mockResolvedValue({ data: buildFixture(), error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.get("b1");
    expect(result).toEqual(adaptedBuildFixture());
  });

  it("get throws on error", async () => {
    mockGetBuild.mockResolvedValue({ data: undefined, error: "not found" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.get("b1")).rejects.toBe("not found");
  });

  it("create returns created build", async () => {
    mockCreateBuild.mockResolvedValue({
      data: buildFixture({ id: "b2", name: "new-build" }),
      error: undefined,
    });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.create({ name: "new-build", build_number: 1 });
    expect(result).toEqual(adaptedBuildFixture({ id: "b2", name: "new-build" }));
  });

  it("create throws on error", async () => {
    mockCreateBuild.mockResolvedValue({ data: undefined, error: "conflict" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.create({ name: "x", build_number: 1 })).rejects.toBe("conflict");
  });

  it("updateStatus returns updated build", async () => {
    mockUpdateBuild.mockResolvedValue({
      data: buildFixture({ status: "success" }),
      error: undefined,
    });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.updateStatus("b1", { status: "success" });
    expect(result).toEqual(adaptedBuildFixture({ status: "success" }));
  });

  it("updateStatus throws on error", async () => {
    mockUpdateBuild.mockResolvedValue({ data: undefined, error: "fail" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.updateStatus("b1", { status: "x" })).rejects.toBe("fail");
  });

  it("diff returns build diff", async () => {
    const diff = {
      build_a: "b1",
      build_b: "b2",
      added: [],
      removed: [],
      modified: [],
    };
    mockGetBuildDiff.mockResolvedValue({ data: diff, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.diff("b1", "b2");
    expect(result).toEqual(diff);
  });

  it("diff throws on error", async () => {
    mockGetBuildDiff.mockResolvedValue({ data: undefined, error: "fail" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.diff("b1", "b2")).rejects.toBe("fail");
  });

  it("keeps every artifact of a module", async () => {
    const moduleWithTwoArtifacts = {
      id: "mod1",
      name: "mod-a",
      artifacts: [
        { name: "a1", path: "/a1", checksum_sha256: "sha-a1", size_bytes: 10 },
        { name: "a2", path: "/a2", checksum_sha256: "sha-a2", size_bytes: 20 },
      ],
    };
    mockGetBuild.mockResolvedValue({
      data: buildFixture({ modules: [moduleWithTwoArtifacts] }),
      error: undefined,
    });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.get("b1");
    expect(result.modules).toEqual([moduleWithTwoArtifacts]);
  });

  it("keeps the stored artifact link of an entry", async () => {
    const linked = {
      name: "app.jar",
      path: "libs/app.jar",
      checksum_sha256: "c",
      size_bytes: 1,
      artifact_id: "a-1",
      repository_key: "maven-releases",
      artifact_deleted: true,
    };
    mockGetBuild.mockResolvedValue({
      data: buildFixture({ modules: [{ id: "m", name: "app", artifacts: [linked] }] }),
      error: undefined,
    });
    mockGetBuildDiff.mockResolvedValue({
      data: { build_a: "b1", build_b: "b2", added: [linked], removed: [], modified: [] },
      error: undefined,
    });
    const { buildsApi } = await import("../builds");
    expect((await buildsApi.get("b1")).modules?.[0].artifacts[0]).toEqual(linked);
    expect((await buildsApi.diff("b1", "b2")).added[0]).toEqual(linked);
  });

  it("list sends the name, branch, agent and date filters", async () => {
    mockListBuilds.mockResolvedValue({ data: { items: [], pagination: { total: 0 } }, error: undefined });
    const { buildsApi } = await import("../builds");
    const query = {
      name: "app",
      branch: "main",
      agent: "runner-a",
      created_after: "2026-11-01T00:00:00Z",
      created_before: "2026-12-01T00:00:00Z",
    };
    await buildsApi.list(query);
    expect(mockListBuilds).toHaveBeenCalledWith({ query });
  });

  it("passes vcs fields and metadata through", async () => {
    const vcs = {
      vcs_url: "https://vcs.example.test/org/repo",
      vcs_revision: "0123abcd",
      vcs_branch: "main",
      vcs_message: "fix things",
      metadata: { pipeline_url: "https://ci.example.test/p/1" },
    };
    mockListBuilds.mockResolvedValue({
      data: { items: [buildFixture(vcs)], pagination: { total: 1 } },
      error: undefined,
    });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.list({ sort_by: "created_at" });
    expect(result.items[0]).toEqual(adaptedBuildFixture(vcs));
    expect(mockListBuilds).toHaveBeenCalledWith({ query: { sort_by: "created_at" } });
  });
});
