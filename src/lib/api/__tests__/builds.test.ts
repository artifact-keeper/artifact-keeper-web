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

describe("buildsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns paginated builds", async () => {
    const response = { items: [{ id: "b1" }], pagination: { total: 1 } };
    mockListBuilds.mockResolvedValue({ data: response, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.list();
    expect(result).toEqual(response);
  });

  it("list throws on error", async () => {
    mockListBuilds.mockResolvedValue({ data: undefined, error: "fail" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.list()).rejects.toBe("fail");
  });

  it("get returns a single build", async () => {
    const build = { id: "b1", name: "build-1" };
    mockGetBuild.mockResolvedValue({ data: build, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.get("b1");
    expect(result).toEqual(build);
  });

  it("get throws on error", async () => {
    mockGetBuild.mockResolvedValue({ data: undefined, error: "not found" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.get("b1")).rejects.toBe("not found");
  });

  it("create returns created build", async () => {
    const build = { id: "b2", name: "new-build" };
    mockCreateBuild.mockResolvedValue({ data: build, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.create({ name: "new-build", build_number: 1 });
    expect(result).toEqual(build);
  });

  it("create throws on error", async () => {
    mockCreateBuild.mockResolvedValue({ data: undefined, error: "conflict" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.create({ name: "x", build_number: 1 })).rejects.toBe("conflict");
  });

  it("updateStatus returns updated build", async () => {
    const build = { id: "b1", status: "completed" };
    mockUpdateBuild.mockResolvedValue({ data: build, error: undefined });
    const { buildsApi } = await import("../builds");
    const result = await buildsApi.updateStatus("b1", { status: "completed" });
    expect(result).toEqual(build);
  });

  it("updateStatus throws on error", async () => {
    mockUpdateBuild.mockResolvedValue({ data: undefined, error: "fail" });
    const { buildsApi } = await import("../builds");
    await expect(buildsApi.updateStatus("b1", { status: "x" })).rejects.toBe("fail");
  });

  it("diff returns build diff", async () => {
    const diff = { added: [], removed: [] };
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
