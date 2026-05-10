// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let queryResponses: Record<string, unknown> = {};
let capturedMutations: Array<{
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}> = [];

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
    return { data: undefined, isLoading: false, isError: false };
  },
  useMutation: (config: {
    mutationFn: (...args: unknown[]) => unknown;
    onSuccess?: () => void;
    onError?: (err: unknown) => void;
  }) => {
    capturedMutations.push(config);
    return {
      mutate: vi.fn((args: unknown) => {
        try {
          const result = config.mutationFn(args as never);
          // Synchronously execute success path so onSuccess line coverage fires.
          if (result && typeof (result as { then?: unknown }).then === "function") {
            (result as Promise<unknown>).then(
              () => config.onSuccess?.(),
              (e) => config.onError?.(e),
            );
          } else {
            config.onSuccess?.();
          }
        } catch (e) {
          config.onError?.(e);
        }
      }),
      isPending: false,
      mutationFn: config.mutationFn,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (_e: unknown, fallback: string) => fallback,
  mutationErrorToast: (label: string) => () => {
    /* swallow */
    void label;
  },
}));

// DataTable stub — invokes each column's `cell` renderer for each row so the
// cell-builder code paths get covered. Header sortable/onPageChange ignored.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    columns,
    rowKey,
    emptyMessage,
  }: {
    data: unknown[];
    columns: Array<{ id: string; cell?: (row: unknown) => React.ReactNode; accessor?: (row: unknown) => unknown }>;
    rowKey: (r: unknown) => string;
    emptyMessage: string;
  }) =>
    data.length === 0 ? (
      <div>{emptyMessage}</div>
    ) : (
      <div data-testid="data-table">
        {data.map((row) => (
          <div key={rowKey(row)} data-testid="data-table-row">
            {columns.map((col) => (
              <div key={col.id} data-testid={`cell-${col.id}`}>
                {col.cell ? col.cell(row) : (col.accessor ? String(col.accessor(row) ?? "") : null)}
              </div>
            ))}
          </div>
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

const ARTIFACT_BASE = {
  id: "art-1",
  name: "hello-py",
  version: "1",
  metadata: {} as Record<string, unknown>,
};
const ARTIFACT = ARTIFACT_BASE as never;
const ARTIFACT_WITH_DT_LINK = {
  ...ARTIFACT_BASE,
  metadata: { dt_project_uuid: "dt-proj-meta" },
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

const SAMPLE_SCAN_HIGH_ONLY = {
  ...SAMPLE_SCAN_COMPLETED,
  id: "scan-3",
  findings_count: 4,
  critical_count: 0,
  high_count: 4,
  medium_count: 0,
  low_count: 0,
};

const SAMPLE_CVE = {
  id: "cve-row-1",
  cve_id: "CVE-2024-0001",
  severity: "Critical",
  status: "open",
  affected_component: "openssl",
  affected_version: "1.1.1k",
  cvss_score: 9.8,
  first_detected_at: "2026-04-01T00:00:00Z",
  last_seen_at: "2026-05-01T00:00:00Z",
  description: "test",
};

const SAMPLE_CVE_FIXED = {
  ...SAMPLE_CVE,
  id: "cve-row-2",
  cve_id: "CVE-2024-0002",
  severity: "high",
  status: "fixed",
  cvss_score: null,
  first_detected_at: "2026-03-01T00:00:00Z",
};

const SAMPLE_DT_PROJECT = {
  uuid: "dt-proj-uuid",
  name: "hello-py",
  version: "1",
};

const SAMPLE_DT_METRICS = {
  critical: 2,
  high: 1,
  medium: 0,
  low: 4,
  unassigned: 0,
  vulnerabilities: 7,
  vulnerableComponents: 3,
  components: 12,
  suppressed: 1,
  findingsTotal: 7,
  findingsAudited: 4,
  inheritedRiskScore: 18.5,
  policyViolationsTotal: 2,
  policyViolationsFail: 1,
  policyViolationsWarn: 1,
  policyViolationsInfo: 0,
  policyViolationsAudited: 0,
  suppressions: 1,
};

const SAMPLE_DT_FINDING = {
  component: { uuid: "comp-1", name: "left-pad", version: "1.0.0" },
  vulnerability: {
    uuid: "vuln-1",
    vulnId: "GHSA-xxxx",
    source: "GITHUB",
    severity: "Critical",
    cvssV3BaseScore: 9.1,
    cwe: { cweId: 79, name: "XSS" },
  },
  analysis: { state: "EXPLOITABLE", suppressed: false },
};

const SAMPLE_DT_FINDING_NO_CWE = {
  ...SAMPLE_DT_FINDING,
  component: { uuid: "comp-2", name: "request", version: undefined },
  vulnerability: {
    uuid: "vuln-2",
    vulnId: "CVE-2024-9999",
    source: "NVD",
    severity: "High",
    cvssV3BaseScore: undefined,
    cwe: undefined,
  },
  analysis: undefined,
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
    capturedMutations = [];
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "admin", is_admin: true },
    });
    queryResponses = {
      "cve-history": { data: [], isLoading: false },
      "dt-status": { data: { enabled: false, healthy: false, url: null } },
    };
  });

  afterEach(() => cleanup());

  it("shows skeleton placeholders while the artifact-scans query is loading", () => {
    queryResponses["artifact-scans"] = { data: undefined, isLoading: true, isError: false };
    const { container } = render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Image / Package Scans")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(2);
    // Empty state and error state must not be visible.
    expect(screen.queryByText("No scans recorded for this artifact.")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not load scan results")).not.toBeInTheDocument();
  });

  it("shows a warning banner when the artifact-scans query errors", () => {
    queryResponses["artifact-scans"] = { data: undefined, isLoading: false, isError: true };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Could not load scan results")).toBeInTheDocument();
    expect(screen.queryByText("No scans recorded for this artifact.")).not.toBeInTheDocument();
  });

  it("shows empty state when listArtifactScans returns no items", () => {
    queryResponses["artifact-scans"] = { data: { items: [], total: 0 }, isLoading: false, isError: false };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Image / Package Scans")).toBeInTheDocument();
    expect(screen.getByText("No scans recorded for this artifact.")).toBeInTheDocument();
  });

  it("renders a row per scan with status, findings count, and a 'View details' link for admins", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_COMPLETED, SAMPLE_SCAN_FAILED], total: 2 },
      isLoading: false,
      isError: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);

    expect(screen.getAllByText("container-image")).toHaveLength(2);
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("11 findings")).toBeInTheDocument();

    expect(screen.getByText("1 critical")).toBeInTheDocument();
    expect(screen.getByText("3 high")).toBeInTheDocument();
    expect(screen.getByText("5 medium")).toBeInTheDocument();
    expect(screen.getByText("2 low")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /View details/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/security/scans/scan-1");
    expect(links[1]).toHaveAttribute("href", "/security/scans/scan-2");
  });

  it("hides the 'View details' link from non-admin users (they see 'Admin only' instead)", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "alice", is_admin: false },
    });
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_COMPLETED], total: 1 },
      isLoading: false,
      isError: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.queryByRole("link", { name: /View details/i })).not.toBeInTheDocument();
    expect(screen.getByText("Admin only")).toBeInTheDocument();
  });

  it("uses the SDK total field for the section badge, not the items array length", () => {
    // The backend returns total=47 but per_page=25 truncates the page.
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_COMPLETED], total: 47 },
      isLoading: false,
      isError: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("47 total")).toBeInTheDocument();
    expect(screen.queryByText("1 total")).not.toBeInTheDocument();
  });

  it("hides severity sub-counts that are zero (only shows severities with findings)", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [SAMPLE_SCAN_HIGH_ONLY], total: 1 },
      isLoading: false,
      isError: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("4 high")).toBeInTheDocument();
    expect(screen.queryByText(/critical/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/medium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/low/i)).not.toBeInTheDocument();
  });

  it("invokes listArtifactScans with the artifact id and per_page=25", () => {
    queryResponses["artifact-scans"] = {
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(mockListArtifactScans).toHaveBeenCalledWith("art-1", { per_page: 25 });
  });
});

