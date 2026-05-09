import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListBuilds = vi.fn();
const mockGetBuild = vi.fn();
const mockCreateBuild = vi.fn();
const mockUpdateBuild = vi.fn();
const mockGetBuildDiff = vi.fn();

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
});
