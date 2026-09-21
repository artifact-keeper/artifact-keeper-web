// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { Artifact } from "@/types";
import type { PackageAnalysis } from "@/types/package-analysis";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

const mockGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/package-analysis", () => ({
  packageAnalysisApi: { get: (id: string) => mockGet(id) },
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    AlertTriangle: icon,
    FileQuestion: icon,
    PackageSearch: icon,
  };
});

vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr data-testid="separator" /> }));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/common/scan-completeness-badge", () => ({
  ScanCompletenessBadge: (props: {
    status: string;
    reason?: string | null;
    filesRead?: number | null;
    filesTotal?: number | null;
  }) => (
    <span
      data-testid="scan-completeness"
      data-status={props.status}
      data-reason={props.reason ?? ""}
      data-files={`${props.filesRead ?? ""}/${props.filesTotal ?? ""}`}
    />
  ),
}));

vi.mock("../vendored-components-panel", () => ({
  VendoredComponentsPanel: (props: {
    components: unknown[];
    completeness: { status: string };
  }) => (
    <div
      data-testid="vendored-panel"
      data-count={props.components.length}
      data-status={props.completeness.status}
    />
  ),
}));

vi.mock("../install-scripts-panel", () => ({
  InstallScriptsPanel: (props: { scripts: unknown[]; completeness: { status: string } }) => (
    <div
      data-testid="scripts-panel"
      data-count={props.scripts.length}
      data-status={props.completeness.status}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ARTIFACT: Artifact = {
  id: "art-1",
  repository_key: "conda-main",
  path: "linux-64/numpy-2.0.0-py312.conda",
  name: "numpy-2.0.0-py312.conda",
  size_bytes: 1024,
  checksum_sha256: "a".repeat(64),
  content_type: "application/octet-stream",
  download_count: 0,
  created_at: "2026-09-01T00:00:00Z",
};

const ANALYSIS: PackageAnalysis = {
  format: "conda",
  analyzed_at: "2026-09-18T10:00:00Z",
  completeness: { status: "partial", reason: "truncated", files_total: 10, files_read: 7 },
  advisory_scan: { status: "ok", reason: null },
  vendored_components: [
    {
      name: "libpng",
      version: "1.6.43",
      source_url: null,
      confidence: "high",
      detection_method: null,
      path: "lib/libpng.so",
      purl: null,
      applied_patches: [],
      abi_version: null,
      soname: null,
      advisories: [],
    },
  ],
  install_scripts: [
    { path: "info/post-link.sh", kind: "post-link", size_bytes: 1, content_available: true, findings: [] },
    { path: "info/pre-link.sh", kind: "pre-link", size_bytes: 1, content_available: true, findings: [] },
  ],
};

import { PackageAnalysisTabContent } from "../package-analysis-tab-content";

describe("PackageAnalysisTabContent", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("queries under the security key prefix with retry disabled", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);
    const opts = mockUseQuery.mock.calls[0][0] as {
      queryKey: unknown;
      queryFn: () => unknown;
      retry: boolean;
      enabled: boolean;
    };
    expect(opts.queryKey).toEqual(["security", "package-analysis", "art-1"]);
    expect(opts.retry).toBe(false);
    expect(opts.enabled).toBe(true);
    opts.queryFn();
    expect(mockGet).toHaveBeenCalledWith("art-1");
  });

  it("renders skeletons while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("package-analysis")).toBeNull();
  });

  it("renders a red error banner with the error message", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network down"),
    });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);
    const banner = screen.getByTestId("package-analysis-error");
    expect(banner.textContent).toContain("Could not load package analysis");
    expect(banner.textContent).toContain("Network down");
    expect(banner.className).toMatch(/red/);
  });

  it("renders a neutral 'no analysis recorded' state for null (backend 404) — not clean, not error", () => {
    mockUseQuery.mockReturnValue({ data: null, isLoading: false, isError: false });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);
    const empty = screen.getByTestId("package-analysis-none");
    expect(empty.textContent).toContain("No package analysis recorded");
    expect(empty.className).not.toMatch(/emerald|red/);
    expect(screen.queryByTestId("vendored-panel")).toBeNull();
    expect(screen.queryByTestId("scripts-panel")).toBeNull();
    expect(screen.queryByTestId("package-analysis-error")).toBeNull();
  });

  it("renders the completeness bar then both panels, separated, with the same completeness", () => {
    mockUseQuery.mockReturnValue({ data: ANALYSIS, isLoading: false, isError: false });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);

    const badge = screen.getByTestId("scan-completeness");
    expect(badge.getAttribute("data-status")).toBe("partial");
    expect(badge.getAttribute("data-reason")).toBe("truncated");
    expect(badge.getAttribute("data-files")).toBe("7/10");
    expect(screen.getByTestId("package-analysis-completeness").textContent).toContain("7 of 10 files read");
    expect(screen.getByTestId("package-analysis-completeness").textContent).toMatch(/conda/i);

    const vendored = screen.getByTestId("vendored-panel");
    expect(vendored.getAttribute("data-count")).toBe("1");
    expect(vendored.getAttribute("data-status")).toBe("partial");

    const scripts = screen.getByTestId("scripts-panel");
    expect(scripts.getAttribute("data-count")).toBe("2");
    expect(scripts.getAttribute("data-status")).toBe("partial");

    expect(screen.getByTestId("separator")).toBeDefined();

    // Order: completeness bar → vendored → separator → scripts.
    const root = screen.getByTestId("package-analysis");
    const order = Array.from(root.querySelectorAll("[data-testid]")).map((el) =>
      el.getAttribute("data-testid")
    );
    expect(order.indexOf("package-analysis-completeness")).toBeLessThan(order.indexOf("vendored-panel"));
    expect(order.indexOf("vendored-panel")).toBeLessThan(order.indexOf("separator"));
    expect(order.indexOf("separator")).toBeLessThan(order.indexOf("scripts-panel"));
  });

  it("omits the files ratio when the backend did not report counts", () => {
    mockUseQuery.mockReturnValue({
      data: {
        ...ANALYSIS,
        analyzed_at: null,
        completeness: { status: "complete", reason: null, files_total: null, files_read: null },
      },
      isLoading: false,
      isError: false,
    });
    render(<PackageAnalysisTabContent artifact={ARTIFACT} />);
    expect(screen.getByTestId("package-analysis-completeness").textContent).not.toMatch(/files read/);
    expect(screen.getByTestId("package-analysis-completeness").textContent).not.toMatch(/Analyzed/);
  });

  it("does not query and explains honestly for a non-analyzable (proxy-cached) artifact (#2292)", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<PackageAnalysisTabContent artifact={{ ...ARTIFACT, analyzable: false }} />);
    const opts = mockUseQuery.mock.calls[0][0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
    const block = screen.getByTestId("package-analysis-unavailable");
    expect(block.textContent).toContain("This artifact cannot be analyzed.");
    // #3344 narrowed this copy: analysis and on-demand scans stay hosted-only,
    // but the old blanket "not proxy-cached remote artifacts" also denied the
    // download-time scanning that PyPI/npm/Docker proxies actually do.
    expect(block.textContent).toContain("Proxy-cached artifacts");
    expect(block.textContent).toContain(
      "on-demand scans are available only for artifacts hosted in this registry",
    );
    expect(screen.queryByTestId("package-analysis-none")).toBeNull();
    expect(screen.queryByTestId("vendored-panel")).toBeNull();
  });
});
