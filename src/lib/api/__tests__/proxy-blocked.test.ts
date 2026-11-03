import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const ITEM = {
  repository_id: "r1",
  repository_key: "pypi-remote",
  repository_format: "pypi",
  path: "simple/x/x-1.0.whl",
  name: "x-1.0.whl",
  checksum_sha256: "a".repeat(64),
  max_severity: "high",
  findings_count: 2,
  critical_count: 0,
  high_count: 2,
  medium_count: 0,
  low_count: 0,
  cve_ids: ["CVE-2024-1"],
  scanned_at: "2026-11-01T00:00:00Z",
};

const PAGINATION = { page: 1, per_page: 20, total: 1, total_pages: 1 };

describe("proxyBlockedApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends would_block=true and reads the summary and each item's action", async () => {
    mockApiFetch.mockResolvedValue({
      items: [{ ...ITEM, proxy_scan_action: "record_only" }],
      pagination: PAGINATION,
      would_block_summary: {
        would_block_digests: 3,
        no_verdict: 2,
        stale_verdict: 1,
        clean_graded_nothing: 4,
      },
    });
    const { proxyBlockedApi } = await import("../proxy-blocked");
    const out = await proxyBlockedApi.list({ would_block: true, page: 1, per_page: 20 });
    const url = new URL(mockApiFetch.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/v1/security/proxy-blocked");
    expect(url.searchParams.get("would_block")).toBe("true");
    expect(out.items[0].proxy_scan_action).toBe("record_only");
    expect(out.would_block_summary).toEqual({
      would_block_digests: 3,
      no_verdict: 2,
      stale_verdict: 1,
      clean_graded_nothing: 4,
    });
  });

  it("does not send would_block for the plain list, and has no summary", async () => {
    mockApiFetch.mockResolvedValue({ items: [ITEM], pagination: PAGINATION });
    const { proxyBlockedApi } = await import("../proxy-blocked");
    const out = await proxyBlockedApi.list({
      repository: "pypi-remote",
      min_severity: "high",
    });
    const url = new URL(mockApiFetch.mock.calls[0][0], "http://x");
    expect(url.searchParams.has("would_block")).toBe(false);
    expect(url.searchParams.get("repository")).toBe("pypi-remote");
    expect(url.searchParams.get("min_severity")).toBe("high");
    expect(out.would_block_summary).toBeNull();
  });

  it("refuses a response that dropped the list", async () => {
    mockApiFetch.mockResolvedValue({ pagination: PAGINATION });
    const { proxyBlockedApi } = await import("../proxy-blocked");
    await expect(proxyBlockedApi.list({})).rejects.toThrow();
  });
});
