// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

import type { Artifact } from "@/types";
import { ANALYZABLE_DISABLED_REASON } from "@/lib/artifact-analyzable";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api/sbom", () => ({
  sbomApi: { getCveHistory: vi.fn(), updateCveStatus: vi.fn() },
}));

vi.mock("@/lib/api/dependency-track", () => ({
  dtApi: {
    getStatus: vi.fn(),
    listProjects: vi.fn(),
    getProjectMetrics: vi.fn(),
    getProjectFindings: vi.fn(),
    updateAnalysis: vi.fn(),
  },
}));

vi.mock("@/lib/error-utils", () => ({ mutationErrorToast: () => () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    ShieldAlert: icon,
    ShieldCheck: icon,
    ShieldQuestion: icon,
    AlertTriangle: icon,
    Clock: icon,
    ChevronDown: icon,
    CheckCircle2: icon,
    XCircle: icon,
    Eye: icon,
    Link2: icon,
    Link2Off: icon,
    Activity: icon,
  };
});

// Stub out the scans list section — it has its own tests
// (artifact-scans-section.test.tsx) and its own queries; stubbing it here
// keeps this file focused on the CVE-history empty state this task changes.
vi.mock("../artifact-scans-section", () => ({
  ArtifactScansSection: () => <div data-testid="stub-artifact-scans-section" />,
}));

// Same rationale for the proxy verdict panel — it has its own query and its
// own tests (proxy-scan-panel.test.tsx). Here we only assert that it is
// mounted for proxy-cached artifacts and given the right lookup key.
const proxyPanelProps = vi.hoisted(() => vi.fn());
vi.mock("../proxy-scan-panel", () => ({
  ProxyScanPanel: (props: { repositoryKey: string; path: string }) => {
    proxyPanelProps(props);
    return <div data-testid="stub-proxy-scan-panel" />;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr /> }));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: () => <div data-testid="data-table" />,
}));

vi.mock("@/components/common/vuln-id-link", () => ({
  VulnIdLink: ({ id }: { id: string }) => <span>{id}</span>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { SecurityTabContent } from "../security-tab-content";

function art(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "a1",
    repository_key: "npm-remote",
    path: "left-pad/left-pad-1.3.0.tgz",
    name: "left-pad-1.3.0.tgz",
    size_bytes: 1024,
    checksum_sha256: "deadbeef",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

// Zero CVE history and no Dependency-Track status — drives the `total === 0`
// empty state this task changes, without pulling in the (separately tested)
// DT integration section.
function stubEmptyQueries() {
  mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0];
    if (key === "cve-history") return { data: [], isLoading: false };
    // dt-status / dt-projects / dt-project-metrics / dt-project-findings:
    // no DT integration configured, keeps the DT section from rendering.
    return { data: undefined, isLoading: false };
  });
}

describe("SecurityTabContent — CVE empty state (#3344)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptyQueries();
  });
  afterEach(() => cleanup());

  it("shows the green all-clear and SBOM hint when the artifact is analyzable", () => {
    render(<SecurityTabContent artifact={art({ analyzable: true })} />);
    expect(
      screen.getByText(/No vulnerabilities detected for this artifact/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generate an SBOM and run a security scan/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CVE history is not available/i)).toBeNull();
  });

  it("does not show a green all-clear for non-analyzable proxy-cached artifacts (#3344)", () => {
    render(<SecurityTabContent artifact={art({ analyzable: false })} />);
    // This is the bug this task fixes: a proxy-cached artifact the download
    // gate blocked must never render the "no vulnerabilities" all-clear —
    // its CVE-history total is structurally always zero, so the old
    // unconditional total===0 branch was misleading.
    expect(
      screen.queryByText(/No vulnerabilities detected for this artifact/i),
    ).toBeNull();
    // The neutral replacement state renders instead, with the narrowed
    // disabled-reason copy (proxy-cached artifacts ARE scanned at download
    // time under scan-on-proxy).
    expect(
      screen.getByText(/CVE history is not available for this artifact/i),
    ).toBeInTheDocument();
    expect(screen.getByText(ANALYZABLE_DISABLED_REASON)).toBeInTheDocument();
  });

  it("keeps the green all-clear when analyzable is absent (safe default, older responses)", () => {
    render(<SecurityTabContent artifact={art()} />);
    expect(
      screen.getByText(/No vulnerabilities detected for this artifact/i),
    ).toBeInTheDocument();
  });
});

describe("SecurityTabContent — proxy verdict panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptyQueries();
  });
  afterEach(() => cleanup());

  it("mounts the proxy verdict panel for proxy-cached artifacts, keyed by cache path", () => {
    // Every artifact-keyed source on this tab is structurally empty for proxy
    // content, so the digest-keyed verdict is the only real answer. Lookup is
    // by cache path — a digest parameter would be a cross-tenant oracle.
    render(<SecurityTabContent artifact={art({ analyzable: false })} />);

    expect(screen.getByTestId("stub-proxy-scan-panel")).toBeInTheDocument();
    expect(proxyPanelProps).toHaveBeenCalledWith({
      repositoryKey: "npm-remote",
      path: "left-pad/left-pad-1.3.0.tgz",
    });
  });

  it("does not mount the proxy verdict panel for hosted artifacts", () => {
    render(<SecurityTabContent artifact={art({ analyzable: true })} />);
    expect(screen.queryByTestId("stub-proxy-scan-panel")).toBeNull();
    expect(proxyPanelProps).not.toHaveBeenCalled();
  });
});
