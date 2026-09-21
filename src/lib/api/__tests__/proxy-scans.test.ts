import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import {
  proxyScansApi,
  normalizePathResponse,
  parseProxyScansResponse,
} from "../proxy-scans";

/** A minimally valid entry as backend 1.10.0 serializes it. */
function rawEntry(overrides: Record<string, unknown> = {}) {
  return {
    path: "left-pad/-/left-pad-1.3.0.tgz",
    digest: "sha256:abc",
    state: "clean",
    not_scanned_reason: null,
    findings_count: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    max_severity: null,
    scanned_at: "2026-08-01T12:00:00Z",
    cached_at: "2026-07-01T12:00:00Z",
    size_bytes: 1024,
    ...overrides,
  };
}

function rawResponse(overrides: Record<string, unknown> = {}) {
  return {
    repository_key: "npm-remote",
    scan_on_proxy: true,
    proxy_scan_action: "fail_closed",
    summary: {
      clean: 2,
      vulnerable: 1,
      not_scanned: 3,
      pending_ingest: 4,
      total_digests: 6,
    },
    items: [rawEntry()],
    total: 1,
    page: 1,
    per_page: 50,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxyScansApi.list", () => {
  it("GETs the repository-scoped endpoint", async () => {
    mockApiFetch.mockResolvedValue(rawResponse());

    await proxyScansApi.list("npm-remote");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans",
    );
  });

  it("passes pagination through as query parameters", async () => {
    mockApiFetch.mockResolvedValue(rawResponse());

    await proxyScansApi.list("npm-remote", { page: 3, per_page: 25 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans?page=3&per_page=25",
    );
  });

  it("percent-encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue(rawResponse());

    await proxyScansApi.list("team/npm remote");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/team%2Fnpm%20remote/security/proxy-scans",
    );
  });
});

