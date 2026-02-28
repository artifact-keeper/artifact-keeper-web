import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { serviceAccountsApi } from "../service-accounts";

describe("serviceAccountsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- list ----

  it("list fetches /api/v1/service-accounts and returns items array", async () => {
    const accounts = [
      {
        id: "sa-1",
        username: "ci-bot",
        display_name: "CI Bot",
        is_active: true,
        token_count: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "sa-2",
        username: "deploy-bot",
        is_active: false,
        token_count: 0,
        created_at: "2025-02-01T00:00:00Z",
        updated_at: "2025-02-01T00:00:00Z",
      },
    ];
    mockApiFetch.mockResolvedValue({ items: accounts });

    const result = await serviceAccountsApi.list();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts");
    expect(result).toEqual(accounts);
  });

  it("list returns empty array when items is empty", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });

    const result = await serviceAccountsApi.list();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts");
    expect(result).toEqual([]);
  });

  // ---- get ----

  it("get fetches a single service account by id", async () => {
    const detail = {
      id: "sa-1",
      username: "ci-bot",
      display_name: "CI Bot",
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };
    mockApiFetch.mockResolvedValue(detail);

    const result = await serviceAccountsApi.get("sa-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts/sa-1");
    expect(result).toEqual(detail);
  });

  it("get interpolates the id into the URL path", async () => {
    mockApiFetch.mockResolvedValue({ id: "sa-xyz" });

    await serviceAccountsApi.get("sa-xyz");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-xyz"
    );
  });

  // ---- create ----

  it("create sends POST with request body and returns detail", async () => {
    const req = { name: "new-bot", description: "Deployment service account" };
    const detail = {
      id: "sa-new",
      username: "new-bot",
      display_name: undefined,
      is_active: true,
      created_at: "2025-03-01T00:00:00Z",
      updated_at: "2025-03-01T00:00:00Z",
    };
    mockApiFetch.mockResolvedValue(detail);

    const result = await serviceAccountsApi.create(req);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts", {
      method: "POST",
      body: JSON.stringify(req),
    });
    expect(result).toEqual(detail);
  });

  it("create sends POST with only required fields", async () => {
    const req = { name: "minimal-bot" };
    mockApiFetch.mockResolvedValue({ id: "sa-min", username: "minimal-bot" });

    await serviceAccountsApi.create(req);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts", {
      method: "POST",
      body: JSON.stringify({ name: "minimal-bot" }),
    });
  });

  // ---- update ----

  it("update sends PATCH with id in URL and request body", async () => {
    const req = { display_name: "Updated Bot", is_active: false };
    const updated = {
      id: "sa-1",
      username: "ci-bot",
      display_name: "Updated Bot",
      is_active: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-03-15T00:00:00Z",
    };
    mockApiFetch.mockResolvedValue(updated);

    const result = await serviceAccountsApi.update("sa-1", req);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts/sa-1", {
      method: "PATCH",
      body: JSON.stringify(req),
    });
    expect(result).toEqual(updated);
  });

  it("update sends PATCH with partial fields", async () => {
    const req = { is_active: true };
    mockApiFetch.mockResolvedValue({ id: "sa-2", is_active: true });

    await serviceAccountsApi.update("sa-2", req);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts/sa-2", {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
  });

  // ---- delete ----

  it("delete sends DELETE with id in URL", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await serviceAccountsApi.delete("sa-1");

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/service-accounts/sa-1", {
      method: "DELETE",
    });
  });

  it("delete resolves without returning a value", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    const result = await serviceAccountsApi.delete("sa-1");

    expect(result).toBeUndefined();
  });

  // ---- listTokens ----

  it("listTokens fetches tokens for a service account and returns items", async () => {
    const tokens = [
      {
        id: "tok-1",
        name: "CI Token",
        token_prefix: "akt_abc",
        scopes: ["read", "write"],
        expires_at: "2026-01-01T00:00:00Z",
        last_used_at: "2025-12-01T00:00:00Z",
        created_at: "2025-01-01T00:00:00Z",
        is_expired: false,
        repository_ids: ["repo-1"],
      },
      {
        id: "tok-2",
        name: "Deploy Token",
        token_prefix: "akt_def",
        scopes: ["read"],
        created_at: "2025-06-01T00:00:00Z",
        is_expired: true,
        repository_ids: [],
      },
    ];
    mockApiFetch.mockResolvedValue({ items: tokens });

    const result = await serviceAccountsApi.listTokens("sa-1");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-1/tokens"
    );
    expect(result).toEqual(tokens);
  });

  it("listTokens returns empty array when no tokens exist", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });

    const result = await serviceAccountsApi.listTokens("sa-empty");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-empty/tokens"
    );
    expect(result).toEqual([]);
  });

  // ---- createToken ----

  it("createToken sends POST with token request body", async () => {
    const req = {
      name: "New Token",
      scopes: ["read", "write"],
      expires_in_days: 90,
      description: "For CI pipeline",
      repository_ids: ["repo-1", "repo-2"],
    };
    const response = {
      id: "tok-new",
      token: "akt_full_secret_token_value",
      name: "New Token",
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await serviceAccountsApi.createToken("sa-1", req);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-1/tokens",
      {
        method: "POST",
        body: JSON.stringify(req),
      }
    );
    expect(result).toEqual(response);
  });

  it("createToken sends POST with minimal required fields", async () => {
    const req = { name: "Minimal Token", scopes: ["read"] };
    mockApiFetch.mockResolvedValue({
      id: "tok-min",
      token: "akt_min_token",
      name: "Minimal Token",
    });

    await serviceAccountsApi.createToken("sa-2", req);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-2/tokens",
      {
        method: "POST",
        body: JSON.stringify({ name: "Minimal Token", scopes: ["read"] }),
      }
    );
  });

  it("createToken sends POST with repo_selector in request", async () => {
    const req = {
      name: "Scoped Token",
      scopes: ["read"],
      repo_selector: {
        match_formats: ["npm", "maven"],
        match_pattern: "prod-*",
      },
    };
    mockApiFetch.mockResolvedValue({
      id: "tok-scoped",
      token: "akt_scoped",
      name: "Scoped Token",
    });

    await serviceAccountsApi.createToken("sa-1", req);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-1/tokens",
      {
        method: "POST",
        body: JSON.stringify(req),
      }
    );
  });

  // ---- revokeToken ----

  it("revokeToken sends DELETE with service account id and token id", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await serviceAccountsApi.revokeToken("sa-1", "tok-1");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-1/tokens/tok-1",
      { method: "DELETE" }
    );
  });

  it("revokeToken resolves without returning a value", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    const result = await serviceAccountsApi.revokeToken("sa-1", "tok-2");

    expect(result).toBeUndefined();
  });

  it("revokeToken uses correct URL path with both ids interpolated", async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await serviceAccountsApi.revokeToken("sa-abc", "tok-xyz");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/sa-abc/tokens/tok-xyz",
      { method: "DELETE" }
    );
  });

  // ---- previewRepoSelector ----

  it("previewRepoSelector sends POST with selector wrapped in repo_selector key", async () => {
    const selector = {
      match_labels: { env: "production" },
      match_formats: ["npm", "pypi"],
      match_pattern: "prod-*",
    };
    const response = {
      matched_repositories: [
        { id: "repo-1", key: "prod-npm", format: "npm" },
        { id: "repo-2", key: "prod-pypi", format: "pypi" },
      ],
      total: 2,
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await serviceAccountsApi.previewRepoSelector(selector);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/repo-selector/preview",
      {
        method: "POST",
        body: JSON.stringify({ repo_selector: selector }),
      }
    );
    expect(result).toEqual(response);
  });

  it("previewRepoSelector sends POST with match_repos selector", async () => {
    const selector = {
      match_repos: ["my-npm-repo", "my-maven-repo"],
    };
    const response = {
      matched_repositories: [
        { id: "repo-a", key: "my-npm-repo", format: "npm" },
        { id: "repo-b", key: "my-maven-repo", format: "maven" },
      ],
      total: 2,
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await serviceAccountsApi.previewRepoSelector(selector);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/repo-selector/preview",
      {
        method: "POST",
        body: JSON.stringify({ repo_selector: selector }),
      }
    );
    expect(result).toEqual(response);
  });

  it("previewRepoSelector handles empty selector returning no matches", async () => {
    const selector = {};
    const response = {
      matched_repositories: [],
      total: 0,
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await serviceAccountsApi.previewRepoSelector(selector);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/service-accounts/repo-selector/preview",
      {
        method: "POST",
        body: JSON.stringify({ repo_selector: {} }),
      }
    );
    expect(result).toEqual(response);
  });
});
