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
