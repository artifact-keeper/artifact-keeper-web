// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import type { Artifact } from "@/types";
import type {
  PackageAnalysis,
  VendoredComponent,
} from "@/types/package-analysis";

// ---------------------------------------------------------------------------
// Mocks
//
// `useQuery` is stubbed to whatever the test sets, so only the summary's own
// rendering rules are under test — not react-query. `SeverityBadge` is real:
// the palette it picks is part of what is asserted.
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock("@/lib/api/package-analysis", () => ({
  packageAnalysisApi: { get: vi.fn() },
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return { AlertTriangle: icon, FileQuestion: icon, ShieldAlert: icon };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...rest }: React.ComponentProps<"span">) => (
    <span className={className} {...rest}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

import { VendoredAdvisoriesSummary } from "../vendored-advisories-summary";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ARTIFACT = {
  id: "art-1",
  repository_key: "conda-main",
  path: "linux-64/pillow-10.0.0.conda",
  name: "pillow-10.0.0.conda",
  size_bytes: 1024,
  checksum_sha256: "a".repeat(64),
  content_type: "application/octet-stream",
  download_count: 0,
  created_at: "2026-09-01T00:00:00Z",
} as Artifact;

function component(
  path: string,
  advisories: VendoredComponent["advisories"],
  version: string | null = "1.2.4",
): VendoredComponent {
  return {
    name: path,
    version,
    source_url: null,
    confidence: "high",
    detection_method: null,
    path,
    purl: null,
    applied_patches: [],
    abi_version: null,
    soname: null,
    advisories,
  };
}

function analysis(
  components: VendoredComponent[],
  status = "complete",
  advisoryScan: PackageAnalysis["advisory_scan"] = null,
): PackageAnalysis {
  return {
    format: "conda",
    analyzed_at: null,
    completeness: {
      status: status as PackageAnalysis["completeness"]["status"],
      reason: null,
      files_total: null,
      files_read: null,
    },
    advisory_scan: advisoryScan,
    vendored_components: components,
    install_scripts: [],
  };
}

const FEED_DOWN = { status: "partial" as const, reason: "OSV returned 503." };
const FEED_NOT_RUN = { status: "not_run" as const, reason: null };

function setData(data: PackageAnalysis | null | undefined) {
  mockUseQuery.mockReturnValue({ data });
}

// ---------------------------------------------------------------------------

describe("VendoredAdvisoriesSummary", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("does not query at all for a format without package analysis", () => {
    setData(null);
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled={false} />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(screen.queryByTestId("vendored-advisories-summary")).toBeNull();
  });

  it("renders nothing while the analysis is unavailable (loading / 404 / error)", () => {
    for (const d of [undefined, null] as const) {
      setData(d);
      const { container } = render(
        <VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />,
      );
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });

  it("stays silent when the package contents were never read", () => {
    setData(analysis([], "not_read"));
    const { container } = render(
      <VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />,
    );
    // The Analysis tab reports "not inspected" properly; a half-answer here
    // would read as a verdict.
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when every component was queried and came back clean", () => {
    setData(analysis([component("lib/a.so", [])]));
    const { container } = render(
      <VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("counts advisories and breaks them down by severity", () => {
    setData(
      analysis([
        component("lib/libwebp.so", [
          { id: "CVE-2023-4863", severity: "critical", summary: null, url: null },
          { id: "CVE-2023-1000", severity: "medium", summary: null, url: null },
        ]),
        component("lib/libpng.so", [
          { id: "CVE-2024-1", severity: "medium", summary: null, url: null },
        ]),
        component("lib/libz.so", []),
      ]),
    );
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary");
    expect(box.textContent).toContain("3 advisories in 2 vendored native libraries");
    // Says explicitly that the scan results below do not cover these.
    expect(box.textContent).toMatch(/do not cover these/i);

    const badges = screen.getAllByTestId("severity-badge");
    expect(badges.map((b) => b.getAttribute("data-severity"))).toEqual([
      "critical",
      "medium",
    ]);
    expect(box.textContent).toContain("1");
    expect(box.textContent).toContain("2");
  });

  it("reports not-queried components separately and never as clean", () => {
    setData(
      analysis([
        component("lib/libwebp.so.7", null, null),
        component("lib/libjpeg.so.62", null, null),
      ]),
    );
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary-unqueried");
    expect(box.textContent).toMatch(
      /2 vendored native libraries could not be checked against the advisory feeds/i,
    );
    expect(box.textContent).toMatch(/no upstream version recovered/i);
    expect(box.className).toMatch(/bg-muted/);
    expect(box.className).not.toMatch(/emerald|red|amber/);
    expect(screen.queryByTestId("vendored-advisories-summary")).toBeNull();
  });

  it("mentions unqueried components alongside real advisories", () => {
    setData(
      analysis([
        component("lib/libwebp.so", [
          { id: "CVE-2023-4863", severity: "critical", summary: null, url: null },
        ]),
        component("lib/libz.so.1", null, null),
      ]),
    );
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary");
    expect(box.textContent).toContain("1 advisory in 1 vendored native library");
    expect(box.textContent).toMatch(/1 further component could not be checked/i);
  });

  it("offers a jump to the Analysis tab when the caller can switch tabs", () => {
    const onOpenAnalysis = vi.fn();
    setData(
      analysis([
        component("lib/libwebp.so", [
          { id: "CVE-2023-4863", severity: "critical", summary: null, url: null },
        ]),
      ]),
    );
    render(
      <VendoredAdvisoriesSummary
        artifact={ARTIFACT}
        enabled
        onOpenAnalysis={onOpenAnalysis}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View in Analysis/ }));
    expect(onOpenAnalysis).toHaveBeenCalledTimes(1);
  });

  it("omits the jump affordance when no handler is given", () => {
    setData(
      analysis([
        component("lib/libwebp.so", [
          { id: "CVE-2023-4863", severity: "critical", summary: null, url: null },
        ]),
      ]),
    );
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls a feed outage an outage, not 'could not be checked'", () => {
    setData(analysis([component("lib/libpng.so", null)], "complete", FEED_DOWN));
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary-unqueried");
    expect(box.getAttribute("data-outage")).toBe("true");
    expect(box.textContent).toMatch(/The advisory feed did not answer for 1 vendored native library/i);
    expect(box.textContent).toMatch(/nothing is ruled out for them/i);
    expect(box.textContent).toContain("OSV returned 503.");
    expect(box.textContent).not.toMatch(/could not be checked/i);
    expect(box.className).toMatch(/amber/);
    expect(box.className).not.toMatch(/red|emerald/);
  });

  it("stays neutral when no scan has run", () => {
    setData(analysis([component("lib/libpng.so", null)], "complete", FEED_NOT_RUN));
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary-unqueried");
    expect(box.getAttribute("data-outage")).toBe("false");
    expect(box.textContent).toMatch(/could not be checked against the advisory feeds/i);
    expect(box.textContent).not.toMatch(/did not answer/i);
    expect(box.className).toMatch(/bg-muted/);
  });

  it("reports an outage alongside real advisories without merging the two", () => {
    setData(
      analysis(
        [
          component("lib/libwebp.so", [
            { id: "CVE-2023-4863", severity: "critical", summary: null, url: null },
          ]),
          component("lib/libpng.so", null),
          component("lib/libz.so.1", null, null),
        ],
        "complete",
        FEED_DOWN,
      ),
    );
    render(<VendoredAdvisoriesSummary artifact={ARTIFACT} enabled />);
    const box = screen.getByTestId("vendored-advisories-summary");
    expect(box.textContent).toContain("1 advisory in 1 vendored native library");
    expect(box.textContent).toMatch(/did not answer for 1 further component/i);
    expect(box.textContent).toMatch(/1 further component could not be checked at all/i);
  });
});