// ---------------------------------------------------------------------------
// Coverage: existing CVE / DT / sub-component branches
// ---------------------------------------------------------------------------

describe("SecurityTabContent — CVE history rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "admin", is_admin: true },
    });
    queryResponses = {
      "artifact-scans": { data: { items: [], total: 0 }, isLoading: false, isError: false },
      "dt-status": { data: { enabled: false, healthy: false, url: null } },
    };
  });

  afterEach(() => cleanup());

  it("renders the loading skeleton while CVE history is fetching", () => {
    queryResponses["cve-history"] = { data: undefined, isLoading: true };
    const { container } = render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    // Should bail before rendering the rest of the tab.
    expect(screen.queryByText("Security Vulnerabilities")).not.toBeInTheDocument();
  });

  it("renders the empty CVE state when no vulnerabilities exist", () => {
    queryResponses["cve-history"] = { data: [], isLoading: false };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Security Vulnerabilities")).toBeInTheDocument();
    expect(
      screen.getByText("No vulnerabilities detected for this artifact."),
    ).toBeInTheDocument();
  });

  it("renders the severity breakdown bar and total when CVEs are present", () => {
    queryResponses["cve-history"] = {
      data: [SAMPLE_CVE, SAMPLE_CVE_FIXED],
      isLoading: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("2 total")).toBeInTheDocument();
    // CVE table renders via stubbed DataTable — look for two rows.
    expect(screen.getAllByTestId("data-table-row")).toHaveLength(2);
  });
});

