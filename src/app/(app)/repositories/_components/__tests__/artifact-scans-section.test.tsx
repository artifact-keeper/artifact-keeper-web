// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@/lib/api/security", () => ({
  default: { listArtifactScans: vi.fn() },
  securityApi: { listArtifactScans: vi.fn() },
}));

vi.mock("@/lib/api/sbom", () => ({
  default: { getCveHistory: vi.fn() },
  sbomApi: { getCveHistory: vi.fn() },
}));

vi.mock("@/lib/api/dependency-track", () => ({
  default: {},
  dtApi: {},
}));

vi.mock("@/lib/error-utils", () => ({ mutationErrorToast: () => () => {} }));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    ShieldAlert: icon,
    ShieldCheck: icon,
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

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
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
            // Invoke accessor for sortable columns to exercise the lambda
            // (the real DataTable calls accessor for sort/filter).
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

vi.mock("@/components/common/vuln-id-link", () => ({
  VulnIdLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { ArtifactScansSection } from "../artifact-scans-section";

describe("ArtifactScansSection (#368)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders the empty state when no scans have been run", () => {
    mockUseQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });
    render(<ArtifactScansSection artifactId="a1" />);
    expect(
      screen.getByText(/No security scans have been run/i),
    ).toBeDefined();
  });

  it("renders a skeleton while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<ArtifactScansSection artifactId="a1" />);
    expect(screen.getByTestId("skeleton")).toBeDefined();
  });

  it("renders an error banner when listArtifactScans fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network down"),
    });
    render(<ArtifactScansSection artifactId="a1" />);
    expect(screen.getByText(/Could not load scan results/i)).toBeDefined();
    expect(screen.getByText(/Network down/i)).toBeDefined();
  });

  it("renders a row per scan with severity badges and a link to per-scan findings", () => {
    mockUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "scan-1",
            artifact_id: "a1",
            artifact_name: "lib.jar",
            artifact_version: "1.0",
            repository_id: "r1",
            scan_type: "trivy",
            status: "completed",
            findings_count: 5,
            critical_count: 1,
            high_count: 2,
            medium_count: 1,
            low_count: 1,
            info_count: 0,
            scanner_version: "0.45.0",
            error_message: null,
            started_at: "2026-05-01T00:00:00Z",
            completed_at: "2026-05-01T00:01:00Z",
            created_at: "2026-05-01T00:00:00Z",
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<ArtifactScansSection artifactId="a1" />);

    expect(screen.getByTestId("row-scan-1")).toBeDefined();
    expect(screen.getByText(/1 crit/i)).toBeDefined();
    expect(screen.getByText(/2 high/i)).toBeDefined();
    const link = screen.getByText(/View findings/i).closest("a") as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/security/scans/scan-1");
  });

  it("hides crit/high pills when those counts are zero", () => {
    mockUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "scan-2",
            artifact_id: "a1",
            artifact_name: null,
            artifact_version: null,
            repository_id: "r1",
            scan_type: "trivy",
            status: "completed",
            findings_count: 1,
            critical_count: 0,
            high_count: 0,
            medium_count: 0,
            low_count: 1,
            info_count: 0,
            scanner_version: null,
            error_message: null,
            started_at: null,
            completed_at: null,
            created_at: "2026-05-01T00:00:00Z",
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    });
    render(<ArtifactScansSection artifactId="a1" />);
    expect(screen.queryByText(/crit/i)).toBeNull();
    expect(screen.queryByText(/high/i)).toBeNull();
  });

  it("calls listArtifactScans with the supplied artifactId (#368)", async () => {
    let capturedKey: unknown;
    let capturedFn: (() => Promise<unknown>) | undefined;
    mockUseQuery.mockImplementation(
      (opts: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
        capturedKey = opts.queryKey;
        capturedFn = opts.queryFn;
        return { data: { items: [], total: 0 }, isLoading: false, isError: false };
      },
    );
    const security = (await import("@/lib/api/security")).default;
    (security.listArtifactScans as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
    });
    render(<ArtifactScansSection artifactId="a1" />);
    expect(capturedKey).toEqual(["security", "artifact-scans", "a1"]);
    // Invoke the queryFn so coverage hits the SDK call line, and verify
    // the artifactId is forwarded.
    await capturedFn?.();
    expect(security.listArtifactScans).toHaveBeenCalledWith("a1");
  });
});
