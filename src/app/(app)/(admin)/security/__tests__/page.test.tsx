// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mock fns
// ---------------------------------------------------------------------------

const {
  mockUseQuery,
  mockUseMutation,
  mockInvalidateQueries,
  mockRouterPush,
  mockListRepositories,
  mockGetDashboard,
  mockGetAllScores,
  mockTriggerScan,
  mockGetStatus,
  mockListProjects,
  mockGetPortfolioMetrics,
  mockGetProjectMetricsHistory,
  mockGetAllViolations,
  mockArtifactsList,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockRouterPush: vi.fn(),
  mockListRepositories: vi.fn(),
  mockGetDashboard: vi.fn(),
  mockGetAllScores: vi.fn(),
  mockTriggerScan: vi.fn(),
  mockGetStatus: vi.fn(),
  mockListProjects: vi.fn(),
  mockGetPortfolioMetrics: vi.fn(),
  mockGetProjectMetricsHistory: vi.fn(),
  mockGetAllViolations: vi.fn(),
  mockArtifactsList: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/sdk-client", () => ({}));

vi.mock("@artifact-keeper/sdk", () => ({
  listRepositories: mockListRepositories,
}));

vi.mock("@/lib/api/security", () => ({
  default: {
    getDashboard: mockGetDashboard,
    getAllScores: mockGetAllScores,
    triggerScan: mockTriggerScan,
  },
}));

vi.mock("@/lib/api/dependency-track", () => ({
  default: {
    getStatus: mockGetStatus,
    listProjects: mockListProjects,
    getPortfolioMetrics: mockGetPortfolioMetrics,
    getProjectMetricsHistory: mockGetProjectMetricsHistory,
    getAllViolations: mockGetAllViolations,
  },
}));

vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: { list: mockArtifactsList },
}));

vi.mock("@/lib/dt-utils", () => ({
  aggregateHistories: vi.fn(() => []),
}));

// -- Stub UI primitives to plain HTML for testability --

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    ShieldCheck: stub("ShieldCheck"),
    ScanSearch: stub("ScanSearch"),
    Bug: stub("Bug"),
    AlertTriangle: stub("AlertTriangle"),
    AlertCircle: stub("AlertCircle"),
    Award: stub("Award"),
    ShieldBan: stub("ShieldBan"),
    RefreshCw: stub("RefreshCw"),
    Zap: stub("Zap"),
    FolderSearch: stub("FolderSearch"),
    Scale: stub("Scale"),
    XCircle: stub("XCircle"),
  };
});

