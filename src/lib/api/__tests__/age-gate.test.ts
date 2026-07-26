import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listReviews: vi.fn(),
  getReview: vi.fn(),
  approveReview: vi.fn(),
  rejectReview: vi.fn(),
  getRepoAgeGate: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listReviews: (...a: unknown[]) => m.listReviews(...a),
  getReview: (...a: unknown[]) => m.getReview(...a),
  approveReview: (...a: unknown[]) => m.approveReview(...a),
  rejectReview: (...a: unknown[]) => m.rejectReview(...a),
  getRepoAgeGate: (...a: unknown[]) => m.getRepoAgeGate(...a),
}));

import ageGateApi from "../age-gate";

const REVIEW = {
  id: "rv1",
  package_name: "leftpad-clone",
  package_version: "0.0.1",
  repository_key: "npm-remote",
  status: "pending",
  request_count: 4,
  requested_at: "2026-07-15T00:00:00Z",
  last_requested_at: "2026-07-20T00:00:00Z",
  review_reason: null,
  reviewed_at: null,
  reviewed_by: null,
  upstream_published_at: "2026-07-10T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("ageGateApi", () => {
  it("listReviews sends the status filter and maps results, computing age at request", async () => {
    m.listReviews.mockResolvedValue({
      data: { items: [REVIEW], pagination: { page: 1, per_page: 20, total: 1 } },
      error: undefined,
    });
    const out = await ageGateApi.listReviews({ status: "pending" });
    expect(m.listReviews).toHaveBeenCalledWith({
      query: { status: "pending", repository_key: undefined, page: undefined, per_page: undefined },
    });
    expect(out[0]).toMatchObject({
      id: "rv1",
      packageName: "leftpad-clone",
      packageVersion: "0.0.1",
      repositoryKey: "npm-remote",
      status: "pending",
      ageDaysAtRequest: 5,
    });
  });

  it("listReviews throws on error", async () => {
    m.listReviews.mockResolvedValue({ data: undefined, error: { status: 400 } });
    await expect(ageGateApi.listReviews()).rejects.toEqual({ status: 400 });
  });

  it("listReviews leaves ageDaysAtRequest null when the upstream publish date is unknown", async () => {
    m.listReviews.mockResolvedValue({
      data: { items: [{ ...REVIEW, upstream_published_at: null }], pagination: { page: 1, per_page: 20, total: 1 } },
      error: undefined,
    });
    const out = await ageGateApi.listReviews();
    expect(out[0].ageDaysAtRequest).toBeNull();
  });

  it("getReview / approveReview / rejectReview pass the id path param and an optional reason", async () => {
    m.getReview.mockResolvedValue({ data: REVIEW, error: undefined });
    m.approveReview.mockResolvedValue({ data: REVIEW, error: undefined });
    m.rejectReview.mockResolvedValue({ data: REVIEW, error: undefined });
    await ageGateApi.getReview("rv1");
    await ageGateApi.approveReview("rv1", "known-good release");
    await ageGateApi.rejectReview("rv1");
    expect(m.getReview).toHaveBeenCalledWith({ path: { id: "rv1" } });
    expect(m.approveReview).toHaveBeenCalledWith({ path: { id: "rv1" }, body: { reason: "known-good release" } });
    expect(m.rejectReview).toHaveBeenCalledWith({ path: { id: "rv1" }, body: { reason: null } });
  });

  it("approveReview throws on error", async () => {
    m.approveReview.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(ageGateApi.approveReview("rv1")).rejects.toEqual({ status: 500 });
  });

  it("getRepoConfigs dedupes keys and returns a map keyed by repository_key", async () => {
    m.getRepoAgeGate.mockResolvedValue({
      data: { repository_key: "npm-remote", enabled: true, min_age_days: 14 },
      error: undefined,
    });
    const out = await ageGateApi.getRepoConfigs(["npm-remote", "npm-remote"]);
    expect(m.getRepoAgeGate).toHaveBeenCalledTimes(1);
    expect(m.getRepoAgeGate).toHaveBeenCalledWith({ path: { key: "npm-remote" } });
    expect(out).toEqual({ "npm-remote": { repositoryKey: "npm-remote", enabled: true, minAgeDays: 14 } });
  });

  it("getRepoConfigs omits repositories whose policy lookup errors", async () => {
    m.getRepoAgeGate.mockResolvedValue({ data: undefined, error: { status: 404 } });
    const out = await ageGateApi.getRepoConfigs(["no-policy-repo"]);
    expect(out).toEqual({});
  });
});
