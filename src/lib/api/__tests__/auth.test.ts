import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sdk-client (side-effect import)
vi.mock("@/lib/sdk-client", () => ({}));

// Mock SDK functions
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockRefreshToken = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  refreshToken: (...args: unknown[]) => mockRefreshToken(...args),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

describe("authApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login calls SDK with credentials", async () => {
    const mockResponse = { access_token: "abc", user: { id: "1" } };
    mockLogin.mockResolvedValue({ data: mockResponse, error: undefined });

    const { authApi } = await import("../auth");
    const result = await authApi.login({ username: "admin", password: "pass" });

    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "admin", password: "pass" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("login throws on SDK error", async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: "bad credentials" });

    const { authApi } = await import("../auth");
    await expect(
      authApi.login({ username: "admin", password: "wrong" })
    ).rejects.toBe("bad credentials");
  });

  it("logout calls SDK logout", async () => {
    mockLogout.mockResolvedValue({ error: undefined });

    const { authApi } = await import("../auth");
    await authApi.logout();
    expect(mockLogout).toHaveBeenCalled();
  });

  it("refreshToken calls SDK with empty body", async () => {
    const mockResponse = { access_token: "new-token" };
    mockRefreshToken.mockResolvedValue({
      data: mockResponse,
      error: undefined,
    });

    const { authApi } = await import("../auth");
    const result = await authApi.refreshToken();

    expect(mockRefreshToken).toHaveBeenCalledWith({ body: expect.anything() });
    expect(result).toEqual(mockResponse);
  });

  it("getCurrentUser returns user data", async () => {
    const mockUser = { id: "1", username: "admin", role: "admin" };
    mockGetCurrentUser.mockResolvedValue({
      data: mockUser,
      error: undefined,
    });

    const { authApi } = await import("../auth");
    const result = await authApi.getCurrentUser();
    expect(result).toEqual(mockUser);
  });

  // --- Error paths for logout, refreshToken, getCurrentUser ---

  it("logout throws on SDK error", async () => {
    mockLogout.mockResolvedValue({ error: "session expired" });

    const { authApi } = await import("../auth");
    await expect(authApi.logout()).rejects.toBe("session expired");
  });

  it("refreshToken throws on SDK error", async () => {
    mockRefreshToken.mockResolvedValue({ data: undefined, error: "token invalid" });

    const { authApi } = await import("../auth");
    await expect(authApi.refreshToken()).rejects.toBe("token invalid");
  });

  it("getCurrentUser throws on SDK error", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: undefined, error: "unauthorized" });

    const { authApi } = await import("../auth");
    await expect(authApi.getCurrentUser()).rejects.toBe("unauthorized");
  });
});
