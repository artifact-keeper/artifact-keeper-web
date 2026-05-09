// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let queryResponses: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const keyStr = String(opts.queryKey[0]);
    if (queryResponses[keyStr]) {
      if (opts.queryFn && opts.enabled !== false) {
        try {
          opts.queryFn();
        } catch {
          /* safe */
        }
      }
      return queryResponses[keyStr];
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: (config: { mutationFn: (...args: unknown[]) => unknown }) => ({
    mutate: vi.fn(),
    isPending: false,
    mutationFn: config.mutationFn,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// next/link stub: renders an anchor so we can assert href without next/router.
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/sbom", () => ({
  default: { getCveHistory: vi.fn(), updateCveStatus: vi.fn() },
}));

const mockListArtifactScans = vi.fn();
vi.mock("@/lib/api/security", () => ({
  default: {
    listArtifactScans: (...args: unknown[]) => mockListArtifactScans(...args),
  },
}));

vi.mock("@/lib/api/dependency-track", () => ({
  default: {
    getStatus: vi.fn(),
    listProjects: vi.fn(),
    getProjectMetrics: vi.fn(),
    getProjectFindings: vi.fn(),
    updateAnalysis: vi.fn(),
  },
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (_e: unknown, fallback: string) => fallback,
}));

// DataTable stub — render rows with rowKey, columns ignored (we don't assert
// column-rendering of the existing CVE/DT tables here; this test focuses on
// the new ArtifactScansSection which doesn't use DataTable).
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    rowKey,
    emptyMessage,
  }: {
    data: unknown[];
    rowKey: (r: unknown) => string;
    emptyMessage: string;
  }) =>
    data.length === 0 ? (
      <div>{emptyMessage}</div>
    ) : (
      <div data-testid="data-table">
        {data.map((row) => (
          <div key={rowKey(row)} data-testid="data-table-row" />
        ))}
      </div>
    ),
}));

vi.mock("@/components/common/vuln-id-link", () => ({
  VulnIdLink: ({ id }: { id: string }) => <span>{id}</span>,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ARTIFACT = {
  id: "art-1",
  name: "hello-py:1",
  version: "1",
  metadata: {},
} as never;

const SAMPLE_SCAN_COMPLETED = {
  id: "scan-1",
  artifact_id: "art-1",
  artifact_name: "hello-py:1",
  artifact_version: "1",
  repository_id: "repo-1",
  scan_type: "container-image",
  status: "completed",
  findings_count: 11,
  critical_count: 1,
  high_count: 3,
  medium_count: 5,
  low_count: 2,
  info_count: 0,
  scanner_version: "trivy-0.62.1",
  error_message: null,
  started_at: "2026-05-09T12:00:00Z",
  completed_at: "2026-05-09T12:01:30Z",
  created_at: "2026-05-09T12:00:00Z",
};

const SAMPLE_SCAN_FAILED = {
  ...SAMPLE_SCAN_COMPLETED,
  id: "scan-2",
  status: "failed",
  findings_count: 0,
  critical_count: 0,
  high_count: 0,
  medium_count: 0,
  low_count: 0,
  completed_at: null,
};

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { SecurityTabContent } from "./security-tab-content";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SecurityTabContent — Image / Package Scans section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResponses = {
      // Drive the existing CVE branch into its empty state so we don't have
      // to stub the whole CVE table; we're testing the new scans section.
      "cve-history": { data: [], isLoading: false },
      "dt-status": { data: { enabled: false, healthy: false, url: null } },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("shows empty state when listArtifactScans returns no items", () => {
    queryResponses["artifact-scans"] = { data: { items: [], total: 0 } };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Image / Package Scans")).toBeInTheDocument();
    expect(
      screen.getByText("No scans recorded for this artifact."),
    ).toBeInTheDocument();
  });

  it("renders a row per scan with status, findings count, and a 'View details' link", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_COMPLETED, SAMPLE_SCAN_FAILED], total: 2 },
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);

    // Both rows render
    expect(screen.getAllByText("container-image")).toHaveLength(2);

    // Status badges are visible
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();

    // Findings_count badge appears for the completed scan only
    expect(screen.getByText("11 findings")).toBeInTheDocument();

    // Severity sub-counts render for the completed scan
    expect(screen.getByText("1 critical")).toBeInTheDocument();
    expect(screen.getByText("3 high")).toBeInTheDocument();
    expect(screen.getByText("5 medium")).toBeInTheDocument();
    expect(screen.getByText("2 low")).toBeInTheDocument();

    // "View details" links to the existing per-scan detail route
    const links = screen.getAllByRole("link", { name: /View details/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/security/scans/scan-1");
    expect(links[1]).toHaveAttribute("href", "/security/scans/scan-2");
  });

  it("shows the total-scans badge in the section header when scans exist", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_COMPLETED], total: 1 },
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("invokes listArtifactScans with the artifact id", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [], total: 0 },
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(mockListArtifactScans).toHaveBeenCalledWith("art-1", { per_page: 25 });
  });
});
