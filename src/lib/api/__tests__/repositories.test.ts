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
const mockListRepositories = vi.fn();
const mockGetRepository = vi.fn();
const mockCreateRepository = vi.fn();
const mockUpdateRepository = vi.fn();
const mockDeleteRepository = vi.fn();
const mockListVirtualMembers = vi.fn();
const mockAddVirtualMember = vi.fn();
const mockRemoveVirtualMember = vi.fn();
const mockUpdateVirtualMembers = vi.fn();
const mockGetCacheTtl = vi.fn();
const mockSetCacheTtl = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  listRepositories: (...args: unknown[]) => mockListRepositories(...args),
  getRepository: (...args: unknown[]) => mockGetRepository(...args),
  createRepository: (...args: unknown[]) => mockCreateRepository(...args),
  updateRepository: (...args: unknown[]) => mockUpdateRepository(...args),
  deleteRepository: (...args: unknown[]) => mockDeleteRepository(...args),
  listVirtualMembers: (...args: unknown[]) => mockListVirtualMembers(...args),
  addVirtualMember: (...args: unknown[]) => mockAddVirtualMember(...args),
  removeVirtualMember: (...args: unknown[]) => mockRemoveVirtualMember(...args),
  updateVirtualMembers: (...args: unknown[]) => mockUpdateVirtualMembers(...args),
  getCacheTtl: (...args: unknown[]) => mockGetCacheTtl(...args),
  setCacheTtl: (...args: unknown[]) => mockSetCacheTtl(...args),
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

// ---------------------------------------------------------------------------
// Cache TTL methods (#448) — getCacheTtl / setCacheTtl
// ---------------------------------------------------------------------------

describe("repositoriesApi.getCacheTtl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the SDK response on success", async () => {
    mockGetCacheTtl.mockResolvedValue({
      data: { repository_key: "pypi-remote", cache_ttl_seconds: 3600 },
      error: undefined,
    });
    const result = await repositoriesApi.getCacheTtl("pypi-remote");
    expect(result).toEqual({
      repository_key: "pypi-remote",
      cache_ttl_seconds: 3600,
    });
    expect(mockGetCacheTtl).toHaveBeenCalledWith({
      path: { key: "pypi-remote" },
    });
  });

  it("throws on SDK error", async () => {
    mockGetCacheTtl.mockResolvedValue({ data: undefined, error: "boom" });
    await expect(repositoriesApi.getCacheTtl("pypi-remote")).rejects.toBe("boom");
  });
});

describe("repositoriesApi.setCacheTtl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUTs the new TTL via the SDK with the correct body shape", async () => {
    mockSetCacheTtl.mockResolvedValue({
      data: { repository_key: "pypi-remote", cache_ttl_seconds: 7200 },
      error: undefined,
    });
    const result = await repositoriesApi.setCacheTtl("pypi-remote", 7200);
    expect(result).toEqual({
      repository_key: "pypi-remote",
      cache_ttl_seconds: 7200,
    });
    expect(mockSetCacheTtl).toHaveBeenCalledWith({
      path: { key: "pypi-remote" },
      // Body field name must match SetCacheTtlRequest (`cache_ttl_seconds`),
      // not e.g. the legacy `value` form that the docs PR #71 corrected.
      body: { cache_ttl_seconds: 7200 },
    });
  });

  it("throws on SDK error (e.g. 400 for non-Remote repo)", async () => {
    mockSetCacheTtl.mockResolvedValue({
      data: undefined,
      error: {
        message:
          "cache_ttl is only configurable on remote (proxy) repositories",
      },
    });
    await expect(
      repositoriesApi.setCacheTtl("local-repo", 3600)
    ).rejects.toMatchObject({
      message: expect.stringMatching(/remote \(proxy\) repositories/),
    });
  });
});

// ---------------------------------------------------------------------------
// Repository CRUD: list / update / delete
// ---------------------------------------------------------------------------

const sdkRepo = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  key: "maven-local",
  name: "Maven Local",
  description: "desc",
  format: "maven",
  repo_type: "local",
  is_public: true,
  storage_used_bytes: 100,
  quota_bytes: 1000,
  upstream_url: null,
  upstream_auth_type: null,
  upstream_auth_configured: false,
  created_at: "2025-01-01",
  updated_at: "2025-01-02",
  ...overrides,
});

