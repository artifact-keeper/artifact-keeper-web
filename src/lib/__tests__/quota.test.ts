import { describe, it, expect } from "vitest";
import {
  barPercent,
  effectiveMaxUpload,
  formatPercent,
  formatQuotaDate,
  formatUsage,
  parseInstanceQuota,
  quotaNotices,
  quotaRefusalFrom,
  QuotaRefusalError,
  storageNotice,
  transferNotice,
  storageSeverity,
  transferSeverity,
  type StorageQuota,
  type TransferQuota,
} from "../quota";

const GiB = 1024 ** 3;

function storage(overrides: Partial<StorageQuota> = {}): StorageQuota {
  return { quotaBytes: 10 * GiB, usedBytes: 8.2 * GiB, percent: 82, warnPercent: 80, state: "warning", ...overrides };
}

function transfer(overrides: Partial<TransferQuota> = {}): TransferQuota {
  return {
    quotaBytes: 50 * GiB,
    usedBytes: 42.5 * GiB,
    percent: 85,
    warnPercent: 80,
    gracePercent: 25,
    hardLimitBytes: 62.5 * GiB,
    state: "warning",
    periodStart: "2026-11-01T00:00:00Z",
    periodEnd: "2026-12-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseInstanceQuota", () => {
  it("returns null for an older backend that reports no quota fields", () => {
    expect(parseInstanceQuota({ total_repositories: 1 })).toBeNull();
    expect(parseInstanceQuota(null)).toBeNull();
    expect(parseInstanceQuota("nope")).toBeNull();
    expect(parseInstanceQuota([])).toBeNull();
  });

  it("reads a full response", () => {
    const q = parseInstanceQuota({
      storage_quota: { enabled: true, quota_bytes: 100, used_bytes: 101, percent: 101, warn_percent: 90, state: "exceeded" },
      transfer_quota: {
        enabled: true,
        quota_bytes: 200,
        used_bytes: 210,
        percent: 105,
        warn_percent: 80,
        grace_percent: 25,
        hard_limit_bytes: 250,
        state: "over",
        period_start: "2026-11-01T00:00:00Z",
        period_end: "2026-12-01T00:00:00Z",
      },
      max_upload_bytes: 5000,
      quota_help_url: " https://example.com/help ",
    });
    expect(q).toEqual({
      storage: { quotaBytes: 100, usedBytes: 101, percent: 101, warnPercent: 90, state: "exceeded" },
      transfer: {
        quotaBytes: 200,
        usedBytes: 210,
        percent: 105,
        warnPercent: 80,
        gracePercent: 25,
        hardLimitBytes: 250,
        state: "over",
        periodStart: "2026-11-01T00:00:00Z",
        periodEnd: "2026-12-01T00:00:00Z",
      },
      maxUploadBytes: 5000,
      helpUrl: "https://example.com/help",
    });
  });

  it("treats a disabled or quota-less entry as no quota", () => {
    const q = parseInstanceQuota({
      storage_quota: { enabled: false, quota_bytes: null, used_bytes: 5 },
      transfer_quota: { enabled: true, quota_bytes: 0, used_bytes: 5 },
      max_upload_bytes: 0,
      quota_help_url: null,
    });
    expect(q).toEqual({ storage: null, transfer: null, maxUploadBytes: null, helpUrl: null });
  });

  it("drops a help link that is not http(s)", () => {
    expect(parseInstanceQuota({ max_upload_bytes: 1, quota_help_url: "javascript:alert(1)" })?.helpUrl).toBeNull();
  });

  it("derives percent and state when the backend leaves them out", () => {
    const q = parseInstanceQuota({
      storage_quota: { enabled: true, quota_bytes: 100, used_bytes: 85 },
      transfer_quota: { enabled: true, quota_bytes: 100, used_bytes: 130, grace_percent: 25 },
    });
    expect(q?.storage).toMatchObject({ percent: 85, warnPercent: 80, state: "warning" });
    // hard limit = 100 * 125 / 100
    expect(q?.transfer).toMatchObject({ percent: 130, hardLimitBytes: 125, state: "refusing", periodEnd: null });
  });

  it("derives every storage and transfer state", () => {
    const s = (used: number) =>
      parseInstanceQuota({ storage_quota: { enabled: true, quota_bytes: 100, used_bytes: used, state: "bogus" } })?.storage?.state;
    expect([s(10), s(80), s(100)]).toEqual(["ok", "warning", "exceeded"]);
    const t = (used: number) =>
      parseInstanceQuota({ transfer_quota: { enabled: true, quota_bytes: 100, used_bytes: used, grace_percent: 10 } })?.transfer?.state;
    expect([t(10), t(80), t(105), t(110)]).toEqual(["ok", "warning", "over", "refusing"]);
  });

  it("falls back to an 80 % warning threshold for nonsense values", () => {
    const q = parseInstanceQuota({ storage_quota: { enabled: true, quota_bytes: 100, used_bytes: 0, warn_percent: 500 } });
    expect(q?.storage?.warnPercent).toBe(80);
  });
});

describe("formatting", () => {
  it("rounds percentages down", () => {
    expect(formatPercent(82.9)).toBe("82%");
    expect(formatPercent(99.6)).toBe("99%");
    expect(formatPercent(104.2)).toBe("104%");
    expect(formatPercent(Number.NaN)).toBe("--");
    expect(formatPercent(-1)).toBe("--");
  });

  it("formats usage in binary units", () => {
    expect(formatUsage(11274290864, 150 * GiB)).toBe("10.5 GiB / 150 GiB");
    expect(formatUsage(0, 2 * 1024 * GiB)).toBe("0 B / 2 TiB");
  });

  it("shows the period end as a UTC calendar date", () => {
    expect(formatQuotaDate("2026-12-01T00:00:00Z")).toBe("Dec 1, 2026");
    expect(formatQuotaDate(null)).toBeNull();
    expect(formatQuotaDate("not a date")).toBeNull();
  });

  it("clamps the bar width", () => {
    expect(barPercent(-5)).toBe(0);
    expect(barPercent(Number.NaN)).toBe(0);
    expect(barPercent(42)).toBe(42);
    expect(barPercent(130)).toBe(100);
  });

  it("picks the smallest advertised upload limit", () => {
    expect(effectiveMaxUpload(0, null, undefined)).toBe(0);
    expect(effectiveMaxUpload(500, null)).toBe(500);
    expect(effectiveMaxUpload(0, 300)).toBe(300);
    expect(effectiveMaxUpload(500, 300)).toBe(300);
  });
});

describe("notices", () => {
  it("has none for no quota or healthy quotas", () => {
    expect(quotaNotices(null, true)).toEqual([]);
    expect(quotaNotices(undefined, true)).toEqual([]);
    expect(
      quotaNotices({ storage: storage({ state: "ok" }), transfer: transfer({ state: "ok" }), maxUploadBytes: null, helpUrl: null }, true),
    ).toEqual([]);
  });

  it("warns about storage near the quota", () => {
    const n = storageNotice(storage(), true);
    expect(n).toMatchObject({ kind: "storage", tone: "warning", severity: 1 });
    expect(n?.message).toBe(
      "Storage is at 82% of the quota (8.2 GiB / 10 GiB). New uploads will be refused once it is full.",
    );
  });

  it("explains an exceeded storage quota, with advice by role", () => {
    expect(storageNotice(storage({ state: "exceeded" }), true)?.message).toBe(
      "Storage quota reached: new uploads are refused; downloads still work. Delete artifacts or raise the quota.",
    );
    expect(storageNotice(storage({ state: "exceeded" }), false)?.message).toContain(
      "ask an administrator to raise the quota",
    );
  });

  it("describes each transfer state", () => {
    expect(transferNotice(transfer(), true)?.message).toBe(
      "Downloads this month are at 85% of the transfer quota (42.5 GiB / 50 GiB); it resets on Dec 1, 2026.",
    );
    expect(transferNotice(transfer({ state: "over", usedBytes: 55 * GiB, percent: 110 }), true)?.message).toBe(
      "Monthly transfer quota exceeded (55 GiB / 50 GiB). Downloads still work for now, but will be refused after 62.5 GiB until Dec 1, 2026.",
    );
    const refusing = transferNotice(transfer({ state: "refusing", usedBytes: 63 * GiB, percent: 126 }), true);
    expect(refusing).toMatchObject({ tone: "critical", severity: 3 });
    expect(refusing?.message).toBe(
      "Monthly transfer quota used up (63 GiB / 50 GiB): downloads are refused until Dec 1, 2026. Raise the transfer quota to restore them sooner.",
    );
    expect(transferNotice(transfer({ state: "refusing" }), false)?.message).not.toContain("Raise");
  });

  it("omits the date when the period end is unknown", () => {
    expect(transferNotice(transfer({ periodEnd: null }), true)?.message).toMatch(/\(42\.5 GiB \/ 50 GiB\)\.$/);
    expect(transferNotice(transfer({ state: "refusing", periodEnd: null }), false)?.message).toMatch(/downloads are refused\.$/);
  });

  it("orders notices worst first", () => {
    const notices = quotaNotices(
      { storage: storage(), transfer: transfer({ state: "refusing" }), maxUploadBytes: null, helpUrl: null },
      true,
    );
    expect(notices.map((n) => n.kind)).toEqual(["transfer", "storage"]);
  });

  it("ranks severities", () => {
    expect(storageSeverity(null)).toBe(0);
    expect(storageSeverity(storage({ state: "exceeded" }))).toBe(2);
    expect(transferSeverity(null)).toBe(0);
    expect(transferSeverity(transfer({ state: "over" }))).toBe(2);
  });
});

describe("quotaRefusalFrom", () => {
  it("recognises an instance storage refusal and keeps the server's words", () => {
    const err = quotaRefusalFrom(
      403,
      JSON.stringify({
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "Instance storage quota of 10 GiB reached",
        scope: "instance",
        limit_bytes: 100,
        used_bytes: 100,
        help_url: "https://example.com/q",
      }),
    );
    expect(err).toBeInstanceOf(QuotaRefusalError);
    expect(err).toMatchObject({
      kind: "storage",
      status: 403,
      message: "Instance storage quota of 10 GiB reached",
      helpUrl: "https://example.com/q",
      limitBytes: 100,
    });
  });

  it("recognises repository and transfer refusals from parsed bodies", () => {
    expect(quotaRefusalFrom(403, { code: "QUOTA_EXCEEDED", message: "repo full" })).toMatchObject({
      kind: "repository",
      message: "repo full",
    });
    expect(quotaRefusalFrom(429, { code: "TRANSFER_QUOTA_EXCEEDED", error: "transfer used up" })).toMatchObject({
      kind: "transfer",
      message: "transfer used up",
      helpUrl: null,
    });
  });

  it("uses a generic quota message when the body has none", () => {
    expect(quotaRefusalFrom(403, { code: "QUOTA_EXCEEDED" })?.message).toBe(
      "The upload was refused because a quota has been reached.",
    );
  });

  it("reads a structured 413 and explains a bare one", () => {
    expect(quotaRefusalFrom(413, { code: "PAYLOAD_TOO_LARGE", message: "Upload of 3 GiB exceeds 2 GiB" })?.message).toBe(
      "Upload of 3 GiB exceeds 2 GiB",
    );
    expect(quotaRefusalFrom(413, { code: "PAYLOAD_TOO_LARGE", limit_bytes: 2 * GiB })?.message).toBe(
      "File exceeds the maximum upload size of 2 GiB.",
    );
    expect(quotaRefusalFrom(413, "<html>413 Request Entity Too Large</html>")?.message).toBe(
      "File exceeds the maximum upload size allowed by the server.",
    );
    expect(quotaRefusalFrom(413, { error: "Payload Too Large" })?.message).toBe(
      "File exceeds the maximum upload size allowed by the server.",
    );
  });

  it("ignores other errors and drops unsafe help links", () => {
    expect(quotaRefusalFrom(403, { code: "FORBIDDEN", message: "no" })).toBeNull();
    expect(quotaRefusalFrom(429, "rate limited")).toBeNull();
    expect(quotaRefusalFrom(500, "")).toBeNull();
    expect(
      quotaRefusalFrom(403, { code: "STORAGE_QUOTA_EXCEEDED", message: "full", help_url: "javascript:alert(1)" })?.helpUrl,
    ).toBeNull();
  });
});
