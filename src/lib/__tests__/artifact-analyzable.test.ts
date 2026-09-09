import { describe, it, expect } from "vitest";

import {
  ANALYZABLE_DISABLED_REASON,
  PROXY_SCAN_AVAILABILITY_NOTE,
  isArtifactAnalyzable,
} from "@/lib/artifact-analyzable";
import type { Artifact } from "@/types";

// Minimal artifact factory — only `analyzable` matters for these tests.
function art(analyzable?: boolean): Pick<Artifact, "analyzable"> {
  return { analyzable };
}

describe("isArtifactAnalyzable (artifact-keeper#2292)", () => {
  it("returns false only for an explicit analyzable: false (proxy-cached remote)", () => {
    expect(isArtifactAnalyzable(art(false))).toBe(false);
  });

  it("returns true when analyzable is explicitly true (hosted artifact)", () => {
    expect(isArtifactAnalyzable(art(true))).toBe(true);
  });

  it("defaults to true when the field is absent (older / pre-upgrade responses)", () => {
    expect(isArtifactAnalyzable(art(undefined))).toBe(true);
    expect(isArtifactAnalyzable({})).toBe(true);
  });

  it("treats null / undefined artifacts as analyzable (safe default)", () => {
    expect(isArtifactAnalyzable(null)).toBe(true);
    expect(isArtifactAnalyzable(undefined)).toBe(true);
  });

  it("exposes a user-facing disabled reason mentioning proxy-cached artifacts", () => {
    expect(ANALYZABLE_DISABLED_REASON).toMatch(/proxy-cached/i);
  });
});

describe("ANALYZABLE_DISABLED_REASON", () => {
  it("keeps the first (SBOM/scan hosted-only) sentence unchanged", () => {
    expect(ANALYZABLE_DISABLED_REASON).toMatch(
      /^SBOM generation and on-demand scans are available only for artifacts hosted in this registry\./,
    );
  });

  it("does not claim scanning is unavailable for proxy-cached artifacts", () => {
    // #3344: proxy-cached artifacts ARE scanned at download time when
    // scan-on-proxy is enabled. Only SBOM generation and on-demand scans
    // are hosted-only.
    expect(ANALYZABLE_DISABLED_REASON).not.toMatch(/SBOM and scanning are available only/);
    expect(ANALYZABLE_DISABLED_REASON).toMatch(/scan-on-proxy/);
    expect(ANALYZABLE_DISABLED_REASON).toMatch(/proxy-cached/i);
  });

  it("names exactly the formats scan-on-proxy is wired up for (PyPI, npm, Docker/OCI)", () => {
    // #3344 finding 1: scan-at-download-time is only wired for these three
    // formats; for everything else (Maven, Go, NuGet, ...) scan_on_proxy is
    // a no-op. The reason text must not overstate coverage.
    expect(ANALYZABLE_DISABLED_REASON).toMatch(/PyPI, npm and Docker\/OCI/);
    expect(ANALYZABLE_DISABLED_REASON).not.toMatch(/Maven|NuGet|\bGo\b/);
  });

  it("second sentence matches the companion backend PR's wording verbatim", () => {
    // Must stay identical to the backend copy (#3344) so the two surfaces
    // never drift apart.
    expect(PROXY_SCAN_AVAILABILITY_NOTE).toBe(
      "Proxy-cached artifacts in PyPI, npm and Docker/OCI repositories can be scanned at download time when scan-on-proxy is enabled for the repository.",
    );
    expect(ANALYZABLE_DISABLED_REASON.endsWith(PROXY_SCAN_AVAILABILITY_NOTE)).toBe(
      true,
    );
  });
});
