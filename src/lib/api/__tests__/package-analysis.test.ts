import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

// Keep the real `ApiError` / `narrowEnum` — the wrapper branches on the
// former and narrows through the latter — and only stub the network call.
vi.mock("@/lib/api/fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/fetch")>();
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

import { ApiError } from "@/lib/api/fetch";

const COMPONENT = {
  name: "libpng",
  version: "1.6.43",
  source_url: "https://github.com/pnggroup/libpng",
  confidence: "high",
  detection_method: "soname",
  path: "lib/libpng16.so.16",
  purl: "pkg:generic/libpng@1.6.43",
  applied_patches: [{ name: "0001-fix-cve.patch", description: "CVE fix", source_url: null }],
  abi_version: null,
  soname: "libpng16.so.16",
  advisories: [],
};

const SCRIPT = {
  path: "info/post-link.sh",
  kind: "post-link",
  size_bytes: 512,
  content_available: true,
  findings: [
    {
      rule_id: "SH001",
      severity: "high",
      title: "curl | sh",
      description: "Pipes remote content into a shell",
      line: 12,
      snippet: "curl https://x | sh",
    },
  ],
};

const ANALYSIS = {
  format: "conda",
  analyzed_at: "2026-09-18T10:00:00Z",
  completeness: { status: "complete", reason: null, files_total: 40, files_read: 40 },
  advisory_scan: { status: "ok", reason: null },
  vendored_components: [COMPONENT],
  install_scripts: [SCRIPT],
};

