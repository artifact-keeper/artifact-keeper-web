// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import type {
  AdvisoryScan,
  AnalysisCompleteness,
  VendoredComponent,
} from "@/types/package-analysis";

// ---------------------------------------------------------------------------
// COVERAGE LIMITS — read before trusting a green run.
//
// `DataTable` is replaced by a flat stub that renders every row and calls
// each column's `cell` / `accessor`. Column sorting, pagination and
// `onRowClick` are therefore NOT exercised here (they're covered by
// data-table.test.tsx for the component itself, not for these columns).
// The patch and advisory expand/collapse ARE covered: both are plain
// <button>s emitted by their cells, so the stub renders them and fireEvent
// drives real component state. Nothing here renders through Radix.
//
// `SeverityBadge` and `VulnIdLink` are NOT mocked — the severity palette and
// the CVE/GHSA link derivation are part of what these tests assert.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    AlertTriangle: icon,
    CheckCircle2: icon,
    ChevronDown: icon,
    ChevronRight: icon,
    ExternalLink: icon,
    FileQuestion: icon,
    Package: icon,
    ShieldAlert: icon,
  };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...rest }: React.ComponentProps<"span">) => (
    <span className={className} {...rest}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status, color }: { status: string; color?: string }) => (
    <span data-testid="status-badge" data-color={color ?? "auto"}>
      {status}
    </span>
  ),
}));

interface DataTableProps<T> {
  data: T[];
  rowKey: (r: T) => string;
  columns: {
    id: string;
    header: React.ReactNode;
    cell?: (r: T) => React.ReactNode;
    accessor?: (r: T) => unknown;
  }[];
  emptyMessage?: string;
}

