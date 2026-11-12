// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    ExternalLink: stub("ExternalLink"),
    Loader2: stub("Loader2"),
    Package: stub("Package"),
    RefreshCw: stub("RefreshCw"),
    X: stub("X"),
  };
});

const { mockUseQuery, mockReplace, mockPush, mockList, searchParamsState } =
  vi.hoisted(() => ({
    mockUseQuery: vi.fn(),
    mockReplace: vi.fn(),
    mockPush: vi.fn(),
    mockList: vi.fn(),
    searchParamsState: { value: "" },
  }));

vi.mock("@/lib/api/cve-findings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cveFindingsApi: { list: mockList },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
}));

vi.mock("@/lib/sdk-client", () => ({}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, title }: any) => (
    <span data-testid="badge" title={title}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    columns,
    data,
    loading,
    emptyMessage,
    rowKey,
    onRowClick,
    total,
    page,
    onPageChange,
    onPageSizeChange,
    pageSize,
  }: any) => {
    if (loading) return <div data-testid="dt-loading" />;
    if (!data.length) return <div data-testid="dt-empty">{emptyMessage}</div>;
    return (
      <div>
        <span data-testid="dt-total">{String(total)}</span>
        <button data-testid="dt-next" onClick={() => onPageChange?.(page + 1)}>
          next
        </button>
        <span data-testid="dt-pagesize">{String(pageSize)}</span>
        <button
          data-testid="dt-size-100"
          onClick={() => onPageSizeChange?.(100)}
        >
          100 per page
        </button>
        <table>
          <thead>
            <tr>
              {columns.map((c: any) => (
                <th key={c.id}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, i: number) => (
              <tr
                key={rowKey ? rowKey(row) : i}
                data-testid={`dt-row-${i}`}
                onClick={() => onRowClick?.(row)}
                // Mirrors the real DataTable's row: Enter/Space open the row
                // and cancel the key's default action.
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {columns.map((c: any) => (
                  <td key={c.id} data-column={c.id}>
                    {c.cell ? c.cell(row) : null}
                    {c.accessor && (
                      <span data-testid={`acc-${c.id}-${i}`}>
                        {String(c.accessor(row))}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
}));

// FilterSelect renders a Radix Select, so drive it as a native one keyed by
// its accessible name.
vi.mock("@/components/common/filter-select", () => ({
  FILTER_ALL: "__all__",
  FilterSelect: ({
    label,
    options,
    active,
    onSelect,
    labels,
    disabled,
  }: any) => (
    <select
      aria-label={`${label} filter`}
      value={active ?? "__all__"}
      disabled={disabled}
      onChange={(e) =>
        onSelect(e.target.value === "__all__" ? undefined : e.target.value)
      }
    >
      <option value="__all__">{`All ${label}`}</option>
      {options.map((o: string) => (
        <option key={o} value={o}>
          {/* Mirror the real component, which sentence-cases raw values. */}
          {labels?.[o] ??
            o.replace(/_/g, " ").replace(/^./, (c: string) => c.toUpperCase())}
        </option>
      ))}
    </select>
  ),
}));

import { ApiError } from "@/lib/api/fetch";
import FindingsPage from "../page";

const REPO_ID = "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b";

const FINDING = {
  artifact_id: "a1",
  artifact_path: "libs-release/log4j-core-2.14.1.jar",
  repository_id: "r1",
  cve_id: "CVE-2021-44228",
  severity: "critical",
  is_acknowledged: false,
  title: "Log4Shell",
  affected_component: "org.apache.logging.log4j:log4j-core",
  fixed_version: "2.15.0",
  first_detected_at: "2026-07-09T10:00:00Z",
};

const ARTIFACT = {
  artifact_id: "a1",
  artifact_path: FINDING.artifact_path,
  repository_id: "r1",
  critical: 1,
  high: 2,
  medium: 0,
  low: 0,
  total: 3,
};

function loaded(data: any) {
  mockUseQuery.mockReturnValue({
    data,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
    error: null,
  });
}

/** The options object the page handed useQuery on the last render. */
function queryOpts() {
  return mockUseQuery.mock.calls.at(-1)![0];
}

describe("FindingsPage", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
    searchParamsState.value = "";
    loaded({ items: [], artifacts: [], total: 0 });
  });

  afterEach(cleanup);

  it("shows a spinner while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      refetch: vi.fn(),
      error: null,
    });
    render(<FindingsPage />);
    expect(screen.getByTestId("dt-loading")).toBeInTheDocument();
  });

  it("reads severity and state out of the URL", () => {
    searchParamsState.value = "severity=high&state=acknowledged";
    render(<FindingsPage />);
    const call = queryOpts();
    expect(call.queryKey.at(-1)).toMatchObject({
      severity: "high",
      state: "acknowledged",
    });
  });

  it("ignores a severity the backend would reject", () => {
    searchParamsState.value = "severity=catastrophic";
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ severity: undefined });
  });

  it("ignores state=fixed, which this endpoint cannot list", () => {
    searchParamsState.value = "state=fixed";
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ state: undefined });
  });

  it("scopes to the repository the dashboard pill passed", () => {
    searchParamsState.value = `severity=medium&repository_id=${REPO_ID}`;
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      repositoryId: REPO_ID,
    });
  });

  it("renders a finding row and opens its blast radius on row click", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    const cell = (id: string) =>
      screen.getByTestId("dt-row-0").querySelector(`[data-column="${id}"]`)!;
    expect(cell("cve")).toHaveTextContent("CVE-2021-44228");
    expect(cell("artifact")).toHaveTextContent(FINDING.artifact_path);
    expect(cell("state")).toHaveTextContent("Open");

    fireEvent.click(screen.getByTestId("dt-row-0"));
    expect(mockPush).toHaveBeenCalledWith(
      "/security/blast-radius?cve=CVE-2021-44228",
    );
  });

  it("goes to the artifact page from the artifact cell", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: FINDING.artifact_path }),
    );
    expect(mockPush).toHaveBeenCalledWith(`/artifacts/${FINDING.artifact_id}`);
    // The row click must not also fire, or we would navigate twice.
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("leaves Enter on the artifact cell to the cell, not the row", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    const button = screen.getByRole("button", { name: FINDING.artifact_path });
    // Unhandled, the row would preventDefault the key, cancelling the
    // button's own activation, and open the blast radius instead.
    const notCancelled = fireEvent.keyDown(button, { key: "Enter" });
    expect(notCancelled).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("leaves Enter on the advisory link to the link, not the row", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    const link = screen.getByRole("link", { name: FINDING.cve_id });
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("still opens the blast radius with Enter on the row itself", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    fireEvent.keyDown(screen.getByTestId("dt-row-0"), { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith(
      "/security/blast-radius?cve=CVE-2021-44228",
    );
  });

  it("does not filter the grouped view by a severity it shows as all", async () => {
    searchParamsState.value = "group_by=artifact&severity=critical";
    mockList.mockResolvedValue({ items: [], artifacts: [], total: 0 });
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      severity: undefined,
      byArtifact: true,
    });
    await queryOpts().queryFn();
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ severity: undefined, groupBy: "artifact" }),
    );
  });

  it("labels an acknowledged finding", () => {
    loaded({
      items: [{ ...FINDING, is_acknowledged: true }],
      artifacts: [],
      total: 1,
    });
    render(<FindingsPage />);
    expect(
      screen.getByTestId("dt-row-0").querySelector('[data-column="state"]'),
    ).toHaveTextContent("Acknowledged");
  });

  it("shows repository, versions, advisory link and who acknowledged it", () => {
    loaded({
      items: [
        {
          ...FINDING,
          is_acknowledged: true,
          repository_key: "libs-release",
          affected_version: "2.14.1",
          acknowledged_by: "alice",
          acknowledged_reason: "not reachable",
          acknowledgement_expires_at: "2027-01-01T00:00:00Z",
        },
      ],
      artifacts: [],
      total: 1,
    });
    render(<FindingsPage />);
    const cell = (id: string) =>
      screen.getByTestId("dt-row-0").querySelector(`[data-column="${id}"]`)!;
    expect(cell("repository")).toHaveTextContent("libs-release");
    expect(cell("fixed_in")).toHaveTextContent("2.14.1 → 2.15.0");
    expect(cell("cve")).toHaveTextContent("Log4Shell");
    // The advisory link is derived from the id, not from a URL the API sent.
    expect(
      screen.getByRole("link", { name: "CVE-2021-44228" }),
    ).toHaveAttribute(
      "href",
      "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
    );
    expect(cell("state").querySelector("[title]")).toHaveAttribute(
      "title",
      `by alice, until ${new Date("2027-01-01T00:00:00Z").toLocaleString()}: not reachable`,
    );
  });

  it("renders the by-artifact table when grouped", () => {
    searchParamsState.value = "group_by=artifact";
    loaded({ items: [], artifacts: [ARTIFACT], total: 1 });
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ byArtifact: true });
    expect(
      screen.getByRole("columnheader", { name: "Critical" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dt-row-0"));
    expect(mockPush).toHaveBeenCalledWith(`/artifacts/${ARTIFACT.artifact_id}`);
  });

  it("disables the severity selector in the grouped view but keeps it rendered", () => {
    searchParamsState.value = "group_by=artifact";
    render(<FindingsPage />);
    // Still present, so the toolbar does not reflow when grouping toggles.
    expect(screen.getByLabelText("Severity filter")).toBeDisabled();
    // State stays usable: acknowledged-vs-open is meaningful per artifact.
    expect(screen.getByLabelText("State filter")).not.toBeDisabled();
  });

  it("leaves the severity selector enabled in the ungrouped view", () => {
    render(<FindingsPage />);
    expect(screen.getByLabelText("Severity filter")).not.toBeDisabled();
  });

  it("puts State on the left and Severity on the right", () => {
    render(<FindingsPage />);
    const names = screen
      .getAllByRole("combobox")
      .map((n) => n.getAttribute("aria-label"));
    expect(names).toEqual(["State filter", "Severity filter"]);
  });

  it("drops a stale severity when switching into the grouped view", () => {
    searchParamsState.value = "severity=high";
    render(<FindingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /group by artifact/i }));
    expect(mockReplace).toHaveBeenCalledWith(
      "/security/findings?group_by=artifact",
    );
  });

  it("says so when nothing matches", () => {
    render(<FindingsPage />);
    expect(screen.getByTestId("dt-empty")).toHaveTextContent(
      /nothing matches these filters/i,
    );
  });

  it("surfaces a query error", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new Error("boom"),
    });
    render(<FindingsPage />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("pushes a filter into the URL and clears it on the all-option", () => {
    render(<FindingsPage />);
    fireEvent.change(screen.getByLabelText("Severity filter"), {
      target: { value: "critical" },
    });
    expect(mockReplace).toHaveBeenCalledWith(
      "/security/findings?severity=critical",
    );

    cleanup();
    searchParamsState.value = "severity=critical";
    render(<FindingsPage />);
    fireEvent.change(screen.getByLabelText("Severity filter"), {
      target: { value: "__all__" },
    });
    expect(mockReplace).toHaveBeenLastCalledWith("/security/findings?");
  });

  it("clears the repository scope from the chip", () => {
    searchParamsState.value = `repository_id=${REPO_ID}&severity=low`;
    render(<FindingsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /repository 1f7a12b4/i }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/security/findings?severity=low");
  });

  it("hands the server-side total to the table and pages through it", () => {
    loaded({ items: [FINDING], artifacts: [], total: 120 });
    render(<FindingsPage />);
    expect(screen.getByTestId("dt-total")).toHaveTextContent("120");
    fireEvent.click(screen.getByTestId("dt-next"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 2 });
  });

  it("does not link an id that is not a known advisory format", () => {
    loaded({
      items: [{ ...FINDING, cve_id: "javascript:alert(1)", title: null }],
      artifacts: [],
      total: 1,
    });
    render(<FindingsPage />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("badges the severity", () => {
    loaded({ items: [FINDING], artifacts: [], total: 1 });
    render(<FindingsPage />);
    expect(
      screen.getByTestId("dt-row-0").querySelector('[data-column="severity"]'),
    ).toHaveTextContent("critical");
  });

  it("sorts severity most-severe first", () => {
    loaded({
      items: [FINDING, { ...FINDING, cve_id: "CVE-2000-1", severity: "low" }],
      artifacts: [],
      total: 2,
    });
    render(<FindingsPage />);
    const rank = (i: number) =>
      Number(screen.getByTestId(`acc-severity-${i}`).textContent);
    expect(rank(0)).toBeLessThan(rank(1));
  });

  it("ignores a repository_id that is not a uuid", () => {
    searchParamsState.value = "repository_id=' OR 1=1 --";
    render(<FindingsPage />);
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      repositoryId: undefined,
    });
    expect(screen.queryByRole("button", { name: /repository/i })).toBeNull();
  });

  it("asks the API for exactly the filters the URL carries", async () => {
    searchParamsState.value = `severity=high&state=open&repository_id=${REPO_ID}`;
    mockList.mockResolvedValue({ items: [], artifacts: [], total: 0 });
    render(<FindingsPage />);
    await queryOpts().queryFn();
    expect(mockList).toHaveBeenCalledWith({
      severity: "high",
      state: "open",
      repositoryId: REPO_ID,
      groupBy: undefined,
      page: 1,
      perPage: 50,
    });
  });

  it("names the page in the document title", () => {
    render(<FindingsPage />);
    expect(document.title).toContain("Vulnerabilities");
  });

  it("says which slice of the dashboard it is showing", () => {
    searchParamsState.value = "severity=critical&state=open";
    render(<FindingsPage />);
    expect(screen.getByText(/critical · open\./)).toBeInTheDocument();
  });

  it("refetches on demand and locks the button while in flight", () => {
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue({
      data: { items: [], artifacts: [], total: 0 },
      isLoading: false,
      isFetching: false,
      refetch,
      error: null,
    });
    render(<FindingsPage />);
    const button = screen.getByRole("button", { name: /refresh/i });
    fireEvent.click(button);
    expect(refetch).toHaveBeenCalled();
    expect(button).not.toBeDisabled();

    cleanup();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: true,
      refetch,
      error: null,
    });
    render(<FindingsPage />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("puts the state filter into the URL", () => {
    render(<FindingsPage />);
    fireEvent.change(screen.getByLabelText("State filter"), {
      target: { value: "acknowledged" },
    });
    expect(mockReplace).toHaveBeenCalledWith(
      "/security/findings?state=acknowledged",
    );
  });

  it("changes rows per page and goes back to page one", () => {
    loaded({ items: [FINDING], artifacts: [], total: 300 });
    render(<FindingsPage />);
    fireEvent.click(screen.getByTestId("dt-next"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 2 });
    fireEvent.click(screen.getByTestId("dt-size-100"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      perPage: 100,
      page: 1,
    });
  });

  it("pages the grouped view independently of the flat one", () => {
    searchParamsState.value = "group_by=artifact";
    loaded({ items: [], artifacts: [ARTIFACT], total: 300 });
    render(<FindingsPage />);
    fireEvent.click(screen.getByTestId("dt-next"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 2 });
    fireEvent.click(screen.getByTestId("dt-size-100"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      perPage: 100,
      page: 1,
    });
  });

  it("explains a 403 instead of echoing the raw API error", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new ApiError(403, '{"message":"admin scope required"}'),
    });
    render(<FindingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /unscoped administrator account/i,
    );
  });

  it("says an older backend cannot list findings instead of a raw 404", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new ApiError(404, "Not Found"),
    });
    render(<FindingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /cannot list the vulnerabilities .* Upgrade it/,
    );
  });

  it("unwraps the backend message out of an error envelope", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new ApiError(
        400,
        '{"code":"BAD","message":"state=fixed is derived, not stored"}',
      ),
    });
    render(<FindingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "state=fixed is derived, not stored",
    );
  });
});