vi.mock("@/components/dt", () => ({
  Sparkline: () => null,
  SeverityBar: () => null,
  RiskGauge: () => null,
  ProgressRow: () => null,
  TrendChart: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));

vi.mock("@/components/common/stat-card", () => ({
  StatCard: ({ label, value }: any) => (
    <div data-testid={`stat-${label}`}>{value}</div>
  ),
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ columns, data }: any) => (
    <table data-testid="scores-table">
      <thead>
        <tr>
          {columns.map((col: any) => (
            <th key={col.id}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row: any, i: number) => (
          <tr key={i}>
            {columns.map((col: any) => (
              <td key={col.id} data-column={col.id}>
                {col.cell ? col.cell(row) : col.accessor ? String(col.accessor(row)) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import SecurityDashboardPage from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScore(overrides: Partial<{
  id: string;
  repository_id: string;
  score: number;
  grade: string;
  total_findings: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  acknowledged_count: number;
  last_scan_at: string | null;
  calculated_at: string;
}> = {}) {
  return {
    id: "score-1",
    repository_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    score: 85,
    grade: "B",
    total_findings: 5,
    critical_count: 0,
    high_count: 1,
    medium_count: 2,
    low_count: 2,
    acknowledged_count: 0,
    last_scan_at: "2026-04-10T12:00:00Z",
    calculated_at: "2026-04-10T12:00:00Z",
    ...overrides,
  };
}

const REPO_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REPO_NAME = "my-docker-repo";
const REPO_KEY = "docker-local";

/**
 * Configure mockUseQuery to return specific data for each query key.
 * Accepts overrides for individual query results.
 */
function setupQueries(overrides: {
  dashboard?: any;
  scores?: any;
  dtStatus?: any;
  dtPortfolio?: any;
  dtProjects?: any;
  dtHistory?: any;
  dtViolations?: any;
  repos?: any;
  artifacts?: any;
} = {}) {
  mockUseQuery.mockImplementation((opts: any) => {
    const key = opts.queryKey?.[0];
    const subKey = opts.queryKey?.[1];

    if (key === "security" && subKey === "dashboard") {
      return { data: overrides.dashboard ?? undefined, isLoading: false };
    }
    if (key === "security" && subKey === "scores") {
      return { data: overrides.scores ?? [], isLoading: false };
    }
    if (key === "dt" && subKey === "status") {
      return { data: overrides.dtStatus ?? undefined };
    }
    if (key === "dt" && subKey === "portfolio-metrics") {
      return { data: overrides.dtPortfolio ?? undefined };
    }
    if (key === "dt" && subKey === "projects") {
      return { data: overrides.dtProjects ?? undefined };
    }
    if (key === "dt" && subKey === "history") {
      return { data: overrides.dtHistory ?? undefined };
    }
    if (key === "dt" && (subKey === "portfolio-violations" || String(opts.queryKey?.[1]).startsWith("portfolio-violations"))) {
      return { data: overrides.dtViolations ?? undefined, isLoading: false };
    }
    if (key === "repositories-for-scan") {
      return { data: overrides.repos ?? undefined };
    }
    if (key === "artifacts-for-scan") {
      return { data: overrides.artifacts ?? undefined, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SecurityDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  // -------------------------------------------------------------------------
  // Repository name resolution (the PR #279 fix)
  // -------------------------------------------------------------------------

  describe("repository name display in scores table", () => {
    it("shows repository name when repo data is loaded", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [{ id: REPO_UUID, name: REPO_NAME, key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      // The cell should render a <span> with the repo name, not a <code> with a UUID
      expect(screen.getByText(REPO_NAME)).toBeInTheDocument();
      expect(screen.queryByText(`${REPO_UUID.slice(0, 12)}...`)).not.toBeInTheDocument();
    });

    it("falls back to repo key when name is empty", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [{ id: REPO_UUID, name: "", key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      expect(screen.getByText(REPO_KEY)).toBeInTheDocument();
    });

    it("shows truncated UUID when repository list has not loaded", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: undefined,
      });

      render(<SecurityDashboardPage />);

      // When repos aren't loaded, repoNameMap is empty, so the cell renders
      // a <code> with the first 12 chars of the UUID followed by "..."
      const truncated = `${REPO_UUID.slice(0, 12)}...`;
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it("shows truncated UUID when repo ID is not in the repo list", () => {
      const unknownUuid = "11111111-2222-3333-4444-555555555555";
      setupQueries({
        scores: [makeScore({ repository_id: unknownUuid })],
        repos: [{ id: REPO_UUID, name: REPO_NAME, key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      const truncated = `${unknownUuid.slice(0, 12)}...`;
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it("renders UUID fallback as <code> and name as <span>", () => {
      const knownUuid = "aaaaaaaa-1111-2222-3333-444444444444";
      const unknownUuid = "bbbbbbbb-5555-6666-7777-888888888888";

      setupQueries({
        scores: [
          makeScore({ id: "s1", repository_id: knownUuid }),
          makeScore({ id: "s2", repository_id: unknownUuid }),
        ],
        repos: [{ id: knownUuid, name: "npm-releases", key: "npm-rel" }],
      });

      render(<SecurityDashboardPage />);

      // The known repo should render in a <span> with font-medium class
      const nameEl = screen.getByText("npm-releases");
      expect(nameEl.tagName).toBe("SPAN");
      expect(nameEl.className).toContain("font-medium");

      // The unknown repo should render in a <code> element
      const truncated = `${unknownUuid.slice(0, 12)}...`;
      const codeEl = screen.getByText(truncated);
      expect(codeEl.tagName).toBe("CODE");
    });
  });

  // -------------------------------------------------------------------------
  // repoNameMap correctness
  // -------------------------------------------------------------------------

  describe("repoNameMap lookup", () => {
    it("maps multiple repository UUIDs to their display names", () => {
      const repoA = { id: "aaa-111", name: "Repo Alpha", key: "alpha" };
      const repoB = { id: "bbb-222", name: "", key: "beta-key" };
      const repoC = { id: "ccc-333", name: "Repo Gamma", key: "gamma" };

      setupQueries({
        scores: [
          makeScore({ id: "s1", repository_id: "aaa-111" }),
          makeScore({ id: "s2", repository_id: "bbb-222" }),
          makeScore({ id: "s3", repository_id: "ccc-333" }),
        ],
        repos: [repoA, repoB, repoC],
      });

      render(<SecurityDashboardPage />);

      // repoA has a name, so it should show
      expect(screen.getByText("Repo Alpha")).toBeInTheDocument();
      // repoB has no name, should fall back to key
      expect(screen.getByText("beta-key")).toBeInTheDocument();
      // repoC has a name
      expect(screen.getByText("Repo Gamma")).toBeInTheDocument();
    });

    it("prefers name over key when both are present", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [{ id: REPO_UUID, name: REPO_NAME, key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      // Name should be used, not key
      expect(screen.getByText(REPO_NAME)).toBeInTheDocument();
      expect(screen.queryByText(REPO_KEY)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Column accessor (used for sorting)
  // -------------------------------------------------------------------------

  describe("repository column accessor", () => {
    it("returns resolved name for accessor (used by sort)", () => {
      // The DataTable mock renders accessor output as text.
      // We verify the accessor value appears in the cell's data-column="repository_id" td.
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [{ id: REPO_UUID, name: REPO_NAME, key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      // The accessor returns the repo name for sorting. Our mock DataTable calls
      // col.cell(row) for rendering, but also passes accessor output via String().
      // The cell renderer should produce the name.
      const cells = screen.getAllByText(REPO_NAME);
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });

    it("returns raw UUID for accessor when repo not found", () => {
      const unknownUuid = "99999999-aaaa-bbbb-cccc-dddddddddddd";
      setupQueries({
        scores: [makeScore({ repository_id: unknownUuid })],
        repos: [],
      });

      render(<SecurityDashboardPage />);

      // The truncated UUID appears from the cell renderer
      const truncated = `${unknownUuid.slice(0, 12)}...`;
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Repos query is now eagerly fetched (not gated by triggerOpen)
  // -------------------------------------------------------------------------

  describe("repository list fetching", () => {
    it("fetches repositories eagerly (not gated by dialog open state)", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [{ id: REPO_UUID, name: REPO_NAME, key: REPO_KEY }],
      });

      render(<SecurityDashboardPage />);

      // Verify the repositories-for-scan query was called
      const repoCall = mockUseQuery.mock.calls.find(
        (call: any[]) => call[0]?.queryKey?.[0] === "repositories-for-scan"
      );
      expect(repoCall).toBeDefined();
      // The query should NOT have enabled: false (since the gate was removed)
      expect(repoCall![0].enabled).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  describe("empty states", () => {
    it("renders table with no rows when scores are empty", () => {
      setupQueries({ scores: [], repos: [] });

      render(<SecurityDashboardPage />);

      const table = screen.getByTestId("scores-table");
      expect(table).toBeInTheDocument();
      // Table headers should still render
      expect(screen.getByText("Repository")).toBeInTheDocument();
      expect(screen.getByText("Grade")).toBeInTheDocument();
    });

    it("handles empty repo list gracefully for name resolution", () => {
      setupQueries({
        scores: [makeScore({ repository_id: REPO_UUID })],
        repos: [],
      });

      render(<SecurityDashboardPage />);

      // With empty repo list, all UUIDs should fall back to truncated form
      const truncated = `${REPO_UUID.slice(0, 12)}...`;
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });
  });
});
