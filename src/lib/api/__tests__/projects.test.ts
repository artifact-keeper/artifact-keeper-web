import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
const mockRepoList = vi.fn();
vi.mock("../fetch", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public body: string,
    ) {
      super(`API error ${status}: ${body}`);
    }
  }
  return { apiFetch: (...args: unknown[]) => mockApiFetch(...args), ApiError };
});
vi.mock("../repositories", () => ({
  repositoriesApi: { list: (...args: unknown[]) => mockRepoList(...args) },
}));

import { ApiError } from "../fetch";
import {
  projectsApi,
  actionsForRole,
  roleLabelForActions,
  PROJECT_KEY_PATTERN,
} from "../projects";

const wire = (id: string, key: string, extra: object = {}) => ({
  id,
  key,
  name: key.toUpperCase(),
  description: null,
  quota_bytes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...extra,
});

describe("projectsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list adapts null description and non-positive quota", async () => {
    mockApiFetch.mockResolvedValue({
      items: [wire("1", "alpha", { quota_bytes: 0 }), wire("2", "beta", { quota_bytes: 1024, description: "d" })],
    });
    const result = await projectsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/projects");
    expect(result[0]).toMatchObject({ key: "alpha", description: undefined, quota_bytes: undefined });
    expect(result[1]).toMatchObject({ key: "beta", description: "d", quota_bytes: 1024 });
  });

  it("list falls back to the projects of visible repositories on 403", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/v1/projects") throw new ApiError(403, "{}");
      if (path === "/api/v1/projects/p-b") return wire("p-b", "beta");
      if (path === "/api/v1/projects/p-a") return wire("p-a", "alpha");
      throw new ApiError(403, "{}");
    });
    mockRepoList.mockResolvedValue({
      items: [
        { project_id: "p-b" },
        { project_id: "p-a" },
        { project_id: "p-a" },
        { project_id: undefined },
        { project_id: "p-member-only" },
      ],
    });
    const result = await projectsApi.list();
    expect(result.map((p) => p.key)).toEqual(["alpha", "beta"]);
  });

  it("list rethrows non-403 errors", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, "boom"));
    await expect(projectsApi.list()).rejects.toThrow("boom");
    expect(mockRepoList).not.toHaveBeenCalled();
  });

  it("addMember upserts with POST and the raw actions", async () => {
    mockApiFetch.mockResolvedValue({ principal_type: "user", principal_id: "u1", actions: ["read", "bogus"] });
    const member = await projectsApi.addMember("p1", {
      principal_type: "user",
      principal_id: "u1",
      actions: ["read"],
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/projects/p1/members",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ principal_type: "user", principal_id: "u1", actions: ["read"] }) }),
    );
    expect(member.actions).toEqual(["read"]);
  });

  it("removeMember sends a DELETE with the principal in the body", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await projectsApi.removeMember("p1", { principal_type: "group", principal_id: "g1" });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/projects/p1/members",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ principal_type: "group", principal_id: "g1" }),
      }),
    );
  });
});

describe("project roles", () => {
  it("maps presets to actions and back", () => {
    expect(actionsForRole("developer")).toEqual(["read", "write"]);
    expect(roleLabelForActions(["write", "read"])).toBe("Developer");
    expect(roleLabelForActions(["read", "write", "delete", "admin"])).toBe("Project Admin");
  });

  it("labels an action set no preset matches as Custom", () => {
    expect(roleLabelForActions(["write"])).toBe("Custom");
    expect(roleLabelForActions([])).toBe("Custom");
  });

  it("validates project keys", () => {
    expect(PROJECT_KEY_PATTERN.test("payments")).toBe(true);
    expect(PROJECT_KEY_PATTERN.test("team-1")).toBe(true);
    expect(PROJECT_KEY_PATTERN.test("-bad")).toBe(false);
    expect(PROJECT_KEY_PATTERN.test("Upper")).toBe(false);
    expect(PROJECT_KEY_PATTERN.test("a_b")).toBe(false);
  });
});