describe("repositoriesApi.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adapts the list and forwards query params", async () => {
    mockListRepositories.mockResolvedValue({
      data: {
        items: [sdkRepo(), sdkRepo({ id: "r2", key: "pypi-remote", format: "pypi", repo_type: "remote" })],
        pagination: { page: 1, per_page: 20, total: 2, total_pages: 1 },
      },
      error: undefined,
    });

    const result = await repositoriesApi.list({ page: 1, per_page: 20, format: "maven" });

    expect(mockListRepositories).toHaveBeenCalledWith({
      query: { page: 1, per_page: 20, format: "maven" },
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].key).toBe("maven-local");
    expect(result.items[1].repo_type).toBe("remote");
    expect(result.pagination.total).toBe(2);
  });

  it("defaults params to an empty object", async () => {
    mockListRepositories.mockResolvedValue({
      data: { items: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 } },
      error: undefined,
    });
    await repositoriesApi.list();
    expect(mockListRepositories).toHaveBeenCalledWith({ query: {} });
  });

  it("coerces null optional fields to undefined during adaptation", async () => {
    mockListRepositories.mockResolvedValue({
      data: {
        items: [sdkRepo({ description: null, quota_bytes: null, upstream_url: null })],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      },
      error: undefined,
    });
    const result = await repositoriesApi.list();
    expect(result.items[0].description).toBeUndefined();
    expect(result.items[0].quota_bytes).toBeUndefined();
    expect(result.items[0].upstream_url).toBeUndefined();
  });

  it("throws on SDK error", async () => {
    mockListRepositories.mockResolvedValue({ data: undefined, error: new Error("list failed") });
    await expect(repositoriesApi.list()).rejects.toThrow("list failed");
  });
});

describe("repositoriesApi.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends only the updatable fields and adapts the response", async () => {
    mockUpdateRepository.mockResolvedValue({ data: sdkRepo({ name: "Renamed" }), error: undefined });

    const result = await repositoriesApi.update("maven-local", {
      name: "Renamed",
      description: "new desc",
      is_public: false,
      quota_bytes: 5000,
      key: "maven-local",
    });

    expect(mockUpdateRepository).toHaveBeenCalledWith({
      path: { key: "maven-local" },
      body: {
        name: "Renamed",
        description: "new desc",
        is_public: false,
        quota_bytes: 5000,
        key: "maven-local",
      },
    });
    expect(result.name).toBe("Renamed");
  });

  it("throws on SDK error", async () => {
    mockUpdateRepository.mockResolvedValue({ data: undefined, error: new Error("update failed") });
    await expect(repositoriesApi.update("maven-local", { name: "x" })).rejects.toThrow("update failed");
  });

  it("forwards versioning_enabled to the update body (#571)", async () => {
    mockUpdateRepository.mockResolvedValue({
      data: sdkRepo({ format: "generic", versioning_enabled: true }),
      error: undefined,
    });

    const result = await repositoriesApi.update("configs", {
      versioning_enabled: true,
    });

    expect(mockUpdateRepository).toHaveBeenCalledWith({
      path: { key: "configs" },
      body: expect.objectContaining({ versioning_enabled: true }),
    });
    expect(result.versioning_enabled).toBe(true);
  });

  it("omits versioning_enabled from the body when not provided so the flag is left unchanged", async () => {
    mockUpdateRepository.mockResolvedValue({ data: sdkRepo(), error: undefined });

    await repositoriesApi.update("maven-local", { name: "Renamed" });

    const body = mockUpdateRepository.mock.calls[0][0].body;
    expect(body.versioning_enabled).toBeUndefined();
  });
});

describe("repositoriesApi adaptation of versioning_enabled (#571)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes versioning_enabled from the response", async () => {
    mockGetRepository.mockResolvedValue({
      data: sdkRepo({ format: "generic", versioning_enabled: true }),
      error: undefined,
    });
    const repo = await repositoriesApi.get("configs");
    expect(repo.versioning_enabled).toBe(true);
  });

  it("defaults versioning_enabled to false when the backend omits it", async () => {
    mockGetRepository.mockResolvedValue({ data: sdkRepo(), error: undefined });
    const repo = await repositoriesApi.get("maven-local");
    expect(repo.versioning_enabled).toBe(false);
  });
});

