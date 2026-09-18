import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListPackages = vi.fn();
const mockGetPackage = vi.fn();
const mockGetPackageVersions = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listPackages: (...args: unknown[]) => mockListPackages(...args),
  getPackage: (...args: unknown[]) => mockGetPackage(...args),
  getPackageVersions: (...args: unknown[]) => mockGetPackageVersions(...args),
}));

// `?repository_key=` is absent from the pinned SDK, so that one branch of
// `get` goes through apiFetch (backend artifact-keeper#3532).
const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/fetch")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe("packagesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns paginated packages", async () => {
    const data = { items: [{ id: "p1" }], pagination: { total: 1 } };
    mockListPackages.mockResolvedValue({ data, error: undefined });
    const { packagesApi } = await import("../packages");
    expect(await packagesApi.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListPackages.mockResolvedValue({ data: undefined, error: "fail" });
    const { packagesApi } = await import("../packages");
    await expect(packagesApi.list()).rejects.toBe("fail");
  });

  it("get returns a single package", async () => {
    const pkg = { id: "p1", name: "lodash" };
    mockGetPackage.mockResolvedValue({ data: pkg, error: undefined });
    const { packagesApi } = await import("../packages");
    expect(await packagesApi.get("p1")).toEqual(pkg);
  });

  it("get throws on error", async () => {
    mockGetPackage.mockResolvedValue({ data: undefined, error: "not found" });
    const { packagesApi } = await import("../packages");
    await expect(packagesApi.get("p1")).rejects.toBe("not found");
  });

  it("getVersions returns versions array", async () => {
    const versions = [{ version: "1.0.0" }];
    mockGetPackageVersions.mockResolvedValue({
      data: { versions },
      error: undefined,
    });
    const { packagesApi } = await import("../packages");
    expect(await packagesApi.getVersions("p1")).toEqual(versions);
  });

  it("getVersions throws on error", async () => {
    mockGetPackageVersions.mockResolvedValue({ data: undefined, error: "fail" });
    const { packagesApi } = await import("../packages");
    await expect(packagesApi.getVersions("p1")).rejects.toBe("fail");
  });
});

// Virtual repositories aggregate their members, and the aggregated listing
// reports the virtual key. The detail lookup only agrees with it when the
// virtual key travels along as `?repository_key=` (artifact-keeper#3532).
describe("packagesApi.get virtual-repo context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes repository_key as a query param via apiFetch", async () => {
    const pkg = { id: "p1", name: "lodash", repository_key: "npm-virtual" };
    mockApiFetch.mockResolvedValue(pkg);
    const { packagesApi } = await import("../packages");

    const result = await packagesApi.get("p1", { repository_key: "npm-virtual" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/packages/p1?repository_key=npm-virtual",
    );
    expect(mockGetPackage).not.toHaveBeenCalled();
    expect(result.repository_key).toBe("npm-virtual");
  });

  it("encodes a repository key that needs escaping", async () => {
    mockApiFetch.mockResolvedValue({ id: "p1", name: "lodash" });
    const { packagesApi } = await import("../packages");

    await packagesApi.get("p 1", { repository_key: "npm virtual/eu" });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/packages/p%201?repository_key=npm+virtual%2Feu",
    );
  });

  it("stays on the generated SDK operation when no repository_key is given", async () => {
    mockGetPackage.mockResolvedValue({
      data: { id: "p1", name: "lodash" },
      error: undefined,
    });
    const { packagesApi } = await import("../packages");

    await packagesApi.get("p1", {});

    expect(mockGetPackage).toHaveBeenCalledWith({ path: { id: "p1" } });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
