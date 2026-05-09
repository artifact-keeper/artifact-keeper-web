import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetSystemStats = vi.fn();
const mockListUsers = vi.fn();
const mockHealthCheck = vi.fn();
const mockListUserTokens = vi.fn();
const mockRevokeUserApiToken = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getSystemStats: (...args: unknown[]) => mockGetSystemStats(...args),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  healthCheck: (...args: unknown[]) => mockHealthCheck(...args),
  listUserTokens: (...args: unknown[]) => mockListUserTokens(...args),
  revokeUserApiToken: (...args: unknown[]) => mockRevokeUserApiToken(...args),
}));

describe("adminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStats returns typed AdminStats", async () => {
    const stats = {
      total_repositories: 5,
      total_artifacts: 10,
      total_storage_bytes: 1024,
      total_users: 3,
      active_peers: 0,
      pending_sync_tasks: 0,
      total_downloads: 0,
    };
    mockGetSystemStats.mockResolvedValue({ data: stats, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.getStats();
    expect(result).toEqual({
      total_repositories: 5,
      total_artifacts: 10,
      total_storage_bytes: 1024,
      total_users: 3,
    });
  });

  it("getStats throws on error", async () => {
    mockGetSystemStats.mockResolvedValue({ data: undefined, error: "fail" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.getStats()).rejects.toBe("fail");
  });

  it("listUsers returns items array", async () => {
    const sdkUser = {
      id: "1",
      username: "admin",
      email: "admin@example.com",
      is_admin: true,
      is_active: true,
      must_change_password: false,
      auth_provider: "local",
      created_at: "2025-01-01",
      display_name: null,
    };
    mockListUsers.mockResolvedValue({
      data: { items: [sdkUser], pagination: {} },
      error: undefined,
    });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUsers();
    expect(result).toEqual([
      {
        id: "1",
        username: "admin",
        email: "admin@example.com",
        is_admin: true,
        is_active: true,
        must_change_password: false,
        auth_provider: "local",
        display_name: undefined,
      },
    ]);
  });

  it("listUsers throws on error", async () => {
    mockListUsers.mockResolvedValue({ data: undefined, error: "unauthorized" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.listUsers()).rejects.toBe("unauthorized");
  });

  it("getHealth returns health response", async () => {
    const health = {
      status: "ok",
      version: "1.0.0",
      demo_mode: false,
      checks: {
        database: { status: "ok" },
        storage: { status: "ok" },
      },
    };
    mockHealthCheck.mockResolvedValue({ data: health, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.getHealth();
    expect(result).toEqual({
      status: "ok",
      version: "1.0.0",
      commit: undefined,
      dirty: undefined,
      checks: {
        database: { status: "ok", message: undefined },
        storage: { status: "ok", message: undefined },
        security_scanner: undefined,
        meilisearch: undefined,
      },
    });
  });

  it("getHealth throws on error", async () => {
    mockHealthCheck.mockResolvedValue({ data: undefined, error: "down" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.getHealth()).rejects.toBe("down");
  });

  // ---- listUserTokens ----

  it("listUserTokens returns items array for a given user", async () => {
    const sdkTokens = [
      {
        id: "tok-1",
        name: "CI Token",
        token_prefix: "ak_",
        created_at: "2025-01-01",
        scopes: [],
      },
      {
        id: "tok-2",
        name: "Deploy Token",
        token_prefix: "ak_",
        created_at: "2025-01-01",
        scopes: [],
      },
    ];
    mockListUserTokens.mockResolvedValue({
      data: { items: sdkTokens },
      error: undefined,
    });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUserTokens("user-42");
    expect(mockListUserTokens).toHaveBeenCalledWith({
      path: { id: "user-42" },
    });
    expect(result).toEqual([
      {
        id: "tok-1",
        name: "CI Token",
        key_prefix: "ak_",
        created_at: "2025-01-01",
        scopes: [],
        expires_at: undefined,
        last_used_at: undefined,
      },
      {
        id: "tok-2",
        name: "Deploy Token",
        key_prefix: "ak_",
        created_at: "2025-01-01",
        scopes: [],
        expires_at: undefined,
        last_used_at: undefined,
      },
    ]);
  });

  it("listUserTokens returns empty array when data has no items", async () => {
    mockListUserTokens.mockResolvedValue({ data: {}, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUserTokens("user-42");
    expect(result).toEqual([]);
  });

  it("listUserTokens returns empty array when data is null", async () => {
    mockListUserTokens.mockResolvedValue({ data: null, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUserTokens("user-42");
    expect(result).toEqual([]);
  });

  it("listUserTokens throws on error", async () => {
    mockListUserTokens.mockResolvedValue({
      data: undefined,
      error: "forbidden",
    });
    const { adminApi } = await import("../admin");
    await expect(adminApi.listUserTokens("user-42")).rejects.toBe("forbidden");
  });

  // ---- revokeUserToken ----

  it("revokeUserToken calls SDK with user id and token id", async () => {
    mockRevokeUserApiToken.mockResolvedValue({ error: undefined });
    const { adminApi } = await import("../admin");
    await adminApi.revokeUserToken("user-42", "tok-1");
    expect(mockRevokeUserApiToken).toHaveBeenCalledWith({
      path: { id: "user-42", token_id: "tok-1" },
    });
  });

  it("revokeUserToken throws on error", async () => {
    mockRevokeUserApiToken.mockResolvedValue({ error: "not found" });
    const { adminApi } = await import("../admin");
    await expect(
      adminApi.revokeUserToken("user-42", "bad-id")
    ).rejects.toBe("not found");
  });
});
