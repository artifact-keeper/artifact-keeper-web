// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "scan-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));
vi.mock("@/lib/api/blast-radius", () => ({ blastRadiusHref: () => "/br" }));

const mockListFindings = vi.fn();
vi.mock("@/lib/api/security", () => ({
  securityApi: {
    getScan: vi.fn(),
    listFindings: (...a: unknown[]) => mockListFindings(...a),
    acknowledgeFinding: vi.fn(),
    revokeAcknowledgment: vi.fn(),
  },
}));

// Native-select stub (this admin-page directory's convention).
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const items: Array<{ value: string; label: string }> = [];
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      React.Children.forEach(
        (c as React.ReactElement<{ children?: React.ReactNode }>).props.children,
        (s) => {
          if (React.isValidElement(s) && (s.props as Record<string, unknown>).value) {
            const p = s.props as { value: string; children: React.ReactNode };
            items.push({
              value: p.value,
              label: React.Children.toArray(p.children).join(""),
            });
          }
        },
      );
    });
    return (
      <select
        aria-label="Severity"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

interface DataTableProps<T> {
  data: T[];
  total?: number;
  rowKey?: (r: T) => string;
  columns: {
    id: string;
    cell?: (r: T) => React.ReactNode;
    accessor?: (r: T) => unknown;
  }[];
  emptyMessage?: string;
}

vi.mock("@/components/common/data-table", () => ({
  DataTable: <T,>({ data, total, rowKey, columns, emptyMessage }: DataTableProps<T>) => (
    <div>
      <span data-testid="dt-total">{String(total ?? "")}</span>
      {data.length === 0 ? (
        <div>{emptyMessage}</div>
      ) : (
        data.map((row, i) => {
          // Invoke the accessors the real DataTable calls for sorting.
          for (const c of columns) c.accessor?.(row);
          return (
            <div key={rowKey?.(row) ?? i} data-testid="dt-row">
              {columns.map((c) => (
                <span key={c.id} data-testid={`cell-${c.id}`}>
                  {c.cell ? c.cell(row) : null}
                </span>
              ))}
            </div>
          );
        })
      )}
    </div>
  ),
}));

import SecurityScanDetailPage from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCAN = {
  id: "scan-1",
  artifact_id: "a1",
  artifact_name: "lib.jar",
  artifact_version: "1.0",
  repository_id: "r1",
  scan_type: "external",
  status: "completed",
  findings_count: 3,
  critical_count: 1,
  high_count: 1,
  medium_count: 1,
  low_count: 0,
  info_count: 0,
  scanner_version: "acme-4.2",
  error_message: null,
  started_at: "2026-05-01T00:00:00Z",
  completed_at: "2026-05-01T00:01:00Z",
  created_at: "2026-05-01T00:00:00Z",
};

const FINDING = {
  id: "f1",
  scan_result_id: "scan-1",
  artifact_id: "a1",
  severity: "critical",
  title: "Backdoored xz",
  description: null,
  cve_id: "CVE-2024-3094",
  affected_component: "xz-utils",
  affected_version: "5.6.0",
  fixed_version: "5.6.2",
  source: "acme-scanner",
  source_url: null,
  is_acknowledged: false,
  acknowledged_by: null,
  acknowledged_reason: null,
  acknowledged_at: null,
  created_at: "2026-05-01T00:00:00Z",
};

/** Latest options the findings `useQuery` was called with. */
let findingsQuery: { queryKey: unknown[]; queryFn: () => Promise<unknown> };

function setFindingsResult(result: Record<string, unknown>) {
  mockUseQuery.mockImplementation(
    (opts: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
      if (opts.queryKey?.[1] === "findings") {
        findingsQuery = opts;
        return { isLoading: false, isError: false, ...result };
      }
      return { data: SCAN, isLoading: false, isError: false };
    },
  );
}

describe("SecurityScanDetailPage findings filters (#858)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFindings.mockResolvedValue({ items: [FINDING], total: 1 });
    setFindingsResult({ data: { items: [FINDING], total: 1 } });
  });

  it("sends no filters until one is set", async () => {
    render(<SecurityScanDetailPage />);
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenCalledWith("scan-1", {
      page: 1,
      per_page: 50,
      severity: undefined,
      source: undefined,
      cve_id: undefined,
    });
  });

  it("asks the backend for the severity instead of filtering the page locally", async () => {
    render(<SecurityScanDetailPage />);
    fireEvent.change(screen.getByLabelText("Severity"), {
      target: { value: "critical" },
    });
    expect(findingsQuery.queryKey).toEqual([
      "security",
      "findings",
      "scan-1",
      1,
      50,
      "critical",
      undefined,
      undefined,
    ]);
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenLastCalledWith(
      "scan-1",
      expect.objectContaining({ severity: "critical" }),
    );
  });

  it("forwards the source and CVE filters when the form is submitted", async () => {
    const { container } = render(<SecurityScanDetailPage />);
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "  acme-scanner  " },
    });
    fireEvent.change(screen.getByLabelText("CVE"), {
      target: { value: "CVE-2024-3094" },
    });
    fireEvent.submit(container.querySelector("form")!);
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenLastCalledWith(
      "scan-1",
      expect.objectContaining({
        source: "acme-scanner",
        cve_id: "CVE-2024-3094",
      }),
    );
  });

  it("does not request until the text filters are submitted", async () => {
    const { container } = render(<SecurityScanDetailPage />);
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "acme-scanner" },
    });
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenLastCalledWith(
      "scan-1",
      expect.objectContaining({ source: undefined }),
    );
    fireEvent.submit(container.querySelector("form")!);
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenLastCalledWith(
      "scan-1",
      expect.objectContaining({ source: "acme-scanner" }),
    );
  });

  it("clears every filter at once", async () => {
    const { container } = render(<SecurityScanDetailPage />);
    fireEvent.change(screen.getByLabelText("Severity"), {
      target: { value: "high" },
    });
    fireEvent.change(screen.getByLabelText("CVE"), {
      target: { value: "CVE-2024-3094" },
    });
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await findingsQuery.queryFn();
    expect(mockListFindings).toHaveBeenLastCalledWith("scan-1", {
      page: 1,
      per_page: 50,
      severity: undefined,
      source: undefined,
      cve_id: undefined,
    });
  });

  it("paginates on the backend's filtered total, not the rows on this page", () => {
    setFindingsResult({ data: { items: [FINDING], total: 137 } });
    render(<SecurityScanDetailPage />);
    expect(screen.getByTestId("dt-total")).toHaveTextContent("137");
  });

  it("renders the finding source, where an external scan's vendor lives", () => {
    render(<SecurityScanDetailPage />);
    expect(screen.getByTestId("cell-source")).toHaveTextContent("acme-scanner");
  });

  it("dashes an in-tree finding that carries no source", () => {
    setFindingsResult({
      data: { items: [{ ...FINDING, source: null }], total: 1 },
    });
    render(<SecurityScanDetailPage />);
    expect(screen.getByTestId("cell-source")).toHaveTextContent("-");
  });

  it("labels the scan type instead of printing it raw", () => {
    render(<SecurityScanDetailPage />);
    expect(screen.getByTestId("scan-type-badge")).toHaveTextContent("External");
  });

  it("shows the backend's message when a filter value is rejected", () => {
    setFindingsResult({
      data: undefined,
      isError: true,
      error: {
        code: "VALIDATION_ERROR",
        message:
          'Invalid severity: \'critcal\'. Allowed values: ["critical", "high", "medium", "low", "info"]',
      },
    });
    render(<SecurityScanDetailPage />);
    const alert = screen.getByTestId("findings-error");
    expect(alert).toHaveTextContent(/Invalid severity: 'critcal'/);
    expect(alert).toHaveTextContent(/Allowed values/);
    // A rejected filter must not read as "no findings match".
    expect(screen.queryByTestId("dt-row")).toBeNull();
    expect(screen.getByTestId("dt-total")).toHaveTextContent("0");
  });

  it("tells the user the filters excluded everything when nothing matches", () => {
    setFindingsResult({ data: { items: [], total: 0 } });
    render(<SecurityScanDetailPage />);
    expect(screen.getByText(/No findings for this scan/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Severity"), {
      target: { value: "low" },
    });
    expect(screen.getByText(/No findings match these filters/i)).toBeInTheDocument();
  });
});
