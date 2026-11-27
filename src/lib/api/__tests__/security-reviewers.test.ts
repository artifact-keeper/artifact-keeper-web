import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../fetch")>()),
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}));

import { ApiError } from "../fetch";
import { securityReviewersApi } from "../security-reviewers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("securityReviewersApi", () => {
  it("lists from the admin endpoint", async () => {
    const data = { users: [], groups: [] };
    mockApiFetch.mockResolvedValue(data);
    await expect(securityReviewersApi.list()).resolves.toBe(data);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/security-reviewers");
  });

  it("reads a 404 as a backend without the feature", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, ""));
    await expect(securityReviewersApi.list()).resolves.toBeNull();
  });

  it("does not hide a real failure", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(403, "forbidden"));
    await expect(securityReviewersApi.list()).rejects.toBeInstanceOf(ApiError);
  });

  it("grants with PUT and revokes with DELETE", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await securityReviewersApi.set("groups", "g/1", true);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      "/api/v1/admin/security-reviewers/groups/g%2F1",
      { method: "PUT" },
    );
    await securityReviewersApi.set("users", "u1", false);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      "/api/v1/admin/security-reviewers/users/u1",
      { method: "DELETE" },
    );
  });
});
