import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
// Real ApiError so the capability guard's `instanceof` check is the production
// one; only the transport is stubbed.
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return {
    ApiError: actual.ApiError,
    assertData: <T,>(d: T) => d,
    apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  };
});
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

import { ApiError } from "../fetch";
import ageGateApi, {
  AgeGatePartialTransitionError,
  ReopenUnsupportedError,
  isReopenSupported,
  resetReopenSupport,
} from "../age-gate";

/** The adapted (camelCase) shape the composite status change takes. */
const LOCAL_REVIEW = {
  id: "rv1",
  packageName: "leftpad-clone",
  packageVersion: "0.0.1",
  repositoryKey: "npm-remote",
  status: "pending",
  requestCount: 4,
  requestedAt: "2026-07-15T00:00:00Z",
  lastRequestedAt: "2026-07-20T00:00:00Z",
  upstreamPublishedAt: "2026-07-10T00:00:00Z",
  ageDaysAtRequest: 5,
  reviewReason: null,
  reviewedAt: null,
  reviewedBy: null,
};

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

beforeEach(() => {
  vi.clearAllMocks();
  resetReopenSupport();
});

describe("ageGateApi", () => {
  it("listReviews sends the status filter and maps results, computing age at request", async () => {
    m.listReviews.mockResolvedValue({
      data: { items: [REVIEW], pagination: { page: 1, per_page: 20, total: 1 } },
      error: undefined,
    });
    const out = await ageGateApi.listReviews({ statuses: ["pending"] });
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

  it("listReviews joins several statuses into one comma-separated filter", async () => {
    m.listReviews.mockResolvedValue({ data: { items: [], pagination: {} }, error: undefined });
    await ageGateApi.listReviews({ statuses: ["approved", "rejected"] });
    expect(m.listReviews).toHaveBeenCalledWith({
      query: { status: "approved,rejected", repository_key: undefined, page: undefined, per_page: undefined },
    });
  });

  it("listReviews omits the status filter entirely when no statuses are given", async () => {
    m.listReviews.mockResolvedValue({ data: { items: [], pagination: {} }, error: undefined });
    await ageGateApi.listReviews({ statuses: [] });
    expect(m.listReviews.mock.calls[0][0].query.status).toBeUndefined();
  });

  it("reopenReview posts the required reason to the reopen endpoint", async () => {
    mockApiFetch.mockResolvedValue({ ...REVIEW, status: "pending", review_reason: "wrong package" });
    const out = await ageGateApi.reopenReview("rv1", "  wrong package  ");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/age-gate/reviews/rv1/reopen", {
      method: "POST",
      body: JSON.stringify({ reason: "wrong package" }),
    });
    expect(out.status).toBe("pending");
    expect(out.reviewReason).toBe("wrong package");
  });

  it("reopenReview refuses a blank reason without calling the API", async () => {
    await expect(ageGateApi.reopenReview("rv1", "   ")).rejects.toThrow(/reason is required/i);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("changeReviewStatus decides a pending review with a single call", async () => {
    m.approveReview.mockResolvedValue({ data: { ...REVIEW, status: "approved" }, error: undefined });
    const out = await ageGateApi.changeReviewStatus(LOCAL_REVIEW, "approved", "known good");
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(m.approveReview).toHaveBeenCalledWith({ path: { id: "rv1" }, body: { reason: "known good" } });
    expect(out.status).toBe("approved");
  });

  it("changeReviewStatus reopens a decided review on its way to the other decision", async () => {
    mockApiFetch.mockResolvedValue({ ...REVIEW, status: "pending" });
    m.rejectReview.mockResolvedValue({ data: { ...REVIEW, status: "rejected" }, error: undefined });
    const out = await ageGateApi.changeReviewStatus(
      { ...LOCAL_REVIEW, status: "approved" },
      "rejected",
      "cve landed",
    );
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/age-gate/reviews/rv1/reopen", {
      method: "POST",
      body: JSON.stringify({ reason: "cve landed" }),
    });
    expect(m.rejectReview).toHaveBeenCalledWith({ path: { id: "rv1" }, body: { reason: "cve landed" } });
    expect(out.status).toBe("rejected");
  });

  it("changeReviewStatus stops after the reopen when the target is pending", async () => {
    mockApiFetch.mockResolvedValue({ ...REVIEW, status: "pending" });
    const out = await ageGateApi.changeReviewStatus(
      { ...LOCAL_REVIEW, status: "approved" },
      "pending",
      "needs another look",
    );
    expect(m.approveReview).not.toHaveBeenCalled();
    expect(m.rejectReview).not.toHaveBeenCalled();
    expect(out.status).toBe("pending");
  });

  it("changeReviewStatus reports the review as pending when the reopen lands but the decision fails", async () => {
    mockApiFetch.mockResolvedValue({ ...REVIEW, status: "pending" });
    m.rejectReview.mockResolvedValue({ data: undefined, error: { status: 500 } });
    const err = await ageGateApi
      .changeReviewStatus({ ...LOCAL_REVIEW, status: "approved" }, "rejected", "cve landed")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgeGatePartialTransitionError);
    const partial = err as AgeGatePartialTransitionError;
    expect(partial.currentStatus).toBe("pending");
    expect(partial.intendedStatus).toBe("rejected");
    expect(partial.failure).toEqual({ status: 500 });
    expect(partial.message).toMatch(/reopened but could not be rejected.*now pending/i);
  });

  it("changeReviewStatus surfaces a failed reopen as an ordinary error, not a partial transition", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 403: forbidden"));
    const err = await ageGateApi
      .changeReviewStatus({ ...LOCAL_REVIEW, status: "approved" }, "rejected", "cve landed")
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AgeGatePartialTransitionError);
    expect(m.rejectReview).not.toHaveBeenCalled();
  });

  it("changeReviewStatus refuses a no-op transition to the status already recorded", async () => {
    await expect(
      ageGateApi.changeReviewStatus({ ...LOCAL_REVIEW, status: "approved" }, "approved", "why not"),
    ).rejects.toThrow(/already approved/i);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  describe("reopen capability detection", () => {
    /** Framework default 404 for a path that was never routed: empty body. */
    const missingEndpoint = () => new ApiError(404, "");
    /** The handler's own 404 for an id that is not in the table. */
    const missingReview = () =>
      new ApiError(404, '{"code":"NOT_FOUND","message":"Age gate review not found"}');

    it("reads a 404 with no error envelope as the endpoint being absent", async () => {
      mockApiFetch.mockRejectedValue(missingEndpoint());
      await expect(ageGateApi.reopenReview("rv1", "wrong package")).rejects.toBeInstanceOf(
        ReopenUnsupportedError,
      );
      expect(isReopenSupported()).toBe(false);
    });

    it("stops calling the endpoint once it is known to be absent", async () => {
      mockApiFetch.mockRejectedValue(missingEndpoint());
      await expect(ageGateApi.reopenReview("rv1", "first try")).rejects.toBeInstanceOf(
        ReopenUnsupportedError,
      );
      expect(mockApiFetch).toHaveBeenCalledTimes(1);

      await expect(ageGateApi.reopenReview("rv2", "second try")).rejects.toBeInstanceOf(
        ReopenUnsupportedError,
      );
      expect(mockApiFetch).toHaveBeenCalledTimes(1); // no re-probe
    });

    it("does not latch on a 404 for an unknown review id", async () => {
      mockApiFetch.mockRejectedValue(missingReview());
      const err = await ageGateApi.reopenReview("nope", "wrong package").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ReopenUnsupportedError);
      expect(isReopenSupported()).toBe(true);
    });

    it("does not latch on a non-404 failure", async () => {
      mockApiFetch.mockRejectedValue(new ApiError(500, ""));
      await expect(ageGateApi.reopenReview("rv1", "wrong package")).rejects.toBeInstanceOf(ApiError);
      expect(isReopenSupported()).toBe(true);
    });

    it("blocks a reopen-dependent transition without touching either endpoint", async () => {
      mockApiFetch.mockRejectedValue(missingEndpoint());
      await ageGateApi.reopenReview("rv1", "probe").catch(() => {});
      mockApiFetch.mockClear();

      const err = await ageGateApi
        .changeReviewStatus({ ...LOCAL_REVIEW, status: "approved" }, "rejected", "cve landed")
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ReopenUnsupportedError);
      // Nothing was attempted, so this is not a partial transition: the review
      // is still exactly where the operator found it.
      expect(err).not.toBeInstanceOf(AgeGatePartialTransitionError);
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(m.rejectReview).not.toHaveBeenCalled();
    });

    it("still decides a pending review when reopen is unsupported", async () => {
      mockApiFetch.mockRejectedValue(missingEndpoint());
      await ageGateApi.reopenReview("rv1", "probe").catch(() => {});
      expect(isReopenSupported()).toBe(false);

      m.approveReview.mockResolvedValue({ data: { ...REVIEW, status: "approved" }, error: undefined });
      m.rejectReview.mockResolvedValue({ data: { ...REVIEW, status: "rejected" }, error: undefined });

      await expect(ageGateApi.changeReviewStatus(LOCAL_REVIEW, "approved", "known good")).resolves
        .toMatchObject({ status: "approved" });
      await expect(ageGateApi.changeReviewStatus(LOCAL_REVIEW, "rejected", "")).resolves
        .toMatchObject({ status: "rejected" });
    });

    it("treats a successful reopen as proof the endpoint is there", async () => {
      mockApiFetch.mockResolvedValue({ ...REVIEW, status: "pending" });
      await ageGateApi.reopenReview("rv1", "wrong package");
      expect(isReopenSupported()).toBe(true);
    });
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