describe("parseProxyScansResponse — backend 1.10.0 shape", () => {
  it("reads the documented envelope, including the summary", () => {
    const parsed = parseProxyScansResponse(rawResponse(), "npm-remote");
    expect(parsed.repository_key).toBe("npm-remote");
    expect(parsed.scan_on_proxy).toBe(true);
    expect(parsed.proxy_scan_action).toBe("fail_closed");
    expect(parsed.summary).toEqual({
      clean: 2,
      vulnerable: 1,
      not_scanned: 3,
      pending_ingest: 4,
      total_digests: 6,
    });
    expect(parsed.total).toBe(1);
    expect(parsed.items[0].digest).toBe("sha256:abc");
    expect(parsed.items[0].cached_at).toBe("2026-07-01T12:00:00Z");
  });

  it("keeps suppressed counts null instead of coalescing them to zero", () => {
    // The backend omits every count for a state with no verdict row. Reading
    // that absence as `0` would render "0 findings", which is the false-clean
    // this surface exists to remove.
    const parsed = parseProxyScansResponse(
      rawResponse({
        items: [
          rawEntry({
            state: "not_scanned",
            not_scanned_reason: "unknown",
            findings_count: null,
            critical_count: null,
            high_count: null,
            medium_count: null,
            low_count: null,
            scanned_at: null,
          }),
        ],
      }),
      "npm-remote",
    );
    const entry = parsed.items[0];
    expect(entry.findings_count).toBeNull();
    expect(entry.critical_count).toBeNull();
    expect(entry.scanned_at).toBeNull();
  });

  it("carries the pending_ingest state and its null digest", () => {
    const parsed = parseProxyScansResponse(
      rawResponse({
        items: [rawEntry({ state: "pending_ingest", digest: null })],
      }),
      "npm-remote",
    );
    expect(parsed.items[0].state).toBe("pending_ingest");
    expect(parsed.items[0].digest).toBeNull();
  });

  it("narrows an unrecognized state to not_scanned, never to clean", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseProxyScansResponse(
      rawResponse({ items: [rawEntry({ state: "quarantined" })] }),
      "npm-remote",
    );
    expect(parsed.items[0].state).toBe("not_scanned");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("narrows an unrecognized not_scanned reason to unknown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseProxyScansResponse(
      rawResponse({
        items: [
          rawEntry({ state: "not_scanned", not_scanned_reason: "over_cap" }),
        ],
      }),
      "npm-remote",
    );
    expect(parsed.items[0].not_scanned_reason).toBe("unknown");
    warn.mockRestore();
  });

  it("keeps an omitted findings list distinct from a recorded empty one", () => {
    // `null` is "not requested at this granularity"; `[]` is "requested, and
    // this digest has no per-CVE detail on record" (anything cached before
    // artifact-keeper#3395). Collapsing the two renders a pre-#3395 artifact
    // as having no CVEs.
    const omitted = parseProxyScansResponse(
      rawResponse({ items: [rawEntry({ state: "vulnerable" })] }),
      "npm-remote",
    );
    expect(omitted.items[0].findings).toBeNull();

    const recordedEmpty = parseProxyScansResponse(
      rawResponse({
        items: [rawEntry({ state: "vulnerable", findings: [] })],
      }),
      "npm-remote",
    );
    expect(recordedEmpty.items[0].findings).toEqual([]);
  });

  it("maps per-CVE detail when the single-path read supplies it", () => {
    const parsed = parseProxyScansResponse(
      rawResponse({
        summary: null,
        items: [
          rawEntry({
            state: "vulnerable",
            findings_count: 1,
            critical_count: 1,
            max_severity: "critical",
            findings: [
              {
                cve_id: "CVE-2021-44228",
                severity: "critical",
                package_name: "log4j-core",
                package_version: "2.14.1",
                fixed_version: "2.15.0",
                title: "Remote code execution",
              },
            ],
          }),
        ],
      }),
      "npm-remote",
    );
    expect(parsed.items[0].findings).toEqual([
      {
        cve_id: "CVE-2021-44228",
        severity: "critical",
        package_name: "log4j-core",
        package_version: "2.14.1",
        fixed_version: "2.15.0",
        title: "Remote code execution",
      },
    ]);
  });

  it("reports an omitted summary as null rather than as zeroed counts", () => {
    // The single-path read omits it. Zeroes would read as "nothing cached".
    const parsed = parseProxyScansResponse(
      rawResponse({ summary: undefined }),
      "npm-remote",
    );
    expect(parsed.summary).toBeNull();
  });

  it("derives total_digests when an older backend omits it", () => {
    const parsed = parseProxyScansResponse(
      rawResponse({
        summary: { clean: 2, vulnerable: 1, not_scanned: 3, pending_ingest: 4 },
      }),
      "npm-remote",
    );
    expect(parsed.summary?.total_digests).toBe(6);
  });

  it("rejects a body with no items list instead of rendering it as empty", () => {
    // An empty table reads as "nothing cached, nothing wrong". A drifted shape
    // has to surface as a failure state, not as that.
    expect(() => parseProxyScansResponse({}, "npm-remote")).toThrow(
      /did not match the expected shape/,
    );
    expect(() => parseProxyScansResponse(null, "npm-remote")).toThrow();
  });

  it("defaults enforcement conservatively when the fields are missing", () => {
    // An older backend that does not carry enforcement context must not be
    // read as "this repository scans and blocks".
    const parsed = parseProxyScansResponse({ items: [] }, "npm-remote");
    expect(parsed.scan_on_proxy).toBe(false);
    expect(parsed.proxy_scan_action).toBe("fail_open");
    expect(parsed.repository_key).toBe("npm-remote");
  });
});

describe("proxyScansApi.getByPath", () => {
  it("encodes the cache path as a query parameter", async () => {
    mockApiFetch.mockResolvedValue(rawResponse({ summary: null }));

    const result = await proxyScansApi.getByPath(
      "npm-remote",
      "left-pad/-/a b.tgz",
    );

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans?path=left-pad%2F-%2Fa+b.tgz",
    );
    expect(result.entry?.state).toBe("clean");
    expect(result.scan_on_proxy).toBe(true);
  });

  it("propagates the error rather than reporting an absent verdict", async () => {
    // Swallowing a failure here would let the caller render "no findings".
    mockApiFetch.mockRejectedValue(new Error("API error 401: unauthorized"));

    await expect(
      proxyScansApi.getByPath("npm-remote", "a.tgz"),
    ).rejects.toThrow(/401/);
  });
});

describe("normalizePathResponse", () => {
  it("flattens the shared envelope's single item", () => {
    const result = normalizePathResponse(
      rawResponse({
        summary: null,
        items: [rawEntry({ state: "vulnerable" })],
      }),
      "npm-remote",
    );
    expect(result.entry?.state).toBe("vulnerable");
    expect(result.proxy_scan_action).toBe("fail_closed");
  });

  it("returns a null entry for an empty result instead of inventing one", () => {
    const result = normalizePathResponse(
      rawResponse({ summary: null, items: [] }),
      "npm-remote",
    );
    expect(result.entry).toBeNull();
  });
});