describe("packageAnalysisApi", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("fetches and parses a 200 response", async () => {
    mockApiFetch.mockResolvedValue(ANALYSIS);
    const { packageAnalysisApi } = await import("../package-analysis");
    const res = await packageAnalysisApi.get("a1");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/artifacts/a1/package-analysis");
    expect(res).not.toBeNull();
    expect(res?.format).toBe("conda");
    expect(res?.completeness.status).toBe("complete");
    expect(res?.completeness.files_read).toBe(40);
    expect(res?.vendored_components[0].name).toBe("libpng");
    expect(res?.vendored_components[0].applied_patches[0].name).toBe("0001-fix-cve.patch");
    expect(res?.install_scripts[0].findings[0].rule_id).toBe("SH001");
    expect(res?.install_scripts[0].findings[0].line).toBe(12);
  });

  it("URL-encodes the artifact id", async () => {
    mockApiFetch.mockResolvedValue(ANALYSIS);
    const { packageAnalysisApi } = await import("../package-analysis");
    await packageAnalysisApi.get("a b/c");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/artifacts/a%20b%2Fc/package-analysis");
  });

  it("normalizes a 404 (no analysis row) to null", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, '{"code":"not_found"}'));
    const { packageAnalysisApi } = await import("../package-analysis");
    await expect(packageAnalysisApi.get("a1")).resolves.toBeNull();
  });

  it("rethrows non-404 API errors", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, "boom"));
    const { packageAnalysisApi } = await import("../package-analysis");
    await expect(packageAnalysisApi.get("a1")).rejects.toThrow(/API error 500/);
  });

  it("throws on a malformed response instead of returning an untyped shape", async () => {
    mockApiFetch.mockResolvedValue({ format: "conda", completeness: {} });
    const { packageAnalysisApi } = await import("../package-analysis");
    await expect(packageAnalysisApi.get("a1")).rejects.toThrow(/did not match the expected shape/);
  });

  it("rejects a response missing the top-level component list (no silent 'nothing vendored')", async () => {
    const noComponents: Partial<typeof ANALYSIS> = { ...ANALYSIS };
    delete noComponents.vendored_components;
    mockApiFetch.mockResolvedValue(noComponents);
    const { packageAnalysisApi } = await import("../package-analysis");
    await expect(packageAnalysisApi.get("a1")).rejects.toThrow(/did not match/);
  });

  it("narrows an unknown completeness status to not_read (never complete) and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApiFetch.mockResolvedValue({
      ...ANALYSIS,
      completeness: { status: "timed_out", reason: "analyzer timeout", files_total: null, files_read: null },
    });
    const { packageAnalysisApi } = await import("../package-analysis");
    const res = await packageAnalysisApi.get("a1");
    expect(res?.completeness.status).toBe("not_read");
    expect(res?.completeness.reason).toBe("analyzer timeout");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed_out"));
  });

  it("passes known completeness statuses through untouched", async () => {
    for (const status of ["complete", "partial", "not_read", "unsupported"]) {
      mockApiFetch.mockResolvedValue({ ...ANALYSIS, completeness: { ...ANALYSIS.completeness, status } });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      expect(res?.completeness.status).toBe(status);
    }
  });

  it("keeps open-ended enums (confidence, kind, severity) verbatim", async () => {
    mockApiFetch.mockResolvedValue({
      ...ANALYSIS,
      vendored_components: [{ ...COMPONENT, confidence: "heuristic" }],
      install_scripts: [
        { ...SCRIPT, kind: "pre-activate", findings: [{ ...SCRIPT.findings[0], severity: "blocker" }] },
      ],
    });
    const { packageAnalysisApi } = await import("../package-analysis");
    const res = await packageAnalysisApi.get("a1");
    expect(res?.vendored_components[0].confidence).toBe("heuristic");
    expect(res?.install_scripts[0].kind).toBe("pre-activate");
    expect(res?.install_scripts[0].findings[0].severity).toBe("blocker");
  });

  it("normalizes omitted optional fields to null / empty arrays", async () => {
    mockApiFetch.mockResolvedValue({
      format: "conda",
      completeness: { status: "partial" },
      vendored_components: [
        { name: "zlib", confidence: "low", path: "lib/libz.so" },
      ],
      install_scripts: [
        { path: "info/pre-unlink.sh", kind: "pre-unlink", size_bytes: 0, content_available: false },
      ],
    });
    const { packageAnalysisApi } = await import("../package-analysis");
    const res = await packageAnalysisApi.get("a1");
    expect(res?.analyzed_at).toBeNull();
    expect(res?.completeness).toEqual({
      status: "partial",
      reason: null,
      files_total: null,
      files_read: null,
    });
    const c = res?.vendored_components[0];
    expect(c?.version).toBeNull();
    expect(c?.source_url).toBeNull();
    expect(c?.detection_method).toBeNull();
    expect(c?.purl).toBeNull();
    expect(c?.applied_patches).toEqual([]);
    expect(c?.abi_version).toBeNull();
    expect(c?.soname).toBeNull();
    // The one field that must NOT default to an empty list: an absent
    // `advisories` means the backend did not answer, which is "not queried".
    expect(c?.advisories).toBeNull();
    // Nor does an absent advisory_scan become "ok".
    expect(res?.advisory_scan).toBeNull();
    expect(res?.install_scripts[0].findings).toEqual([]);
  });

  describe("vendored-component advisories", () => {
    it("keeps `[]` (queried, nothing matched) distinct from `null` (not queried)", async () => {
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        vendored_components: [
          { ...COMPONENT, path: "lib/a.so", advisories: [] },
          { ...COMPONENT, path: "lib/b.so", version: null, advisories: null },
        ],
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      expect(res?.vendored_components[0].advisories).toEqual([]);
      expect(res?.vendored_components[1].advisories).toBeNull();
    });

    it("parses an advisory list and normalizes its optional fields", async () => {
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        vendored_components: [
          {
            ...COMPONENT,
            name: "libwebp",
            version: "1.2.4",
            advisories: [
              {
                id: "CVE-2023-4863",
                severity: "critical",
                summary: "Heap buffer overflow in WebP",
                url: "https://nvd.nist.gov/vuln/detail/CVE-2023-4863",
              },
              { id: "GHSA-j7hp-h8jx-5ppr", severity: "medium" },
            ],
          },
        ],
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      const advisories = res?.vendored_components[0].advisories;
      expect(advisories).toHaveLength(2);
      expect(advisories?.[0]).toEqual({
        id: "CVE-2023-4863",
        severity: "critical",
        summary: "Heap buffer overflow in WebP",
        url: "https://nvd.nist.gov/vuln/detail/CVE-2023-4863",
      });
      expect(advisories?.[1]).toEqual({
        id: "GHSA-j7hp-h8jx-5ppr",
        severity: "medium",
        summary: null,
        url: null,
      });
    });

    it("keeps an unmodelled advisory severity verbatim", async () => {
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        vendored_components: [
          { ...COMPONENT, advisories: [{ id: "VENDOR-1", severity: "catastrophic" }] },
        ],
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      expect(res?.vendored_components[0].advisories?.[0].severity).toBe("catastrophic");
    });

    it("carries the ABI version and soname of a version-less component", async () => {
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        vendored_components: [
          {
            ...COMPONENT,
            name: "libwebp",
            version: null,
            abi_version: "7.1.3",
            soname: "libwebp.so.7",
            advisories: null,
          },
        ],
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      const c = res?.vendored_components[0];
      expect(c?.version).toBeNull();
      expect(c?.abi_version).toBe("7.1.3");
      expect(c?.soname).toBe("libwebp.so.7");
      expect(c?.advisories).toBeNull();
    });

    it("rejects a malformed advisory entry rather than dropping it silently", async () => {
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        vendored_components: [{ ...COMPONENT, advisories: [{ severity: "high" }] }],
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      await expect(packageAnalysisApi.get("a1")).rejects.toThrow(/did not match/);
    });
  });

  describe("advisory_scan (feed availability, separate from completeness)", () => {
    it("parses the three modelled statuses verbatim", async () => {
      for (const status of ["ok", "not_run", "partial"]) {
        mockApiFetch.mockResolvedValue({
          ...ANALYSIS,
          advisory_scan: { status, reason: "OSV returned 503" },
        });
        const { packageAnalysisApi } = await import("../package-analysis");
        const res = await packageAnalysisApi.get("a1");
        expect(res?.advisory_scan).toEqual({ status, reason: "OSV returned 503" });
      }
    });

    it("narrows an unmodelled status to `unknown` — never to `ok`, never to `partial`", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        advisory_scan: { status: "rate_limited", reason: null },
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      const res = await packageAnalysisApi.get("a1");
      // "ok" would assert the feeds answered; "partial" would assert an
      // outage. Neither is knowable from a value we do not model.
      expect(res?.advisory_scan?.status).toBe("unknown");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("rate_limited"));
    });

    it("keeps advisory_scan independent of completeness", async () => {
      // A truncated archive whose advisory feeds answered fine, and a fully
      // read archive whose feeds did not: the two axes must not be conflated.
      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        completeness: { status: "partial", reason: "archive truncated", files_total: 10, files_read: 2 },
        advisory_scan: { status: "ok", reason: null },
      });
      const { packageAnalysisApi } = await import("../package-analysis");
      let res = await packageAnalysisApi.get("a1");
      expect(res?.completeness.status).toBe("partial");
      expect(res?.advisory_scan?.status).toBe("ok");

      mockApiFetch.mockResolvedValue({
        ...ANALYSIS,
        advisory_scan: { status: "partial", reason: "OSV outage" },
      });
      res = await packageAnalysisApi.get("a1");
      expect(res?.completeness.status).toBe("complete");
      expect(res?.advisory_scan?.status).toBe("partial");
    });
  });
});

