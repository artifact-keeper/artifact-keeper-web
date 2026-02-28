import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sdk-client (side-effect import)
vi.mock("@/lib/sdk-client", () => ({}));

// Mock SDK functions
const mockGetCurrentUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockListUserTokens = vi.fn();
const mockCreateApiToken = vi.fn();
const mockRevokeApiToken = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  listUserTokens: (...args: unknown[]) => mockListUserTokens(...args),
  createApiToken: (...args: unknown[]) => mockCreateApiToken(...args),
  revokeApiToken: (...args: unknown[]) => mockRevokeApiToken(...args),
}));

describe("profileApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ---- get ----

  it("get returns user data on success", async () => {
    const mockUser = { id: "1", username: "admin", email: "admin@test.com" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });

    const { profileApi } = await import("../profile");
    const result = await profileApi.get();

    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it("get throws on SDK error", async () => {
    mockGetCurrentUser.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });

    const { profileApi } = await import("../profile");
    await expect(profileApi.get()).rejects.toBe("unauthorized");
  });

  // ---- update ----

  it("update fetches current user then calls updateUser", async () => {
    const mockUser = { id: "user-1", username: "admin", email: "old@test.com" };
    const updatedUser = { ...mockUser, email: "new@test.com" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockUpdateUser.mockResolvedValue({ data: updatedUser, error: undefined });

    const { profileApi } = await import("../profile");
    const result = await profileApi.update({ email: "new@test.com" });

    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith({
      path: { id: "user-1" },
      body: { email: "new@test.com" },
    });
    expect(result).toEqual(updatedUser);
  });

  it("update throws when getCurrentUser fails", async () => {
    mockGetCurrentUser.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });

    const { profileApi } = await import("../profile");
    await expect(
      profileApi.update({ display_name: "New Name" })
    ).rejects.toBe("unauthorized");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("update throws when updateUser fails", async () => {
    const mockUser = { id: "user-1", username: "admin" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockUpdateUser.mockResolvedValue({
      data: undefined,
      error: "validation error",
    });

    const { profileApi } = await import("../profile");
    await expect(
      profileApi.update({ email: "bad-email" })
    ).rejects.toBe("validation error");
  });

  // ---- listApiKeys ----

  it("listApiKeys returns items array on success", async () => {
    const mockUser = { id: "user-1" };
    const mockTokens = {
      items: [
        { id: "key-1", name: "CI Key", key_prefix: "ak_" },
        { id: "key-2", name: "Deploy Key", key_prefix: "ak_" },
      ],
    };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({
      data: mockTokens,
      error: undefined,
    });

    const { profileApi } = await import("../profile");
    const result = await profileApi.listApiKeys();

    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(mockListUserTokens).toHaveBeenCalledWith({
      path: { id: "user-1" },
    });
    expect(result).toEqual(mockTokens.items);
  });

  it("listApiKeys returns empty array when data has no items", async () => {
    const mockUser = { id: "user-1" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({ data: {}, error: undefined });

    const { profileApi } = await import("../profile");
    const result = await profileApi.listApiKeys();

    expect(result).toEqual([]);
  });

  it("listApiKeys returns empty array when data is null", async () => {
    const mockUser = { id: "user-1" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({ data: null, error: undefined });

    const { profileApi } = await import("../profile");
    const result = await profileApi.listApiKeys();

    expect(result).toEqual([]);
  });

  it("listApiKeys throws when getCurrentUser fails", async () => {
    mockGetCurrentUser.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });

    const { profileApi } = await import("../profile");
    await expect(profileApi.listApiKeys()).rejects.toBe("unauthorized");
    expect(mockListUserTokens).not.toHaveBeenCalled();
  });

  it("listApiKeys throws when listUserTokens fails", async () => {
    const mockUser = { id: "user-1" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({
      data: undefined,
      error: "server error",
    });

    const { profileApi } = await import("../profile");
    await expect(profileApi.listApiKeys()).rejects.toBe("server error");
  });

  // ---- createApiKey ----

  it("createApiKey calls SDK and returns response", async () => {
    const mockResponse = { id: "key-1", token: "ak_full_token", name: "CI Key" };
    mockCreateApiToken.mockResolvedValue({
      data: mockResponse,
      error: undefined,
    });

    const { profileApi } = await import("../profile");
    const result = await profileApi.createApiKey({
      name: "CI Key",
      expires_in_days: 90,
      scopes: ["read"],
    });

    expect(mockCreateApiToken).toHaveBeenCalledWith({
      body: { name: "CI Key", expires_in_days: 90, scopes: ["read"] },
    });
    expect(result).toEqual(mockResponse);
  });

  it("createApiKey throws on SDK error", async () => {
    mockCreateApiToken.mockResolvedValue({
      data: undefined,
      error: "quota exceeded",
    });

    const { profileApi } = await import("../profile");
    await expect(
      profileApi.createApiKey({ name: "Key" })
    ).rejects.toBe("quota exceeded");
  });

  // ---- deleteApiKey ----

  it("deleteApiKey calls SDK with key id", async () => {
    mockRevokeApiToken.mockResolvedValue({ error: undefined });

    const { profileApi } = await import("../profile");
    await profileApi.deleteApiKey("key-1");

    expect(mockRevokeApiToken).toHaveBeenCalledWith({
      path: { token_id: "key-1" },
    });
  });

  it("deleteApiKey throws on SDK error", async () => {
    mockRevokeApiToken.mockResolvedValue({ error: "not found" });

    const { profileApi } = await import("../profile");
    await expect(profileApi.deleteApiKey("bad-id")).rejects.toBe("not found");
  });

  // ---- listAccessTokens ----

  it("listAccessTokens returns items array on success", async () => {
    const mockUser = { id: "user-1" };
    const mockTokens = {
      items: [
        { id: "tok-1", name: "Dev Token", token_prefix: "akt_" },
      ],
    };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({
      data: mockTokens,
      error: undefined,
    });

    const { profileApi } = await import("../profile");
    const result = await profileApi.listAccessTokens();

    expect(mockGetCurrentUser).toHaveBeenCalled();
    expect(mockListUserTokens).toHaveBeenCalledWith({
      path: { id: "user-1" },
    });
    expect(result).toEqual(mockTokens.items);
  });

  it("listAccessTokens returns empty array when data is empty", async () => {
    const mockUser = { id: "user-1" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({ data: {}, error: undefined });

    const { profileApi } = await import("../profile");
    const result = await profileApi.listAccessTokens();

    expect(result).toEqual([]);
  });

  it("listAccessTokens throws when getCurrentUser fails", async () => {
    mockGetCurrentUser.mockResolvedValue({
      data: undefined,
      error: "session expired",
    });

    const { profileApi } = await import("../profile");
    await expect(profileApi.listAccessTokens()).rejects.toBe("session expired");
    expect(mockListUserTokens).not.toHaveBeenCalled();
  });

  it("listAccessTokens throws when listUserTokens fails", async () => {
    const mockUser = { id: "user-1" };
    mockGetCurrentUser.mockResolvedValue({ data: mockUser, error: undefined });
    mockListUserTokens.mockResolvedValue({
      data: undefined,
      error: "forbidden",
    });

    const { profileApi } = await import("../profile");
    await expect(profileApi.listAccessTokens()).rejects.toBe("forbidden");
  });

  // ---- createAccessToken ----

  it("createAccessToken calls SDK and returns response", async () => {
    const mockResponse = {
      id: "tok-1",
      token: "akt_full_token",
      name: "Dev Token",
    };
    mockCreateApiToken.mockResolvedValue({
      data: mockResponse,
      error: undefined,
    });

    const { profileApi } = await import("../profile");
    const result = await profileApi.createAccessToken({
      name: "Dev Token",
      expires_in_days: 30,
    });

    expect(mockCreateApiToken).toHaveBeenCalledWith({
      body: { name: "Dev Token", expires_in_days: 30 },
    });
    expect(result).toEqual(mockResponse);
  });

  it("createAccessToken throws on SDK error", async () => {
    mockCreateApiToken.mockResolvedValue({
      data: undefined,
      error: "invalid request",
    });

    const { profileApi } = await import("../profile");
    await expect(
      profileApi.createAccessToken({ name: "Token" })
    ).rejects.toBe("invalid request");
  });

  // ---- deleteAccessToken ----

  it("deleteAccessToken calls SDK with token id", async () => {
    mockRevokeApiToken.mockResolvedValue({ error: undefined });

    const { profileApi } = await import("../profile");
    await profileApi.deleteAccessToken("tok-1");

    expect(mockRevokeApiToken).toHaveBeenCalledWith({
      path: { token_id: "tok-1" },
    });
  });

  it("deleteAccessToken throws on SDK error", async () => {
    mockRevokeApiToken.mockResolvedValue({ error: "not found" });

    const { profileApi } = await import("../profile");
    await expect(
      profileApi.deleteAccessToken("bad-id")
    ).rejects.toBe("not found");
  });
});
