// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

const {
  mockUseQuery,
  mockUseMutation,
  mockRouterPush,
  mockListScans,
  mockUseRepositories,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockRouterPush: vi.fn(),
  mockListScans: vi.fn(),
  mockUseRepositories: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/sdk-client", () => ({}));
vi.mock("@artifact-keeper/sdk", () => ({ listScanConfigs: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/security", () => ({
  securityApi: { listScans: mockListScans, triggerScan: vi.fn() },
}));
vi.mock("@/lib/api/artifacts", () => ({ artifactsApi: { list: vi.fn() } }));
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: (...args: unknown[]) => mockUseRepositories(...args),
}));

// lucide-react is left real: these icons render as plain SVG in jsdom and
// nothing here asserts on them.

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div role="alert">{children}</div>,
  AlertTitle: ({ children }: any) => <strong>{children}</strong>,
  AlertDescription: ({ children }: any) => <p>{children}</p>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

// Radix's Select is unusable in jsdom: swap in a native <select> that collects
// its SelectItem values and takes the aria-label off the trigger.
vi.mock("@/components/ui/select", () => {
  const collect = (node: React.ReactNode, out: string[]) => {
    React.Children.forEach(node, (child: any) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as any;
      if (typeof props?.value === "string" && props?.children !== undefined) {
        out.push(String(props.value));
      }
      if (props?.children) collect(props.children, out);
    });
  };
  return {
    Select: ({ children, value, onValueChange }: any) => {
      const options: string[] = [];
      collect(children, options);
      let label: string | undefined;
      const findLabel = (node: React.ReactNode) => {
        React.Children.forEach(node, (child: any) => {
          if (!React.isValidElement(child)) return;
          const props = child.props as any;
          if (props?.["aria-label"]) label = props["aria-label"];
          if (props?.children) findLabel(props.children);
        });
      };
      findLabel(children);
      return (
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {options.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
    },
    SelectTrigger: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <span data-value={value}>{children}</span>,
  };
});

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, actions }: any) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

// Calls both cell() and accessor() per row, the way the real table does.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ columns, data, total, emptyMessage, rowKey, onRowClick }: any) => (
    <table data-testid="scans-table" data-total={String(total)}>
      <tbody>
        {data.length === 0 && (
          <tr>
            <td data-testid="empty">{emptyMessage}</td>
          </tr>
        )}
        {data.map((row: any, i: number) => (
          <tr
            key={rowKey ? rowKey(row) : i}
            data-testid={`row-${row.id}`}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map((col: any) => (
              <td key={col.id}>
                {col.cell ? col.cell(row) : null}
                {col.accessor && (
                  <span data-testid={`accessor-${col.id}-${row.id}`}>
                    {String(col.accessor(row))}
                  </span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import SecurityScansPage from "../page";

function scan(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    artifact_id: "a1",
    artifact_name: "lib.jar",
    artifact_version: "1.0",
    repository_id: "r1",
    scan_type: "grype",
    status: "completed",
    findings_count: 3,
    critical_count: 1,
    high_count: 1,
    medium_count: 1,
    low_count: 0,
    info_count: 0,
    scanner_version: "0.1",
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

let lastStatusSent: string | undefined;

function setup(items: unknown[], total = items.length, isError = false) {
  lastStatusSent = undefined;
  mockUseQuery.mockImplementation((opts: any) => {
    if (opts.queryKey[1] === "scans") {
      lastStatusSent = opts.queryKey[4];
      return {
        data: { items, total },
        isLoading: false,
        isFetching: false,
        isError,
        error: isError ? new Error("bad status") : null,
      };
    }
    return { data: undefined, isLoading: false };
  });
}

describe("SecurityScansPage not_applicable rows", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseRepositories.mockReturnValue({ data: { items: [] } });
    mockRouterPush.mockReset();
  });
  afterEach(cleanup);

  it("hides not_applicable rows on the default view", () => {
    setup([scan({ id: "real" }), scan({ id: "na", status: "not_applicable" })]);
    render(<SecurityScansPage />);
    expect(screen.getByTestId("row-real")).toBeInTheDocument();
    expect(screen.queryByTestId("row-na")).toBeNull();
  });

  it("says how many rows it hid, because the total still counts them", () => {
    setup(
      [scan({ id: "real" }), scan({ id: "na", status: "not_applicable" })],
      137,
    );
    render(<SecurityScansPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /1 not-applicable scan is hidden/i,
    );
    expect(screen.getByTestId("scans-table")).toHaveAttribute("data-total", "137");
  });

  it("pluralises the notice", () => {
    setup([
      scan({ id: "na1", status: "not_applicable" }),
      scan({ id: "na2", status: "not_applicable" }),
    ]);
    render(<SecurityScansPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /2 not-applicable scans are hidden/i,
    );
  });

  it("stays quiet when there is nothing to hide", () => {
    setup([scan({ id: "real" })]);
    render(<SecurityScansPage />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists them, and drops the notice, when that status is selected", () => {
    setup([scan({ id: "na", status: "not_applicable" })]);
    render(<SecurityScansPage />);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "not_applicable" },
    });
    expect(screen.getByTestId("row-na")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks the backend for the status it was given", () => {
    setup([]);
    render(<SecurityScansPage />);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "not_applicable" },
    });
    expect(lastStatusSent).toBe("not_applicable");
  });

  it("offers Not applicable in the status filter", () => {
    setup([]);
    render(<SecurityScansPage />);
    expect(
      screen.getByRole("option", { name: "not_applicable" }),
    ).toBeInTheDocument();
  });

  it("shows no notice and no rows when the listing failed", () => {
    setup([scan({ id: "na", status: "not_applicable" })], 1, true);
    render(<SecurityScansPage />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
