import { describe, it, expect, vi, beforeEach } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  describeRevoke,
  describeRevokeById,
  reportRevokeOutcome,
  scanDetailHref,
} from "../acknowledgements";

beforeEach(() => vi.clearAllMocks());

describe("scanDetailHref", () => {
  const scan = { id: "s0", artifact_id: "a2", repository_id: "r2" };

  it("names the copy for a reused row, which reports its source's id", () => {
    expect(scanDetailHref({ ...scan, is_reused: true })).toBe(
      "/security/scans/s0?artifact_id=a2&repository_id=r2",
    );
  });

  it("stays a plain link for a scan that is its own row", () => {
    expect(scanDetailHref({ ...scan, is_reused: false })).toBe("/security/scans/s0");
    expect(scanDetailHref(scan)).toBe("/security/scans/s0");
  });
});

describe("describeRevoke", () => {
  it("is complete when nothing stays in force", () => {
    expect(describeRevoke({ leftEffective: 0, stillAcknowledged: false }).complete).toBe(true);
  });

  it("is complete on an older backend that reports no count", () => {
    expect(describeRevoke({ leftEffective: null, stillAcknowledged: false }).complete).toBe(true);
  });

  it("says the risk remains accepted elsewhere when copies stay", () => {
    const one = describeRevoke({ leftEffective: 1, stillAcknowledged: false });
    expect(one.complete).toBe(false);
    expect(one.message).toMatch(/remains accepted elsewhere/i);
    expect(one.message).toMatch(/1 copy of this decision stays/i);

    const two = describeRevoke({ leftEffective: 2, stillAcknowledged: false });
    expect(two.message).toMatch(/2 copies of this decision stay/i);
  });

  it("is not complete while the finding still reads as acknowledged here", () => {
    const out = describeRevoke({ leftEffective: 0, stillAcknowledged: true });
    expect(out.complete).toBe(false);
    expect(out.message).toMatch(/still acknowledged here/i);
  });
});

describe("describeRevokeById", () => {
  it("is complete when it revoked and left nothing", () => {
    expect(describeRevokeById({ revoked: 2, left_effective: 0 }).complete).toBe(true);
  });

  it("does not claim a revoke when nothing was revoked", () => {
    const out = describeRevokeById({ revoked: 0, left_effective: 0 });
    expect(out.complete).toBe(false);
    expect(out.message).toMatch(/nothing was revoked/i);
  });

  it("says the risk remains accepted, without saying only elsewhere", () => {
    // The by-id count includes a separate decision for every repository, which
    // can still cover the finding in this very repository.
    const out = describeRevokeById({ revoked: 1, left_effective: 1 });
    expect(out.complete).toBe(false);
    expect(out.message).toMatch(/remains accepted/i);
    expect(out.message).toMatch(/every repository/i);
    expect(out.message).not.toMatch(/elsewhere/i);
  });
});

describe("reportRevokeOutcome", () => {
  it("uses a success toast only for a complete revoke", () => {
    reportRevokeOutcome({ complete: true, message: "done" });
    expect(toast.success).toHaveBeenCalledWith("done");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("keeps a partial revoke on screen until it is dismissed", () => {
    reportRevokeOutcome({ complete: false, message: "partial" });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      "partial",
      expect.objectContaining({ duration: Infinity, closeButton: true }),
    );
  });
});
