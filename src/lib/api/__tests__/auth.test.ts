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
    const sdkResponse = {
      access_token: "abc",
      refresh_token: "ref",
      expires_in: 3600,
      token_type: "Bearer",
      must_change_password: false,
    };
    mockLogin.mockResolvedValue({ data: sdkResponse, error: undefined });

    const { authApi } = await import("../auth");
    const result = await authApi.login({ username: "admin", password: "pass" });

    expect(mockLogin).toHaveBeenCalledWith({
      body: { username: "admin", password: "pass" },
    });
    expect(result).toEqual({
      access_token: "abc",
      refresh_token: "ref",
      expires_in: 3600,
      token_type: "Bearer",
      must_change_password: false,
      totp_required: undefined,
      totp_token: undefined,
    });
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
    const sdkResponse = {
      access_token: "new-token",
      refresh_token: "ref",
      expires_in: 3600,
      token_type: "Bearer",
      must_change_password: false,
    };
    mockRefreshToken.mockResolvedValue({
      data: sdkResponse,
      error: undefined,
    });

    const { authApi } = await import("../auth");
    const result = await authApi.refreshToken();

    expect(mockRefreshToken).toHaveBeenCalledWith({ body: expect.anything() });
    expect(result).toEqual({
      access_token: "new-token",
      refresh_token: "ref",
      expires_in: 3600,
      token_type: "Bearer",
      must_change_password: false,
      totp_required: undefined,
      totp_token: undefined,
    });
  });

  it("getCurrentUser returns user data", async () => {
    const sdkUser = {
      id: "1",
      username: "admin",
      email: "admin@example.com",
      is_admin: true,
      totp_enabled: false,
    };
    mockGetCurrentUser.mockResolvedValue({
      data: sdkUser,
      error: undefined,
    });

    const { authApi } = await import("../auth");
    const result = await authApi.getCurrentUser();
    expect(result).toEqual({
      id: "1",
      username: "admin",
      email: "admin@example.com",
      is_admin: true,
      totp_enabled: false,
      display_name: undefined,
    });
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
