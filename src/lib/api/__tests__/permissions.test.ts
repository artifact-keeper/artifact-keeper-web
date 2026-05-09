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

function sdkPermissionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "perm1",
    principal_type: "user",
    principal_id: "u1",
    principal_name: null,
    target_type: "repository",
    target_id: "r1",
    target_name: null,
    actions: ["read"],
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    ...overrides,
  };
}

function adaptedPermissionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "perm1",
    principal_type: "user",
    principal_id: "u1",
    principal_name: undefined,
    target_type: "repository",
    target_id: "r1",
    target_name: undefined,
    actions: ["read"],
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    ...overrides,
  };
}

describe("permissionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns paginated permissions", async () => {
    const data = { items: [sdkPermissionFixture()], pagination: { total: 1 } };
    mockListPermissions.mockResolvedValue({ data, error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(await permissionsApi.list()).toEqual({
      items: [adaptedPermissionFixture()],
      pagination: { total: 1 },
    });
  });

  it("list throws on error", async () => {
    mockListPermissions.mockResolvedValue({ data: undefined, error: "fail" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.list()).rejects.toBe("fail");
  });

  it("get returns a single permission", async () => {
    mockGetPermission.mockResolvedValue({ data: sdkPermissionFixture(), error: undefined });
    const { permissionsApi } = await import("../permissions");
    expect(await permissionsApi.get("perm1")).toEqual(adaptedPermissionFixture());
  });

  it("get throws on error", async () => {
    mockGetPermission.mockResolvedValue({ data: undefined, error: "not found" });
    const { permissionsApi } = await import("../permissions");
    await expect(permissionsApi.get("perm1")).rejects.toBe("not found");
  });

  it("create returns created permission", async () => {
    // CreatedPermissionRow has principal_id/target_id/actions but no
    // updated_at or *_name fields.
    mockCreatePermission.mockResolvedValue({
      data: {
        id: "perm2",
        principal_type: "user",
        principal_id: "u1",
        target_type: "repository",
        target_id: "r1",
        actions: ["read"],
        created_at: "2025-01-01",
      },
      error: undefined,
    });
    const { permissionsApi } = await import("../permissions");
    expect(
      await permissionsApi.create({
        principal_type: "user",
        principal_id: "u1",
        target_type: "repository",
        target_id: "r1",
        actions: ["read"],
      })
    ).toEqual({
      id: "perm2",
      principal_type: "user",
      principal_id: "u1",
      principal_name: undefined,
      target_type: "repository",
      target_id: "r1",
      target_name: undefined,
      actions: ["read"],
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    });
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
    mockUpdatePermission.mockResolvedValue({
      data: sdkPermissionFixture({ actions: ["read", "write"] }),
      error: undefined,
    });
    const { permissionsApi } = await import("../permissions");
    expect(
      await permissionsApi.update("perm1", {
        principal_type: "user",
        principal_id: "u1",
        target_type: "repository",
        target_id: "r1",
        actions: ["read", "write"],
      })
    ).toEqual(adaptedPermissionFixture({ actions: ["read", "write"] }));
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

  // ---- Narrowing fallback warnings ----

  it("warns and defaults principal_type to 'user' on unknown variant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetPermission.mockResolvedValue({
      data: sdkPermissionFixture({ principal_type: "service_account" }),
      error: undefined,
    });
    const { permissionsApi } = await import("../permissions");
    const result = await permissionsApi.get("perm1");
    expect(result.principal_type).toBe("user");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown principal_type/));
    warn.mockRestore();
  });

  it("warns and defaults target_type to 'repository' on unknown variant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetPermission.mockResolvedValue({
      data: sdkPermissionFixture({ target_type: "namespace" }),
      error: undefined,
    });
    const { permissionsApi } = await import("../permissions");
    const result = await permissionsApi.get("perm1");
    expect(result.target_type).toBe("repository");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unknown target_type/));
    warn.mockRestore();
  });

  it("warns when narrowActions filters unknown values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetPermission.mockResolvedValue({
      data: sdkPermissionFixture({ actions: ["read", "approve"] }),
      error: undefined,
    });
    const { permissionsApi } = await import("../permissions");
    const result = await permissionsApi.get("perm1");
    expect(result.actions).toEqual(["read"]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/dropping unknown action/));
    warn.mockRestore();
  });
});