describe("repositoriesApi.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteRepository with the key path", async () => {
    mockDeleteRepository.mockResolvedValue({ error: undefined });
    await repositoriesApi.delete("maven-local");
    expect(mockDeleteRepository).toHaveBeenCalledWith({ path: { key: "maven-local" } });
  });

  it("throws on SDK error", async () => {
    mockDeleteRepository.mockResolvedValue({ error: new Error("delete failed") });
    await expect(repositoriesApi.delete("maven-local")).rejects.toThrow("delete failed");
  });
});

describe("repositoriesApi.create error path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws on SDK error", async () => {
    mockCreateRepository.mockResolvedValue({ data: undefined, error: new Error("create failed") });
    await expect(
      repositoriesApi.create({ key: "k", name: "n", format: "maven", repo_type: "local" })
    ).rejects.toThrow("create failed");
  });
});

// ---------------------------------------------------------------------------
// Virtual member management
// ---------------------------------------------------------------------------

describe("repositoriesApi virtual members", () => {
  beforeEach(() => vi.clearAllMocks());

  const sdkMember = (overrides: Record<string, unknown> = {}) => ({
    id: "m1",
    member_repo_id: "rid1",
    member_repo_key: "maven-local",
    priority: 1,
    created_at: "2025-01-01",
    ...overrides,
  });

  it("listMembers adapts the members list", async () => {
    mockListVirtualMembers.mockResolvedValue({
      data: { members: [sdkMember(), sdkMember({ id: "m2", member_repo_key: "pypi-local", priority: 2 })] },
      error: undefined,
    });
    const result = await repositoriesApi.listMembers("virt-1");
    expect(mockListVirtualMembers).toHaveBeenCalledWith({ path: { key: "virt-1" } });
    expect(result.members).toHaveLength(2);
    expect(result.members[0].member_repo_key).toBe("maven-local");
    expect(result.members[0].virtual_repo_id).toBe("");
  });

  it("listMembers throws on SDK error", async () => {
    mockListVirtualMembers.mockResolvedValue({ data: undefined, error: new Error("nope") });
    await expect(repositoriesApi.listMembers("virt-1")).rejects.toThrow("nope");
  });

  it("addMember sends key, member_key and priority and adapts the result", async () => {
    mockAddVirtualMember.mockResolvedValue({ data: sdkMember({ priority: 5 }), error: undefined });
    const result = await repositoriesApi.addMember("virt-1", "maven-local", 5);
    expect(mockAddVirtualMember).toHaveBeenCalledWith({
      path: { key: "virt-1" },
      body: { member_key: "maven-local", priority: 5 },
    });
    expect(result.priority).toBe(5);
  });

  it("addMember works without an explicit priority", async () => {
    mockAddVirtualMember.mockResolvedValue({ data: sdkMember(), error: undefined });
    await repositoriesApi.addMember("virt-1", "maven-local");
    expect(mockAddVirtualMember).toHaveBeenCalledWith({
      path: { key: "virt-1" },
      body: { member_key: "maven-local", priority: undefined },
    });
  });

  it("addMember throws on SDK error", async () => {
    mockAddVirtualMember.mockResolvedValue({ data: undefined, error: new Error("add failed") });
    await expect(repositoriesApi.addMember("virt-1", "maven-local")).rejects.toThrow("add failed");
  });

  it("removeMember calls the SDK with both keys", async () => {
    mockRemoveVirtualMember.mockResolvedValue({ error: undefined });
    await repositoriesApi.removeMember("virt-1", "maven-local");
    expect(mockRemoveVirtualMember).toHaveBeenCalledWith({
      path: { key: "virt-1", member_key: "maven-local" },
    });
  });

  it("removeMember throws on SDK error", async () => {
    mockRemoveVirtualMember.mockResolvedValue({ error: new Error("remove failed") });
    await expect(repositoriesApi.removeMember("virt-1", "maven-local")).rejects.toThrow("remove failed");
  });

  it("reorderMembers sends the new priorities and adapts the result", async () => {
    mockUpdateVirtualMembers.mockResolvedValue({
      data: { members: [sdkMember({ priority: 1 }), sdkMember({ id: "m2", priority: 2 })] },
      error: undefined,
    });
    const result = await repositoriesApi.reorderMembers("virt-1", [
      { member_key: "maven-local", priority: 1 },
      { member_key: "pypi-local", priority: 2 },
    ]);
    expect(mockUpdateVirtualMembers).toHaveBeenCalledWith({
      path: { key: "virt-1" },
      body: { members: [
        { member_key: "maven-local", priority: 1 },
        { member_key: "pypi-local", priority: 2 },
      ] },
    });
    expect(result.members).toHaveLength(2);
  });

  it("reorderMembers throws on SDK error", async () => {
    mockUpdateVirtualMembers.mockResolvedValue({ data: undefined, error: new Error("reorder failed") });
    await expect(
      repositoriesApi.reorderMembers("virt-1", [{ member_key: "x", priority: 1 }])
    ).rejects.toThrow("reorder failed");
  });
});

