import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListPermissions = vi.fn();
const mockGetPermission = vi.fn();
const mockCreatePermission = vi.fn();
const mockUpdatePermission = vi.fn();
const mockDeletePermission = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listPermissions: (...args: unknown[]) => mockListPermissions(...args),
  getPermission: (...args: unknown[]) => mockGetPermission(...args),
  createPermission: (...args: unknown[]) => mockCreatePermission(...args),
  updatePermission: (...args: unknown[]) => mockUpdatePermission(...args),
  deletePermission: (...args: unknown[]) => mockDeletePermission(...args),
}));

describe("permissionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns paginated permissions", async () => {
    const data = { items: [{ id: "perm1" }], pagination: { total: 1 } };
    mockListPermissions.mockResolvedValue({ data, error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(await permissionsApi.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListPermissions.mockResolvedValue({ data: undefined, error: "fail" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.list()).rejects.toBe("fail");
  });

  it("get returns a single permission", async () => {
    const perm = { id: "perm1", actions: ["read"] };
    mockGetPermission.mockResolvedValue({ data: perm, error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(await permissionsApi.get("perm1")).toEqual(perm);
  });

  it("get throws on error", async () => {
    mockGetPermission.mockResolvedValue({ data: undefined, error: "not found" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.get("perm1")).rejects.toBe("not found");
  });

  it("create returns created permission", async () => {
    const perm = { id: "perm2" };
    mockCreatePermission.mockResolvedValue({ data: perm, error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(
      await permissionsApi.create({
        principal_type: "user",
        principal_id: "u1",
        target_type: "repository",
        target_id: "r1",
        actions: ["read"],
      })
    ).toEqual(perm);
  });

  it("create throws on error", async () => {
    mockCreatePermission.mockResolvedValue({ data: undefined, error: "dup" });
    const { permissionsApi } = await import("../permissions");
    await expect(
      permissionsApi.create({
        principal_type: "user",
        principal_id: "u1",
        target_type: "repository",
        target_id: "r1",
        actions: ["read"],
      })
    ).rejects.toBe("dup");
  });

  it("update returns updated permission", async () => {
    const perm = { id: "perm1", actions: ["read", "write"] };
    mockUpdatePermission.mockResolvedValue({ data: perm, error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(await permissionsApi.update("perm1", { actions: ["read", "write"] })).toEqual(perm);
  });

  it("update throws on error", async () => {
    mockUpdatePermission.mockResolvedValue({ data: undefined, error: "fail" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.update("perm1", {})).rejects.toBe("fail");
  });

  it("delete calls SDK", async () => {
    mockDeletePermission.mockResolvedValue({ error: undefined });
    const { permissionsApi } = await import("../permissions");
    await permissionsApi.delete("perm1");
    expect(mockDeletePermission).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeletePermission.mockResolvedValue({ error: "fail" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.delete("perm1")).rejects.toBe("fail");
  });
});