vi.mock("@/components/common/data-table", () => ({
  DataTable: <T,>({ data, rowKey, columns, emptyMessage }: DataTableProps<T>) =>
    data.length === 0 ? (
      <div>{emptyMessage}</div>
    ) : (
      <table>
        <tbody>
          {data.map((row) => {
            for (const c of columns) c.accessor?.(row);
            return (
              <tr key={rowKey(row)} data-testid={`row-${rowKey(row)}`}>
                {columns.map((c) => (
                  <td key={c.id}>{c.cell ? c.cell(row) : null}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE: AnalysisCompleteness = {
  status: "complete",
  reason: null,
  files_total: 40,
  files_read: 40,
};
const PARTIAL: AnalysisCompleteness = {
  status: "partial",
  reason: "archive truncated",
  files_total: 10,
  files_read: 2,
};
const NOT_READ: AnalysisCompleteness = {
  status: "not_read",
  reason: "analyzer disabled for this repository",
  files_total: null,
  files_read: null,
};
/**
 * Advisory-feed availability. A separate axis from `AnalysisCompleteness`
 * above: FEED_DOWN describes a fully-read archive whose advisory lookups
 * failed, which is NOT the same as a truncated archive (PARTIAL).
 */
const FEED_OK: AdvisoryScan = { status: "ok", reason: null };
const FEED_DOWN: AdvisoryScan = {
  status: "partial",
  reason: "OSV returned 503.",
};
const FEED_NOT_RUN: AdvisoryScan = { status: "not_run", reason: null };

const UNSUPPORTED: AnalysisCompleteness = {
  status: "unsupported",
  reason: null,
  files_total: null,
  files_read: null,
};

const LIBPNG: VendoredComponent = {
  name: "libpng",
  version: "1.6.43",
  source_url: "https://github.com/pnggroup/libpng",
  confidence: "high",
  detection_method: "soname",
  path: "lib/libpng16.so.16",
  purl: "pkg:generic/libpng@1.6.43",
  applied_patches: [
    { name: "0001-fix-cve.patch", description: "CVE fix", source_url: "https://example.com/p" },
    { name: "0002-local.patch", description: null, source_url: null },
  ],
  abi_version: null,
  soname: null,
  // Queried against the feeds, nothing matched — NOT the same fact as `null`.
  advisories: [],
};

const ZLIB: VendoredComponent = {
  name: "zlib",
  version: null,
  source_url: "javascript:alert(1)",
  confidence: "heuristic",
  detection_method: null,
  path: "lib/libz.so.1",
  purl: null,
  applied_patches: [],
  abi_version: null,
  soname: null,
  // No version was recovered, so no advisory lookup was possible.
  advisories: null,
};

/**
 * The motivating shape: a vendored libwebp whose only version evidence is the
 * ELF ABI in its soname. `libwebp.so.7` ships in libwebp 1.2.4, so `7` must
 * never be treated as a version — which is exactly why `advisories` is null.
 */
const LIBWEBP_ABI: VendoredComponent = {
  name: "libwebp",
  version: null,
  source_url: null,
  confidence: "medium",
  detection_method: "soname",
  path: "lib/libwebp.so.7",
  purl: null,
  applied_patches: [],
  abi_version: "7.1.3",
  soname: "libwebp.so.7",
  advisories: null,
};

/** Version recovered, but no advisory answer — cause depends on the scan. */
const LIBPNG_NO_ANSWER: VendoredComponent = {
  ...LIBPNG,
  path: "lib/libpng-no-answer.so",
  advisories: null,
};

/** Same library, version recovered, and the feeds had something to say. */
const LIBWEBP_VULN: VendoredComponent = {
  name: "libwebp",
  version: "1.2.4",
  source_url: null,
  confidence: "high",
  detection_method: "version-string",
  path: "lib/libwebp-vendored.so",
  purl: null,
  applied_patches: [],
  abi_version: null,
  soname: null,
  advisories: [
    {
      id: "GHSA-j7hp-h8jx-5ppr",
      severity: "medium",
      summary: "libwebp vendored advisory",
      url: null,
    },
    {
      id: "VENDOR-2024-0001",
      severity: "catastrophic",
      summary: null,
      url: null,
    },
    {
      id: "CVE-2023-4863",
      severity: "critical",
      summary: "Heap buffer overflow in WebP",
      url: null,
    },
  ],
};

import { VendoredComponentsPanel } from "../vendored-components-panel";

const CLEAN_COPY = /No vendored native libraries detected$/;
const NOT_INSPECTED_COPY = /Package contents were not inspected/;
const INCOMPLETE_COPY = /This list may be incomplete/;

describe("VendoredComponentsPanel", () => {
  afterEach(() => cleanup());

  describe("three-way empty state", () => {
    it("complete + empty → emerald clean copy, and NOT the not-inspected copy", () => {
      render(<VendoredComponentsPanel components={[]} completeness={COMPLETE} />);
      const clean = screen.getByTestId("vendored-clean");
      expect(clean.textContent).toMatch(CLEAN_COPY);
      expect(clean.className).toMatch(/emerald/);
      expect(screen.queryByText(NOT_INSPECTED_COPY)).toBeNull();
      expect(screen.queryByText(INCOMPLETE_COPY)).toBeNull();
      expect(screen.queryByTestId("vendored-not-inspected")).toBeNull();
    });

    it("not_read + empty → neutral not-inspected copy with reason, and NOT the clean copy", () => {
      render(<VendoredComponentsPanel components={[]} completeness={NOT_READ} />);
      const block = screen.getByTestId("vendored-not-inspected");
      expect(block.textContent).toMatch(NOT_INSPECTED_COPY);
      expect(block.textContent).toContain("analyzer disabled for this repository");
      expect(block.className).toMatch(/bg-muted/);
      expect(block.className).toMatch(/text-muted-foreground/);
      expect(block.className).not.toMatch(/emerald|red|amber/);
      expect(screen.queryByText(CLEAN_COPY)).toBeNull();
      expect(screen.queryByTestId("vendored-clean")).toBeNull();
    });

    it("unsupported + empty → neutral not-inspected copy with a default explanation", () => {
      render(<VendoredComponentsPanel components={[]} completeness={UNSUPPORTED} />);
      const block = screen.getByTestId("vendored-not-inspected");
      expect(block.textContent).toMatch(NOT_INSPECTED_COPY);
      expect(block.textContent).toMatch(/not supported/);
      expect(block.className).not.toMatch(/emerald|red/);
      expect(screen.queryByText(CLEAN_COPY)).toBeNull();
    });

    it("partial + empty → amber incomplete banner with the files ratio, and NOT the clean copy", () => {
      render(<VendoredComponentsPanel components={[]} completeness={PARTIAL} />);
      const banner = screen.getByTestId("vendored-partial-banner");
      expect(banner.textContent).toMatch(INCOMPLETE_COPY);
      expect(banner.textContent).toContain("Only 2 of 10 files were read");
      expect(banner.textContent).toContain("archive truncated");
      expect(banner.className).toMatch(/amber/);
      expect(screen.queryByTestId("vendored-clean")).toBeNull();
      expect(screen.queryByText(CLEAN_COPY)).toBeNull();
      expect(screen.getByTestId("vendored-partial-empty")).toBeDefined();
    });

    it("partial + rows → banner plus the rows that exist", () => {
      render(<VendoredComponentsPanel components={[LIBPNG]} completeness={PARTIAL} />);
      expect(screen.getByTestId("vendored-partial-banner")).toBeDefined();
      expect(screen.getByTestId("row-lib/libpng16.so.16")).toBeDefined();
      expect(screen.queryByTestId("vendored-partial-empty")).toBeNull();
    });
  });

  describe("rows", () => {
    it("renders name, path, version badge and a count badge", () => {
      render(<VendoredComponentsPanel components={[LIBPNG, ZLIB]} completeness={COMPLETE} />);
      expect(screen.getByText("libpng")).toBeDefined();
      expect(screen.getByText("lib/libpng16.so.16")).toBeDefined();
      expect(screen.getByText("1.6.43")).toBeDefined();
      expect(screen.getByText("2 components")).toBeDefined();
    });

    it("explains a null version instead of rendering an empty cell or an error", () => {
      render(<VendoredComponentsPanel components={[ZLIB]} completeness={COMPLETE} />);
      const row = screen.getByTestId("row-lib/libz.so.1");
      expect(row.textContent).toContain("Version not determinable");
      // No ABI evidence either, so nothing is invented and nothing reads as
      // a failure.
      expect(row.textContent).not.toMatch(/error|failed|unknown/i);
      const cell = screen.getByTestId("version-undetermined");
      expect(cell.className).not.toMatch(/red|emerald/);
      expect(cell.getAttribute("title")).toMatch(/ABI version, not an upstream release/);
    });

    it("links a safe http(s) source with a hardened anchor", () => {
      render(<VendoredComponentsPanel components={[LIBPNG]} completeness={COMPLETE} />);
      const link = screen.getByRole("link", { name: /github\.com\/pnggroup\/libpng/ });
      expect(link.getAttribute("href")).toBe("https://github.com/pnggroup/libpng");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("renders an unsafe (javascript:) source URL as plain text, never a link", () => {
      render(<VendoredComponentsPanel components={[ZLIB]} completeness={COMPLETE} />);
      expect(screen.getByText("javascript:alert(1)")).toBeDefined();
      expect(screen.queryByRole("link")).toBeNull();
      expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    });

    it("maps confidence to colours and falls back to default for unknown values", () => {
      render(<VendoredComponentsPanel components={[LIBPNG, ZLIB]} completeness={COMPLETE} />);
      const badges = screen.getAllByTestId("status-badge");
      const byText = Object.fromEntries(badges.map((b) => [b.textContent, b.getAttribute("data-color")]));
      expect(byText.high).toBe("green");
      expect(byText.heuristic).toBe("default");
    });

    it("shows the patch count and expands the patch detail on click", () => {
      render(<VendoredComponentsPanel components={[LIBPNG, ZLIB]} completeness={COMPLETE} />);
      expect(screen.queryByTestId("patches-lib/libpng16.so.16")).toBeNull();
      const toggle = screen.getByRole("button", { name: /Show 2 patches for libpng/ });
      fireEvent.click(toggle);
      const detail = screen.getByTestId("patches-lib/libpng16.so.16");
      expect(detail.textContent).toContain("0001-fix-cve.patch");
      expect(detail.textContent).toContain("CVE fix");
      expect(detail.textContent).toContain("0002-local.patch");
      expect(detail.textContent).toContain("detected via soname");
      expect(detail.textContent).toContain("pkg:generic/libpng@1.6.43");
      fireEvent.click(screen.getByRole("button", { name: /Hide 2 patches for libpng/ }));
      expect(screen.queryByTestId("patches-lib/libpng16.so.16")).toBeNull();
    });
  });

  describe("advisories", () => {
    it("advisories: null renders 'Not queried' and never a clean claim", () => {
      render(<VendoredComponentsPanel components={[ZLIB]} completeness={COMPLETE} />);
      const cell = screen.getByTestId("advisories-not-queried");
      expect(cell.textContent).toMatch(/Not queried/i);
      expect(cell.getAttribute("title")).toMatch(/not a clean result/i);
      // The `[]` copy must be absent: "we could not look" is not "nothing
      // found", which is the whole point of the three-way contract.
      expect(screen.queryByTestId("advisories-clean")).toBeNull();
      expect(screen.queryByText(/No known advisories/i)).toBeNull();
      expect(screen.queryByText(/no vulnerabilities/i)).toBeNull();
      expect(cell.className).not.toMatch(/emerald|green|red/);
    });

    it("advisories: [] renders the queried-and-clean copy", () => {
      render(<VendoredComponentsPanel components={[LIBPNG]} completeness={COMPLETE} />);
      const cell = screen.getByTestId("advisories-clean");
      expect(cell.textContent).toMatch(/No known advisories/i);
      expect(cell.className).toMatch(/emerald/);
      expect(screen.queryByTestId("advisories-not-queried")).toBeNull();
    });

    it("a version-less component explains the ABI and makes no advisory claim", () => {
      render(<VendoredComponentsPanel components={[LIBWEBP_ABI]} completeness={COMPLETE} />);
      const row = screen.getByTestId("row-lib/libwebp.so.7");
      expect(row.textContent).toContain("Version not determinable");
      expect(row.textContent).toContain("ABI 7.1.3");
      expect(row.textContent).toContain("libwebp.so.7");
      expect(row.textContent).toMatch(/Not queried/i);
      expect(screen.queryByTestId("advisories-clean")).toBeNull();
      // And the panel says why, once, in neutral styling.
      const note = screen.getByTestId("vendored-advisories-not-queried-note");
      expect(note.textContent).toMatch(/no upstream version could be recovered/i);
      expect(note.textContent).toMatch(/ABI version, not a release/i);
      expect(note.className).toMatch(/bg-muted/);
      expect(note.className).not.toMatch(/emerald|red|amber/);
    });

    it("does not show the not-queried note when every component was queried", () => {
      render(<VendoredComponentsPanel components={[LIBPNG]} completeness={COMPLETE} />);
      expect(screen.queryByTestId("vendored-advisories-not-queried-note")).toBeNull();
    });

    it("expands a populated list with linked ids, most severe first", () => {
      render(<VendoredComponentsPanel components={[LIBWEBP_VULN]} completeness={COMPLETE} />);
      expect(screen.queryByTestId("advisories-lib/libwebp-vendored.so")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Show 3 advisories for libwebp/ }));
      const detail = screen.getByTestId("advisories-lib/libwebp-vendored.so");

      const ids = within(detail)
        .getAllByTestId("component-advisory")
        .map((li) => li.querySelector("a, span.font-mono")?.textContent);
      expect(ids).toEqual(["CVE-2023-4863", "GHSA-j7hp-h8jx-5ppr", "VENDOR-2024-0001"]);

      expect(
        within(detail).getByRole("link", { name: /CVE-2023-4863/ }).getAttribute("href")
      ).toBe("https://nvd.nist.gov/vuln/detail/CVE-2023-4863");
      expect(
        within(detail).getByRole("link", { name: /GHSA-j7hp-h8jx-5ppr/ }).getAttribute("href")
      ).toBe("https://github.com/advisories/GHSA-j7hp-h8jx-5ppr");
      expect(detail.textContent).toContain("Heap buffer overflow in WebP");

      fireEvent.click(screen.getByRole("button", { name: /Hide 3 advisories for libwebp/ }));
      expect(screen.queryByTestId("advisories-lib/libwebp-vendored.so")).toBeNull();
    });

    it("renders an unknown severity verbatim in neutral styling", () => {
      render(<VendoredComponentsPanel components={[LIBWEBP_VULN]} completeness={COMPLETE} />);
      fireEvent.click(screen.getByRole("button", { name: /Show 3 advisories for libwebp/ }));
      const detail = screen.getByTestId("advisories-lib/libwebp-vendored.so");
      const odd = within(detail)
        .getAllByTestId("severity-badge")
        .find((b) => b.getAttribute("data-severity") === "catastrophic");
      expect(odd).toBeDefined();
      expect(odd!.textContent).toBe("catastrophic");
      expect(odd!.className).toMatch(/bg-secondary/);
      expect(odd!.className).not.toMatch(/red|orange|amber|blue/);
    });

    it("rolls the advisory count up into the panel header", () => {
      render(
        <VendoredComponentsPanel
          components={[LIBPNG, ZLIB, LIBWEBP_VULN]}
          completeness={COMPLETE}
        />
      );
      const rollup = screen.getByTestId("vendored-advisory-rollup");
      expect(rollup.textContent).toContain("3 advisories in 1 component");
      // Worst severity drives the badge colour.
      expect(rollup.className).toMatch(/red/);
    });

    it("shows no roll-up when contents were not inspected", () => {
      render(<VendoredComponentsPanel components={[]} completeness={NOT_READ} />);
      expect(screen.queryByTestId("vendored-advisory-rollup")).toBeNull();
      expect(screen.queryByTestId("vendored-advisories-not-queried-note")).toBeNull();
    });
  });

  describe("why there is no advisory answer", () => {
    it("says 'Advisory feed unavailable' — not 'Not queried' — when a feed was asked and failed", () => {
      render(
        <VendoredComponentsPanel
          components={[LIBPNG_NO_ANSWER]}
          completeness={COMPLETE}
          advisoryScan={FEED_DOWN}
        />
      );
      const cell = screen.getByTestId("advisories-not-queried");
      expect(cell.getAttribute("data-gap")).toBe("feed_unavailable");
      expect(cell.textContent).toBe("Advisory feed unavailable");
      expect(cell.textContent).not.toMatch(/Not queried/);
      // The protective sentence survives the split.
      expect(cell.getAttribute("title")).toMatch(/This is not a clean result\./);
      expect(cell.getAttribute("title")).toMatch(/queried but did not answer/i);
      // An outage reads as an outage, but is still not a vulnerability.
      expect(cell.className).toMatch(/amber/);
      expect(cell.className).not.toMatch(/red|emerald/);

      const note = screen.getByTestId("vendored-advisory-feed-unavailable-note");
      expect(note.textContent).toMatch(/did not answer for 1 component/i);
      expect(note.textContent).toContain("OSV returned 503.");
      // And it is NOT the archive-truncation banner.
      expect(screen.queryByTestId("vendored-partial-banner")).toBeNull();
    });

    it("keeps a version-less component on 'Not queried' even during an outage", () => {
      render(
        <VendoredComponentsPanel
          components={[LIBWEBP_ABI]}
          completeness={COMPLETE}
          advisoryScan={FEED_DOWN}
        />
      );
      // It was never sent to a feed, so the feed's failure is not its story.
      const cell = screen.getByTestId("advisories-not-queried");
      expect(cell.getAttribute("data-gap")).toBe("no_version");
      expect(cell.textContent).toBe("Not queried");
      expect(screen.queryByTestId("vendored-advisory-feed-unavailable-note")).toBeNull();
      expect(screen.getByTestId("vendored-advisories-not-queried-note").textContent).toMatch(
        /no upstream version could be recovered/i
      );
    });

    it("says nothing has asked yet when no scan has run", () => {
      render(
        <VendoredComponentsPanel
          components={[LIBPNG_NO_ANSWER]}
          completeness={COMPLETE}
          advisoryScan={FEED_NOT_RUN}
        />
      );
      const cell = screen.getByTestId("advisories-not-queried");
      expect(cell.getAttribute("data-gap")).toBe("not_scanned");
      expect(cell.textContent).toBe("Not queried");
      expect(cell.className).not.toMatch(/amber|red|emerald/);
      expect(screen.getByTestId("vendored-advisories-not-queried-note").textContent).toMatch(
        /No completed dependency scan has recorded advisories yet/i
      );
    });

    it("falls back to the non-committal copy when the backend reports no advisory scan", () => {
      render(
        <VendoredComponentsPanel components={[LIBPNG_NO_ANSWER]} completeness={COMPLETE} />
      );
      const cell = screen.getByTestId("advisories-not-queried");
      expect(cell.getAttribute("data-gap")).toBe("unknown");
      expect(cell.textContent).toBe("Not queried");
      // Neither "clean" nor a claimed outage.
      expect(cell.getAttribute("title")).toMatch(/This is not a clean result\./);
      expect(cell.getAttribute("title")).toMatch(/never queried or the feed did not answer/i);
      expect(screen.queryByTestId("vendored-advisory-feed-unavailable-note")).toBeNull();
    });

    it("does not confuse a truncated archive with a feed outage", () => {
      // `completeness: partial` is about bytes read, NOT about the feeds.
      render(
        <VendoredComponentsPanel
          components={[LIBPNG_NO_ANSWER]}
          completeness={PARTIAL}
          advisoryScan={FEED_OK}
        />
      );
      expect(screen.getByTestId("vendored-partial-banner")).toBeDefined();
      expect(screen.queryByTestId("vendored-advisory-feed-unavailable-note")).toBeNull();
      expect(screen.getByTestId("advisories-not-queried").textContent).toBe("Not queried");
    });

    it("separates the two notes when both causes are present", () => {
      render(
        <VendoredComponentsPanel
          components={[LIBPNG_NO_ANSWER, LIBWEBP_ABI]}
          completeness={COMPLETE}
          advisoryScan={FEED_DOWN}
        />
      );
      const outage = screen.getByTestId("vendored-advisory-feed-unavailable-note");
      expect(outage.textContent).toMatch(/did not answer for 1 component\b/i);
      const neutral = screen.getByTestId("vendored-advisories-not-queried-note");
      expect(neutral.textContent).toMatch(/^1 component was not checked/);
      expect(neutral.className).toMatch(/bg-muted/);
    });
  });
});
