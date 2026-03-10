import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetSystemStats = vi.fn();
const mockListUsers = vi.fn();
const mockHealthCheck = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getSystemStats: (...args: unknown[]) => mockGetSystemStats(...args),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  healthCheck: (...args: unknown[]) => mockHealthCheck(...args),
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
});
