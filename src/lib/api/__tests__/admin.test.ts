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
    const stats = { total_repos: 5 };
    mockGetSystemStats.mockResolvedValue({ data: stats, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.getStats();
    expect(result).toEqual(stats);
  });

  it("getStats throws on error", async () => {
    mockGetSystemStats.mockResolvedValue({ data: undefined, error: "fail" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.getStats()).rejects.toBe("fail");
  });

  it("listUsers returns items array", async () => {
    const users = [{ id: "1", username: "admin" }];
    mockListUsers.mockResolvedValue({ data: { items: users }, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUsers();
    expect(result).toEqual(users);
  });

  it("listUsers throws on error", async () => {
    mockListUsers.mockResolvedValue({ data: undefined, error: "unauthorized" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.listUsers()).rejects.toBe("unauthorized");
  });

  it("getHealth returns health response", async () => {
    const health = { status: "ok" };
    mockHealthCheck.mockResolvedValue({ data: health, error: undefined });
    const { adminApi } = await import("../admin");
    const result = await adminApi.getHealth();
    expect(result).toEqual(health);
  });

  it("getHealth throws on error", async () => {
    mockHealthCheck.mockResolvedValue({ data: undefined, error: "down" });
    const { adminApi } = await import("../admin");
    await expect(adminApi.getHealth()).rejects.toBe("down");
  });

  // ---- listUserTokens ----

  it("listUserTokens returns items array for a given user", async () => {
    const tokens = [
      { id: "tok-1", name: "CI Token", key_prefix: "ak_" },
      { id: "tok-2", name: "Deploy Token", key_prefix: "ak_" },
    ];
    mockListUserTokens.mockResolvedValue({
      data: { items: tokens },
      error: undefined,
    });
    const { adminApi } = await import("../admin");
    const result = await adminApi.listUserTokens("user-42");
    expect(mockListUserTokens).toHaveBeenCalledWith({
      path: { id: "user-42" },
    });
    expect(result).toEqual(tokens);
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
