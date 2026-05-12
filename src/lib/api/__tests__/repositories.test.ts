import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
const mockAssertData = vi.fn(<T,>(d: T) => d);
vi.mock("../fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  assertData: <T,>(d: T) => mockAssertData(d),
  narrowEnum: <T extends string>(
    value: string,
    allowed: ReadonlySet<T>,
    fallback: T,
    warn?: string,
  ): T => {
    if (allowed.has(value as T)) return value as T;
    if (warn) console.warn(warn);
    return fallback;
  },
}));

// Mock the SDK imports that repositoriesApi uses for other methods
const mockGetRepository = vi.fn();
const mockCreateRepository = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  listRepositories: vi.fn(),
  getRepository: (...args: unknown[]) => mockGetRepository(...args),
  createRepository: (...args: unknown[]) => mockCreateRepository(...args),
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

describe("repositoriesApi.create — upstream auth forwarding (regression #407)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Minimum SDK response shape needed for `adaptRepository` after create.
  const successResponse = {
    data: {
      id: "r1",
      key: "maven-proxy",
      name: "Maven Proxy",
      description: null,
      format: "maven",
      repo_type: "remote",
      is_public: false,
      storage_used_bytes: 0,
      quota_bytes: null,
      upstream_url: "https://repo.maven.apache.org/maven2/",
      upstream_auth_type: "basic",
      upstream_auth_configured: true,
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    },
    error: undefined,
  };

  it("forwards upstream_auth_type/username/password to the SDK when basic auth is supplied", async () => {
    mockCreateRepository.mockResolvedValue(successResponse);

    await repositoriesApi.create({
      key: "maven-proxy",
      name: "Maven Proxy",
      format: "maven",
      repo_type: "remote",
      upstream_url: "https://repo.maven.apache.org/maven2/",
      upstream_auth_type: "basic",
      upstream_username: "deploy",
      upstream_password: "s3cret",
    });

    expect(mockCreateRepository).toHaveBeenCalledTimes(1);
    const call = mockCreateRepository.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    expect(call).toBeDefined();
    expect(call.body).toMatchObject({
      upstream_auth_type: "basic",
      upstream_username: "deploy",
      upstream_password: "s3cret",
    });
  });

  it("forwards upstream_auth_type/password for bearer auth (no username)", async () => {
    mockCreateRepository.mockResolvedValue(successResponse);

    await repositoriesApi.create({
      key: "npm-proxy",
      name: "NPM Proxy",
      format: "npm",
      repo_type: "remote",
      upstream_url: "https://registry.npmjs.org/",
      upstream_auth_type: "bearer",
      upstream_password: "token-abc",
    });

    expect(mockCreateRepository).toHaveBeenCalledTimes(1);
    const call = mockCreateRepository.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    expect(call.body).toMatchObject({
      upstream_auth_type: "bearer",
      upstream_password: "token-abc",
    });
  });

  it("does not include auth fields when no auth is supplied", async () => {
    mockCreateRepository.mockResolvedValue(successResponse);

    await repositoriesApi.create({
      key: "maven-anon",
      name: "Anon Maven",
      format: "maven",
      repo_type: "remote",
      upstream_url: "https://repo.maven.apache.org/maven2/",
    });

    expect(mockCreateRepository).toHaveBeenCalledTimes(1);
    const call = mockCreateRepository.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    // These keys may be omitted entirely or set to undefined — either is fine.
    expect(call.body.upstream_auth_type).toBeUndefined();
    expect(call.body.upstream_username).toBeUndefined();
    expect(call.body.upstream_password).toBeUndefined();
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