describe("SecurityTabContent — Dependency-Track integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "admin", is_admin: true },
    });
    queryResponses = {
      "cve-history": { data: [], isLoading: false },
      "artifact-scans": { data: { items: [], total: 0 }, isLoading: false, isError: false },
    };
  });

  afterEach(() => cleanup());

  it("renders the 'Dependency-Track is unavailable' banner when DT is disabled", () => {
    queryResponses["dt-status"] = { data: { enabled: false, healthy: false, url: null } };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Dependency-Track is unavailable")).toBeInTheDocument();
  });

  it("renders the 'no project linked' empty-state when DT is healthy but artifact has no project", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: true, url: "https://dt.example" },
    };
    queryResponses["dt-projects"] = { data: [] };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(
      screen.getByText("No Dependency-Track project linked to this artifact."),
    ).toBeInTheDocument();
  });

  it("renders metrics + findings when DT is enabled and the artifact has a metadata-linked project", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: true, url: "https://dt.example" },
    };
    queryResponses["dt-projects"] = { data: [SAMPLE_DT_PROJECT] };
    queryResponses["dt-project-metrics"] = { data: SAMPLE_DT_METRICS, isLoading: false };
    queryResponses["dt-project-findings"] = {
      data: [SAMPLE_DT_FINDING, SAMPLE_DT_FINDING_NO_CWE],
      isLoading: false,
    };
    render(<SecurityTabContent artifact={ARTIFACT_WITH_DT_LINK} />);
    expect(screen.getByText("Dependency-Track Findings")).toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.getByText("Policy Violations")).toBeInTheDocument();
    expect(screen.getAllByTestId("data-table-row")).toHaveLength(2);
  });

  it("resolves the DT project by name+version when no metadata link is set", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: true, url: "https://dt.example" },
    };
    queryResponses["dt-projects"] = { data: [SAMPLE_DT_PROJECT] };
    queryResponses["dt-project-metrics"] = { data: SAMPLE_DT_METRICS, isLoading: false };
    queryResponses["dt-project-findings"] = { data: [], isLoading: false };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    // The "no findings" empty state inside the DT section.
    expect(
      screen.getByText("No findings reported by Dependency-Track for this project."),
    ).toBeInTheDocument();
  });

  it("renders skeleton placeholders while DT metrics are loading", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: true, url: "https://dt.example" },
    };
    queryResponses["dt-projects"] = { data: [SAMPLE_DT_PROJECT] };
    queryResponses["dt-project-metrics"] = { data: undefined, isLoading: true };
    queryResponses["dt-project-findings"] = { data: undefined, isLoading: true };
    const { container } = render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});