// ---------------------------------------------------------------------------
// Routing rules (#263)
// ---------------------------------------------------------------------------

describe("repositoriesApi routing rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getRoutingRules issues a GET to the routing-rules endpoint", async () => {
    mockApiFetch.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    const result = await repositoriesApi.getRoutingRules("npm-proxy");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/repositories/npm-proxy/routing-rules");
    expect(result.repository_key).toBe("npm-proxy");
  });

  it("getRoutingRules encodes the repo key", async () => {
    mockApiFetch.mockResolvedValue({ repository_key: "a/b", rules: [] });
    await repositoriesApi.getRoutingRules("a/b");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/repositories/a%2Fb/routing-rules");
  });

  it("setRoutingRules POSTs the rules array", async () => {
    const rules = [{ path_pattern: "^/a/(.*)$", rewrite_to: "/b/$1" }];
    mockApiFetch.mockResolvedValue({ repository_key: "npm-proxy", rules });
    const result = await repositoriesApi.setRoutingRules("npm-proxy", rules);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy/routing-rules",
      { method: "POST", body: JSON.stringify({ rules }) }
    );
    expect(result.rules).toEqual(rules);
  });

  it("deleteRoutingRules issues a DELETE", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await repositoriesApi.deleteRoutingRules("npm-proxy");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy/routing-rules",
      { method: "DELETE" }
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("routing boom"));
    await expect(repositoriesApi.getRoutingRules("npm-proxy")).rejects.toThrow("routing boom");
  });
});

// ---------------------------------------------------------------------------
// Release target (#260) + age policy (#265)
// ---------------------------------------------------------------------------

describe("repositoriesApi.setReleaseTarget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCHes the release_repository_key and adapts the returned repo", async () => {
    mockApiFetch.mockResolvedValue(sdkRepo({ key: "staging-repo" }));
    const result = await repositoriesApi.setReleaseTarget("staging-repo", "maven-release");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/staging-repo",
      { method: "PATCH", body: JSON.stringify({ release_repository_key: "maven-release" }) }
    );
    expect(result.key).toBe("staging-repo");
  });

  it("sends an empty string to unlink the release target", async () => {
    mockApiFetch.mockResolvedValue(sdkRepo({ key: "staging-repo" }));
    await repositoriesApi.setReleaseTarget("staging-repo", "");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/staging-repo",
      { method: "PATCH", body: JSON.stringify({ release_repository_key: "" }) }
    );
  });
});

describe("repositoriesApi.updateAgePolicy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends quarantine_enabled and duration when enabled", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await repositoriesApi.updateAgePolicy("npm-proxy", { enabled: true, duration_minutes: 120 });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy",
      { method: "PATCH", body: JSON.stringify({ quarantine_enabled: true, quarantine_duration_minutes: 120 }) }
    );
  });

  it("still sends the duration when disabled so it is preserved", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await repositoriesApi.updateAgePolicy("npm-proxy", { enabled: false, duration_minutes: 60 });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-proxy",
      { method: "PATCH", body: JSON.stringify({ quarantine_enabled: false, quarantine_duration_minutes: 60 }) }
    );
  });

  it("propagates errors from apiFetch", async () => {
    mockApiFetch.mockRejectedValue(new Error("age policy boom"));
    await expect(
      repositoriesApi.updateAgePolicy("npm-proxy", { enabled: true, duration_minutes: 10 })
    ).rejects.toThrow("age policy boom");
  });
});
