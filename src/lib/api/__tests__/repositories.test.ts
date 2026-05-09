import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
const mockAssertData = vi.fn(<T,>(d: T) => d);
vi.mock("../fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  assertData: <T,>(d: T) => mockAssertData(d),
}));

// Mock the SDK imports that repositoriesApi uses for other methods
const mockGetRepository = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  listRepositories: vi.fn(),
  getRepository: (...args: unknown[]) => mockGetRepository(...args),
  createRepository: vi.fn(),
  updateRepository: vi.fn(),
  deleteRepository: vi.fn(),
  listVirtualMembers: vi.fn(),
  addVirtualMember: vi.fn(),
  removeVirtualMember: vi.fn(),
  updateVirtualMembers: vi.fn(),
}));

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

import { repositoriesApi } from "../repositories";

describe("repositoriesApi.updateUpstreamAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PUT to the correct URL with the payload", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await repositoriesApi.updateUpstreamAuth("my-remote", {
      auth_type: "basic",
      username: "admin",
      password: "secret",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/my-remote/upstream-auth",
      {
        method: "PUT",
        body: JSON.stringify({
          auth_type: "basic",
          username: "admin",
          password: "secret",
        }),
      }
    );
  });

  it("encodes the repo key in the URL path", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await repositoriesApi.updateUpstreamAuth("repo/with spaces", {
      auth_type: "none",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/repo%2Fwith%20spaces/upstream-auth",
      expect.any(Object)
    );
  });

  it("sends bearer auth payload without username", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await repositoriesApi.updateUpstreamAuth("npm-proxy", {
      auth_type: "bearer",
      password: "token-value",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy/upstream-auth",
      {
        method: "PUT",
        body: JSON.stringify({
          auth_type: "bearer",
          password: "token-value",
        }),
      }
    );
  });

  it("sends none auth type to remove authentication", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await repositoriesApi.updateUpstreamAuth("my-remote", {
      auth_type: "none",
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/my-remote/upstream-auth",
      {
        method: "PUT",
        body: JSON.stringify({ auth_type: "none" }),
      }
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 401: Unauthorized"));

    await expect(
      repositoriesApi.updateUpstreamAuth("my-remote", { auth_type: "basic" })
    ).rejects.toThrow("API error 401: Unauthorized");
  });
});

describe("repositoriesApi.testUpstream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends POST to the correct URL", async () => {
    mockApiFetch.mockResolvedValue({ success: true });

    await repositoriesApi.testUpstream("npm-proxy");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy/test-upstream",
      { method: "POST" }
    );
  });

  it("returns the response payload", async () => {
    mockApiFetch.mockResolvedValue({ success: true, message: "Connection OK" });

    const result = await repositoriesApi.testUpstream("npm-proxy");

    expect(result).toEqual({ success: true, message: "Connection OK" });
  });

  it("encodes the repo key in the URL path", async () => {
    mockApiFetch.mockResolvedValue({ success: false });

    await repositoriesApi.testUpstream("repo/special chars");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/repo%2Fspecial%20chars/test-upstream",
      { method: "POST" }
    );
  });

  it("returns failure response when upstream is unreachable", async () => {
    mockApiFetch.mockResolvedValue({
      success: false,
      message: "Connection refused",
    });

    const result = await repositoriesApi.testUpstream("broken-remote");

    expect(result).toEqual({
      success: false,
      message: "Connection refused",
    });
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 500: Internal Server Error"));

    await expect(
      repositoriesApi.testUpstream("npm-proxy")
    ).rejects.toThrow("API error 500: Internal Server Error");
  });
});

describe("repositoriesApi.narrowFormat (via get)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns and defaults to 'generic' when SDK reports an unknown format", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetRepository.mockResolvedValue({
      data: {
        id: "r1",
        key: "test-repo",
        name: "Test",
        description: null,
        format: "shiny-new-format",
        repo_type: "local",
        is_public: false,
        storage_used_bytes: 0,
        quota_bytes: null,
        upstream_url: null,
        upstream_auth_type: null,
        upstream_auth_configured: false,
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
      },
      error: undefined,
    });

    const result = await repositoriesApi.get("test-repo");
    expect(result.format).toBe("generic");
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/unknown repository format "shiny-new-format"/)
    );
    warn.mockRestore();
  });
});