describe("SecurityTabContent — mutation success/error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutations = [];
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "admin", is_admin: true },
    });
    queryResponses = {
      "cve-history": { data: [SAMPLE_CVE], isLoading: false },
      "dt-status": { data: { enabled: true, healthy: true, url: "https://dt.example" } },
      "dt-projects": { data: [SAMPLE_DT_PROJECT] },
      "dt-project-metrics": { data: SAMPLE_DT_METRICS, isLoading: false },
      "dt-project-findings": { data: [SAMPLE_DT_FINDING], isLoading: false },
      "artifact-scans": { data: { items: [], total: 0 }, isLoading: false, isError: false },
    };
  });

  afterEach(() => cleanup());

  it("invokes updateStatusMutation success path (toast + invalidate)", async () => {
    const sbomApi = (await import("@/lib/api/sbom")).default;
    (sbomApi.updateCveStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<SecurityTabContent artifact={ARTIFACT} />);
    // First captured mutation is updateStatusMutation; second is dtTriageMutation.
    capturedMutations[0]!.mutationFn({
      cveId: "cve-row-1",
      status: "fixed",
      reason: "patched",
    } as never);
    expect(sbomApi.updateCveStatus).toHaveBeenCalledWith("cve-row-1", {
      status: "fixed",
      reason: "patched",
    });
    capturedMutations[0]!.onSuccess?.();
    capturedMutations[0]!.onError?.(new Error("boom"));
  });

  it("invokes dtTriageMutation success/error paths", async () => {
    const dtApi = (await import("@/lib/api/dependency-track")).default;
    (dtApi.updateAnalysis as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<SecurityTabContent artifact={ARTIFACT_WITH_DT_LINK} />);
    // Find the dtTriageMutation entry — it's the second mutation registered.
    const dtMutation = capturedMutations[1];
    expect(dtMutation).toBeDefined();
    dtMutation!.mutationFn({
      componentUuid: "comp-1",
      vulnerabilityUuid: "vuln-1",
      state: "EXPLOITABLE",
    } as never);
    expect(dtApi.updateAnalysis).toHaveBeenCalled();
    dtMutation!.onSuccess?.();
    dtMutation!.onError?.(new Error("triage failed"));
  });
});

describe("SecurityTabContent — DtIntegrationStatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutations = [];
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { username: "admin", is_admin: true },
    });
    queryResponses = {
      "cve-history": { data: [], isLoading: false },
      "artifact-scans": { data: { items: [], total: 0 }, isLoading: false, isError: false },
    };
  });

  afterEach(() => cleanup());

  it("shows 'Connected' badge when DT is enabled, healthy and project linked", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: true, url: "https://dt.example/project/abc" },
    };
    queryResponses["dt-projects"] = { data: [SAMPLE_DT_PROJECT] };
    queryResponses["dt-project-metrics"] = { data: SAMPLE_DT_METRICS, isLoading: false };
    queryResponses["dt-project-findings"] = { data: [], isLoading: false };
    render(<SecurityTabContent artifact={ARTIFACT_WITH_DT_LINK} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Project Linked")).toBeInTheDocument();
    expect(screen.getByText("https://dt.example/project/abc")).toBeInTheDocument();
  });

  it("shows 'Disabled' when DT is not enabled", () => {
    queryResponses["dt-status"] = { data: { enabled: false, healthy: false, url: null } };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("shows 'Unhealthy' when DT is enabled but unhealthy", () => {
    queryResponses["dt-status"] = {
      data: { enabled: true, healthy: false, url: "https://dt.example" },
    };
    render(<SecurityTabContent artifact={ARTIFACT} />);
    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
  });
});
