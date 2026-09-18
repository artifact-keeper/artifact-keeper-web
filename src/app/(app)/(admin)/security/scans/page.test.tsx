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
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/sdk-client", () => ({}));
vi.mock("@artifact-keeper/sdk", () => ({ listScanConfigs: vi.fn() }));

const mockListScans = vi.fn();
vi.mock("@/lib/api/security", () => ({
  securityApi: {
    listScans: (...a: unknown[]) => mockListScans(...a),
    triggerScan: vi.fn(),
  },
}));

vi.mock("@/lib/api/artifacts", () => ({ artifactsApi: { list: vi.fn() } }));
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({ data: undefined }),
}));

// Native-select stub so options are in the DOM and selection is deterministic
// (this admin-page directory's convention; Radix Select is finicky in jsdom).
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
      <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
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
                <span key={c.id}>{c.cell ? c.cell(row) : null}</span>
              ))}
            </div>
          );
        })
      )}
    </div>
  ),
}));

import SecurityScansPage from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scan(overrides: Record<string, unknown> = {}) {
  return {
    id: "scan-1",
    artifact_id: "a1",
    artifact_name: "lib.jar",
    artifact_version: "1.0",
    repository_id: "r1",
    scan_type: "external",
    status: "completed",
    findings_count: 2,
    critical_count: 1,
    high_count: 1,
    medium_count: 0,
    low_count: 0,
    info_count: 0,
    scanner_version: "acme-4.2",
    error_message: null,
    started_at: "2026-05-01T00:00:00Z",
    completed_at: "2026-05-01T00:01:00Z",
    created_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

/** Latest options the scan-list `useQuery` was called with. */
let scansQuery: { queryKey: unknown[]; queryFn: () => Promise<unknown> };

function setScansResult(result: Record<string, unknown>) {
  mockUseQuery.mockImplementation(
    (opts: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
      if (opts.queryKey?.[1] === "scans") {
        scansQuery = opts;
        return { isLoading: false, isFetching: false, isError: false, ...result };
      }
      return { data: undefined, isLoading: false, isFetching: false, isError: false };
    },
  );
}

/** The scan-type `<select>`, identified by the option only it renders. */
function scanTypeSelect(): HTMLSelectElement {
  const selects = Array.from(
    document.querySelectorAll<HTMLSelectElement>("select"),
  );
  const found = selects.find((s) =>
    Array.from(s.options).some((o) => o.value === "external"),
  );
  if (!found) throw new Error("scan-type select not found");
  return found;
}

describe("SecurityScansPage scan-type filter (#858)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListScans.mockResolvedValue({ items: [], total: 0 });
    setScansResult({ data: { items: [], total: 0 } });
  });

  it("offers every backend scan type, external included", () => {
    render(<SecurityScansPage />);
    const options = Array.from(scanTypeSelect().options).map((o) => o.value);
    expect(options).toEqual([
      "__all__",
      "dependency",
      "image",
      "license",
      "malware",
      "filesystem",
      "grype",
      "openscap",
      "incus",
      "external",
    ]);
    expect(
      screen.getByRole("option", { name: "External" }),
    ).toBeInTheDocument();
  });

  it("sends no scan_type until one is picked", async () => {
    render(<SecurityScansPage />);
    await scansQuery.queryFn();
    expect(mockListScans).toHaveBeenCalledWith({
      page: 1,
      per_page: 20,
      status: undefined,
      scan_type: undefined,
    });
  });

  it("forwards the picked scan type and keys the cache on it", async () => {
    render(<SecurityScansPage />);
    fireEvent.change(scanTypeSelect(), { target: { value: "external" } });
    expect(scansQuery.queryKey).toEqual([
      "security",
      "scans",
      1,
      20,
      undefined,
      "external",
    ]);
    await scansQuery.queryFn();
    expect(mockListScans).toHaveBeenLastCalledWith({
      page: 1,
      per_page: 20,
      status: undefined,
      scan_type: "external",
    });
  });

  it("never sends the __all__ sentinel back to the backend", async () => {
    render(<SecurityScansPage />);
    fireEvent.change(scanTypeSelect(), { target: { value: "external" } });
    fireEvent.change(scanTypeSelect(), { target: { value: "__all__" } });
    await scansQuery.queryFn();
    expect(mockListScans).toHaveBeenLastCalledWith(
      expect.objectContaining({ scan_type: undefined }),
    );
  });

  it("clears the scan-type filter along with the status filter", () => {
    render(<SecurityScansPage />);
    fireEvent.change(scanTypeSelect(), { target: { value: "grype" } });
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(scanTypeSelect().value).toBe("__all__");
  });

  it("labels an external scan row instead of printing scan_type raw", () => {
    setScansResult({ data: { items: [scan()], total: 1 } });
    render(<SecurityScansPage />);
    const badge = screen.getByTestId("scan-type-badge");
    expect(badge).toHaveTextContent("External");
    expect(badge.title).toContain("acme-4.2");
  });

  it("shows the backend's message when a filter value is rejected", () => {
    setScansResult({
      data: undefined,
      isError: true,
      error: {
        code: "VALIDATION_ERROR",
        message:
          'Invalid scan_type: \'externl\'. Allowed values: ["dependency", "image", "license", "malware", "filesystem", "grype", "openscap", "incus", "external"]',
      },
    });
    render(<SecurityScansPage />);
    const alert = screen.getByTestId("scans-error");
    expect(alert).toHaveTextContent(/Invalid scan_type: 'externl'/);
    expect(alert).toHaveTextContent(/Allowed values/);
    // The table must not imply "no scans from that engine".
    expect(screen.queryByTestId("dt-row")).toBeNull();
  });
});