// ---------------------------------------------------------------------------
// Contract regression: the fixtures above carry a `path` on every vendored
// component, so they passed while the real endpoint was being rejected.
//
// The backend's `VendoredComponentResponse` has no `path` field at all --
// a recipe-derived component describes an upstream source, not a file -- and
// the schema required it, so zod failed the WHOLE response and the Analysis
// tab rendered "Package-analysis response did not match the expected shape"
// for every conda package.
//
// This payload is copied verbatim from a running deployment
// (GET /api/v1/artifacts/{id}/package-analysis for conda-forge
// libwebp-1.6.0-hb3daedd_2.conda). Do not add fields to it to make a test
// pass: if it diverges from what the server sends, the test is worthless.
// ---------------------------------------------------------------------------
const REAL_CONDA_RESPONSE_FROM_A_DEPLOYMENT = {
  format: "conda",
  analyzed_at: "2026-09-20T20:48:54.800558+00:00",
  completeness: {
    status: "complete",
    reason: null,
    files_total: null,
    files_read: null,
  },
  vendored_components: [
    {
      name: "libwebp",
      version: "1.6.0",
      purl: "pkg:generic/libwebp@1.6.0",
      source_url:
        "http://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz",
      git_url: null,
      git_rev: null,
      sha256:
        "e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564",
      confidence: "declared",
      detection_method: "recipe:meta.yaml",
      applied_patches: [],
      soname: null,
      abi_version: null,
      advisories: null,
    },
  ],
  install_scripts: [],
  advisory_scan: {
    status: "not_run",
    reason:
      "No dependency scan has completed for this artifact yet, so its bundled libraries have not been checked against an advisory feed.",
  },
};

describe("package-analysis contract against a real deployment", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("parses a vendored component that has no path", async () => {
    const { packageAnalysisApi } = await import("@/lib/api/package-analysis");
    mockApiFetch.mockResolvedValueOnce(REAL_CONDA_RESPONSE_FROM_A_DEPLOYMENT);

    const result = await packageAnalysisApi.get("some-artifact-id");

    // `get` returns null only on 404; a schema mismatch THROWS. So reaching a
    // non-null result is itself the assertion that the payload validated.
    expect(result).not.toBeNull();
    const analysis = result!;

    expect(analysis.vendored_components).toHaveLength(1);
    expect(analysis.vendored_components[0].name).toBe("libwebp");
    expect(analysis.vendored_components[0].path ?? null).toBeNull();
  });

  it("keeps advisories null rather than flattening it to an empty list", async () => {
    const { packageAnalysisApi } = await import("@/lib/api/package-analysis");
    mockApiFetch.mockResolvedValueOnce(REAL_CONDA_RESPONSE_FROM_A_DEPLOYMENT);

    const result = await packageAnalysisApi.get("some-artifact-id");
    expect(result).not.toBeNull();
    const analysis = result!;

    // `null` means "no advisory answer for this component"; `[]` would mean
    // "the feeds were queried and matched nothing". Collapsing the former
    // into the latter reports an unchecked component as clean.
    expect(analysis.vendored_components[0].advisories).toBeNull();
    expect(analysis.advisory_scan?.status).toBe("not_run");
  });
});
