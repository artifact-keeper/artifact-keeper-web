// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    RefreshCw: stub("RefreshCw"),
  };
});

const { mockUseQuery, mockPush, mockList } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockPush: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock("@/lib/api/scan-queue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  scanQueueApi: { list: mockList },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className, title }: any) => (
    <div className={className} title={title}>
      {children}
    </div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
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
import ScanQueuePage from "../page";

const JOB = {
  id: "j1",
  kind: "proxy_file",
  state: "pending",
  priority: 5,
  attempts: 1,
  max_attempts: 3,
  repository_id: "r1",
  target: "alpine/main/x86_64/musl-1.2.5-r0.apk",
  digest: null,
  artifact_id: null,
  last_error: null,
  claimed_by: null,
  created_at: "2026-07-09T10:00:00Z",
  next_attempt_at: "2026-07-09T10:00:00Z",
  claim_expires_at: null,
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

function queryOpts() {
  return mockUseQuery.mock.calls.at(-1)![0];
}

describe("ScanQueuePage", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    loaded({ items: [], depth: [], total: 0 });
  });

  afterEach(cleanup);

  function pollMs(data: unknown = undefined) {
    return queryOpts().refetchInterval({ state: { data } });
  }

  it("polls so the queue does not go stale on screen", () => {
    render(<ScanQueuePage />);
    expect(pollMs()).toBeGreaterThan(0);
  });

  it("stops polling a backend without the endpoint and says so", () => {
    loaded(null);
    render(<ScanQueuePage />);
    expect(pollMs(null)).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(/no scan queue/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the durable queue is off", () => {
    loaded({ enabled: false, items: [], depth: [], total: 0 });
    render(<ScanQueuePage />);
    expect(screen.getByRole("status")).toHaveTextContent(/SCAN_QUEUE_ENABLED/);
  });

  it("shows no notice when the queue is on or the backend predates the flag", () => {
    for (const data of [
      { enabled: true, items: [], depth: [], total: 0 },
      { items: [], depth: [], total: 0 },
    ]) {
      loaded(data);
      render(<ScanQueuePage />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("states the poll interval on the refresh button, matching the real one", () => {
    render(<ScanQueuePage />);
    const secs = pollMs() / 1000;
    expect(screen.getByRole("button", { name: /refresh/i })).toHaveAttribute(
      "title",
      `Refreshes automatically every ${secs}s. Click to refresh now.`,
    );
  });

  it("shows a spinner while loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      refetch: vi.fn(),
      error: null,
    });
    render(<ScanQueuePage />);
    expect(screen.getByTestId("dt-loading")).toBeInTheDocument();
  });

  it("renders a job row with a friendly kind label", () => {
    loaded({ items: [JOB], depth: [], total: 1 });
    render(<ScanQueuePage />);
    // The stub renders each column's cell AND its accessor, so scope to the
    // cell rather than matching the text twice.
    const cell = (id: string) =>
      screen.getByTestId("dt-row-0").querySelector(`[data-column="${id}"]`)!;
    expect(cell("target")).toHaveTextContent(JOB.target);
    expect(cell("kind")).toHaveTextContent("Proxy file");
    expect(cell("attempts")).toHaveTextContent("1/3");
  });

  it("falls back to the artifact id when a job has no target", () => {
    loaded({
      items: [{ ...JOB, target: null, artifact_id: "art-7" }],
      depth: [],
      total: 1,
    });
    render(<ScanQueuePage />);
    // The id is a button that navigates to the artifact page.
    fireEvent.click(screen.getByRole("button", { name: "art-7" }));
    expect(mockPush).toHaveBeenCalledWith("/artifacts/art-7");
  });

  it("shows the last error of a failed job", () => {
    loaded({
      items: [{ ...JOB, state: "failed", last_error: "scanner timed out" }],
      depth: [],
      total: 1,
    });
    render(<ScanQueuePage />);
    expect(
      screen
        .getByTestId("dt-row-0")
        .querySelector('[data-column="last_error"]'),
    ).toHaveTextContent("scanner timed out");
  });

  /** The value rendered next to a tile label, scoped to the depth row so a
   * worker hostname in the table cannot be mistaken for a tile. */
  function tile(label: string) {
    return within(screen.getByTestId("queue-depth")).getByText(label)
      .parentElement!.textContent;
  }

  it("sums each state across kinds and shows the oldest pending age", () => {
    loaded({
      items: [],
      depth: [
        {
          kind: "proxy_file",
          state: "pending",
          jobs: 4,
          oldest_pending_secs: 125,
        },
        { kind: "hosted_artifact", state: "pending", jobs: 3 },
        { kind: "proxy_file", state: "running", jobs: 2 },
      ],
      total: 0,
    });
    render(<ScanQueuePage />);
    expect(tile("pending")).toContain("7");
    expect(tile("running")).toContain("2");
    expect(tile("failed")).toContain("0");
    expect(tile("Oldest pending")).toContain("2m");
  });

  it("keeps every tile in place at zero, so the row cannot shift", () => {
    loaded({ items: [], depth: [], total: 0 });
    render(<ScanQueuePage />);
    for (const label of ["pending", "running", "failed"]) {
      expect(tile(label)).toContain("0");
    }
    // No pending work means no age to report, but the tile stays.
    expect(tile("Oldest pending")).toContain("-");
  });

  it("renders the tiles before the first response arrives", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      refetch: vi.fn(),
      error: null,
    });
    render(<ScanQueuePage />);
    expect(screen.getByText("Oldest pending")).toBeInTheDocument();
  });

  it("says the queue is empty", () => {
    render(<ScanQueuePage />);
    expect(screen.getByTestId("dt-empty")).toHaveTextContent(
      /the queue is empty/i,
    );
  });

  it("surfaces a query error", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new Error("nope"),
    });
    render(<ScanQueuePage />);
    expect(screen.getByText("nope")).toBeInTheDocument();
  });

  it("filters by state and clears on the all-option", () => {
    render(<ScanQueuePage />);
    const sel = screen.getByLabelText("State filter");
    fireEvent.change(sel, { target: { value: "failed" } });
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ state: "failed" });
    fireEvent.change(sel, { target: { value: "__all__" } });
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ state: undefined });
  });

  it("puts State on the left and Kind on the right", () => {
    render(<ScanQueuePage />);
    const names = screen
      .getAllByRole("combobox")
      .map((n) => n.getAttribute("aria-label"));
    expect(names).toEqual(["State filter", "Kind filter"]);
  });

  it("changes rows per page and refetches from page one", () => {
    loaded({ items: [JOB], depth: [], total: 300 });
    render(<ScanQueuePage />);
    expect(screen.getByTestId("dt-pagesize")).toHaveTextContent("50");

    fireEvent.click(screen.getByTestId("dt-next"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 2 });

    fireEvent.click(screen.getByTestId("dt-size-100"));
    // The size must reach the request, and paging resets so page 2 of the old
    // size cannot be requested against the new one.
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      perPage: 100,
      page: 1,
    });
    expect(screen.getByTestId("dt-pagesize")).toHaveTextContent("100");
  });

  it("shows the worker hostname, not the full identity", () => {
    loaded({
      items: [
        {
          ...JOB,
          state: "running",
          claimed_by: "artifact-keeper-scan-worker-8485f8dbf4-xqwjs:1:a49498f6",
        },
      ],
      depth: [],
      total: 1,
    });
    render(<ScanQueuePage />);
    const cell = screen
      .getByTestId("dt-row-0")
      .querySelector('[data-column="worker"]')!;
    expect(cell).toHaveTextContent(
      "artifact-keeper-scan-worker-8485f8dbf4-xqwjs",
    );
    expect(cell.textContent).not.toContain(":1:");
    // The full identity is still reachable on hover.
    expect(cell.querySelector("code")).toHaveAttribute(
      "title",
      "artifact-keeper-scan-worker-8485f8dbf4-xqwjs:1:a49498f6",
    );
  });

  it("orders the tiles running, pending, failed, then oldest pending", () => {
    loaded({ items: [], depth: [], total: 0 });
    render(<ScanQueuePage />);
    const labels = within(screen.getByTestId("queue-depth"))
      .getAllByText(/^(running|pending|failed|Oldest pending)$/)
      .map((n) => n.textContent);
    expect(labels).toEqual(["running", "pending", "failed", "Oldest pending"]);
  });

  /** The tile card element for a label, for asserting on its border tone. */
  function tileCard(label: string) {
    return within(screen.getByTestId("queue-depth")).getByText(label)
      .parentElement!.parentElement!;
  }

  it("tints a tile only when it is non-zero", () => {
    loaded({
      items: [],
      depth: [
        { kind: "proxy_file", state: "failed", jobs: 2 },
        { kind: "proxy_file", state: "pending", jobs: 0 },
      ],
      total: 2,
    });
    render(<ScanQueuePage />);
    // Failures exist, so the red border is meaningful.
    expect(tileCard("failed").className).toContain("border-red");
    // Nothing pending, so no amber shouting at an empty queue.
    expect(tileCard("pending").className ?? "").not.toContain("border-amber");
  });

  it("tints running blue when work is in flight", () => {
    loaded({
      items: [],
      depth: [{ kind: "proxy_file", state: "running", jobs: 3 }],
      total: 3,
    });
    render(<ScanQueuePage />);
    expect(tileCard("running").className).toContain("border-blue");
  });

  it("filters by kind", () => {
    render(<ScanQueuePage />);
    fireEvent.change(screen.getByLabelText("Kind filter"), {
      target: { value: "hosted_artifact" },
    });
    expect(queryOpts().queryKey.at(-1)).toMatchObject({
      kind: "hosted_artifact",
    });
  });

  it("resets to page one when a filter changes", () => {
    loaded({ items: [JOB], depth: [], total: 120 });
    render(<ScanQueuePage />);
    fireEvent.click(screen.getByTestId("dt-next"));
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 2 });
    fireEvent.change(screen.getByLabelText("State filter"), {
      target: { value: "running" },
    });
    expect(queryOpts().queryKey.at(-1)).toMatchObject({ page: 1 });
  });

  it("names the page in the document title", () => {
    render(<ScanQueuePage />);
    expect(document.title).toContain("Scan Queue");
  });

  it("asks the API for exactly the filters the toolbar shows", async () => {
    mockList.mockResolvedValue({ items: [], depth: [], total: 0 });
    render(<ScanQueuePage />);
    fireEvent.change(screen.getByLabelText("Kind filter"), {
      target: { value: "hosted_artifact" },
    });
    await queryOpts().queryFn();
    expect(mockList).toHaveBeenCalledWith({
      state: undefined,
      kind: "hosted_artifact",
      page: 1,
      perPage: 50,
    });
  });

  it("ages a queued job rather than printing a wall-clock stamp", () => {
    loaded({ items: [JOB], depth: [], total: 1 });
    render(<ScanQueuePage />);
    const cell = screen
      .getByTestId("dt-row-0")
      .querySelector('[data-column="queued"]')!;
    // Relative on screen, absolute on hover.
    const rendered = cell.querySelector("[title]")!;
    expect(rendered.textContent).not.toContain("2026");
    expect(rendered).toHaveAttribute(
      "title",
      new Date(JOB.created_at).toLocaleString(),
    );
  });

  it("refetches on demand and locks the button while in flight", () => {
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue({
      data: { items: [], depth: [], total: 0 },
      isLoading: false,
      isFetching: false,
      refetch,
      error: null,
    });
    render(<ScanQueuePage />);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(refetch).toHaveBeenCalled();

    cleanup();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: true,
      refetch,
      error: null,
    });
    render(<ScanQueuePage />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("offers only the kinds a producer can enqueue", () => {
    render(<ScanQueuePage />);
    const values = Array.from(
      screen.getByLabelText("Kind filter").querySelectorAll("option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["__all__", "proxy_file", "hosted_artifact"]);
  });

  it("renders a kind the web does not model rather than blanking the cell", () => {
    loaded({
      items: [{ ...JOB, kind: "sbom_refresh" }],
      depth: [],
      total: 1,
    });
    render(<ScanQueuePage />);
    expect(
      screen.getByTestId("dt-row-0").querySelector('[data-column="kind"]'),
    ).toHaveTextContent("sbom_refresh");
  });

  it("unwraps the backend message out of an error envelope", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
      error: new ApiError(400, '{"code":"BAD","message":"unknown kind"}'),
    });
    render(<ScanQueuePage />);
    expect(screen.getByRole("alert")).toHaveTextContent("unknown kind");
  });

  it.each([
    [30, "30s"],
    [125, "2m"],
    [7200, "2h"],
  ])("reads an age of %is as %s", (secs, label) => {
    loaded({
      items: [],
      depth: [
        {
          kind: "proxy_file",
          state: "pending",
          jobs: 1,
          oldest_pending_secs: secs,
        },
      ],
      total: 0,
    });
    render(<ScanQueuePage />);
    expect(tile("Oldest pending")).toContain(label);
  });
});
