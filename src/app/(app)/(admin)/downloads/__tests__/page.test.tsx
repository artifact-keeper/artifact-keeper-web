// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    Network: stub("Network"),
  };
});

const {
  mockUseAuth,
  mockUseQuery,
  mockInvalidateQueries,
  mockList,
  mockListByIp,
  mockListByUser,
  tabsState,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockList: vi.fn(),
  mockListByIp: vi.fn(),
  mockListByUser: vi.fn(),
  tabsState: { onValueChange: undefined as ((v: string) => void) | undefined },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/sdk-client", () => ({}));

vi.mock("@/lib/api/downloads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/downloads")>();
  return {
    ...actual,
    downloadsApi: {
      list: (...args: any[]) => mockList(...args),
      listByIp: (...args: any[]) => mockListByIp(...args),
      listByUser: (...args: any[]) => mockListByUser(...args),
    },
  };
});

vi.mock("@/lib/api/audit", () => ({
  isValidUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim()
    ),
}));

// UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  AlertTitle: ({ children }: any) => <span>{children}</span>,
  AlertDescription: ({ children }: any) => <span>{children}</span>,
}));

// Minimal Tabs stand-in: TabsTrigger buttons forward their value through the
// captured onValueChange so tests can switch views like a user would.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => {
    tabsState.onValueChange = onValueChange;
    return (
      <div data-testid="tabs" data-value={value}>
        {children}
      </div>
    );
  },
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button onClick={() => tabsState.onValueChange?.(value)}>{children}</button>
  ),
}));

// Lightweight DataTable stand-in that still exercises the column cell
// renderers and accessors, row keys, the empty message, the loading flag,
// and the pagination callbacks the page passes in.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    columns,
    data,
    loading,
    emptyMessage,
    rowKey,
    onPageChange,
    onPageSizeChange,
  }: any) => {
    if (loading) return <div data-testid="data-table-loading" />;
    if (!data.length)
      return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <div>
        <table data-testid="data-table">
          <tbody>
            {data.map((row: any, i: number) => (
              <tr key={rowKey ? rowKey(row) : i}>
                {columns.map((c: any) => {
                  c.accessor?.(row); // real DataTable uses accessors for sorting
                  return (
                    <td key={c.id}>
                      {c.cell ? c.cell(row) : String(c.accessor?.(row) ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {onPageChange && (
          <button onClick={() => onPageChange(2)}>next-page</button>
        )}
        {onPageSizeChange && (
          <button onClick={() => onPageSizeChange(100)}>set-page-size</button>
        )}
      </div>
    );
  },
}));

import DownloadsPage, { dateBoundsToIso, fetchDownloads } from "../page";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ADMIN = { id: "admin-id", username: "admin", is_admin: true };
const USER_ID = "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b";
const ARTIFACT_ID = "0d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b";

const EVENT = {
  artifact_id: ARTIFACT_ID,
  user_id: USER_ID,
  username: "alice",
  ip_address: "10.1.2.3",
  user_agent: "npm/10.2.4 node/v20.11.0 linux x64",
  downloaded_at: "2026-07-10T12:00:00Z",
};

function page(downloads: any[], total = downloads.length) {
  return { downloads, total, page: 1, per_page: 20 };
}

const IDLE = { isLoading: false, isError: false, isFetching: false };

/** Route the two useQuery calls (events / grouped sample) by query key. */
function queryState({
  events = { data: undefined, ...IDLE },
  sample = { data: undefined, ...IDLE },
}: {
  events?: any;
  sample?: any;
} = {}) {
  mockUseQuery.mockImplementation((opts: any) => {
    if (opts.queryKey?.[0] === "admin-downloads") {
      return opts.queryKey?.[1] === "sample" ? sample : events;
    }
    throw new Error(`Unexpected query key: ${JSON.stringify(opts.queryKey)}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: ADMIN });
  mockList.mockResolvedValue(page([]));
  mockListByIp.mockResolvedValue(page([]));
  mockListByUser.mockResolvedValue(page([]));
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DownloadsPage", () => {
  it("denies access to non-admins", () => {
    mockUseAuth.mockReturnValue({ user: { ...ADMIN, is_admin: false } });
    queryState();

    render(<DownloadsPage />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText(/apply filters/i)).not.toBeInTheDocument();
  });

  it("renders attributed download events", () => {
    queryState({ events: { data: page([EVENT]), ...IDLE } });

    render(<DownloadsPage />);

    expect(
      screen.getByRole("heading", { name: /downloads/i })
    ).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("10.1.2.3")).toBeInTheDocument();
    // Artifact id renders truncated with the full id as a tooltip.
    expect(screen.getByTitle(ARTIFACT_ID)).toBeInTheDocument();
    expect(screen.getByText(/npm\/10\.2\.4/)).toBeInTheDocument();
  });

  it("shows 'anonymous' for unauthenticated downloads and a truncated id for unknown users", () => {
    queryState({
      events: {
        data: page([
          { ...EVENT, user_id: null, username: null, ip_address: "10.0.0.9" },
          { ...EVENT, username: null, downloaded_at: "2026-07-10T13:00:00Z" },
        ]),
        ...IDLE,
      },
    });

    render(<DownloadsPage />);

    expect(screen.getByText("anonymous")).toBeInTheDocument();
    // Known user id but no username: truncated id with a tooltip.
    expect(screen.getByTitle(USER_ID)).toBeInTheDocument();
  });

  it("shows the empty state when there are no downloads", () => {
    queryState({ events: { data: page([]), ...IDLE } });

    render(<DownloadsPage />);

    expect(screen.getByText(/no downloads recorded/i)).toBeInTheDocument();
  });

  it("shows an error alert when the query fails", () => {
    queryState({ events: { data: undefined, ...IDLE, isError: true } });

    render(<DownloadsPage />);

    expect(
      screen.getByText(/download attribution unavailable/i)
    ).toBeInTheDocument();
  });

  it("rejects malformed artifact-id and user-id filters client-side", () => {
    queryState({ events: { data: page([]), ...IDLE } });

    render(<DownloadsPage />);

    fireEvent.change(screen.getByLabelText(/artifact id/i), {
      target: { value: "not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /artifact id must be a uuid/i
    );

    fireEvent.change(screen.getByLabelText(/artifact id/i), {
      target: { value: ARTIFACT_ID },
    });
    fireEvent.change(screen.getByLabelText(/user id/i), {
      target: { value: "also-not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /user id must be a uuid/i
    );

    // Fixing the value clears the error on the next apply.
    fireEvent.change(screen.getByLabelText(/user id/i), {
      target: { value: USER_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("applies filters on Enter and clears them via Clear filters", () => {
    queryState({ events: { data: page([]), ...IDLE } });

    render(<DownloadsPage />);

    fireEvent.change(screen.getByLabelText(/client ip/i), {
      target: { value: "10.1.2.3" },
    });
    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText(/^to$/i), {
      target: { value: "2026-07-02" },
    });
    fireEvent.keyDown(screen.getByLabelText(/client ip/i), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText(/artifact id/i), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText(/user id/i), { key: "Enter" });

    // Applied filters reveal the clear affordance; clicking it resets state.
    const clear = screen.getByRole("button", { name: /clear filters/i });
    fireEvent.click(clear);
    expect(
      screen.queryByRole("button", { name: /clear filters/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/client ip/i)).toHaveValue("");
  });

  it("invalidates the downloads query on refresh and forwards pagination callbacks", () => {
    queryState({ events: { data: page([EVENT], 300), ...IDLE } });

    render(<DownloadsPage />);

    fireEvent.click(screen.getByRole("button", { name: /refresh downloads/i }));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin-downloads"],
    });

    // The DataTable stub forwards onPageChange / onPageSizeChange; the page
    // must not crash and keeps rendering after both.
    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    fireEvent.click(screen.getByRole("button", { name: "set-page-size" }));
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("runs the events queryFn with the applied filters", async () => {
    queryState({ events: { data: page([]), ...IDLE } });

    render(<DownloadsPage />);

    fireEvent.change(screen.getByLabelText(/artifact id/i), {
      target: { value: ARTIFACT_ID },
    });
    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    const eventOpts = mockUseQuery.mock.calls
      .map(([o]) => o)
      .filter(
        (o) => o.queryKey?.[0] === "admin-downloads" && o.queryKey?.[1] !== "sample"
      )
      .at(-1);
    await eventOpts.queryFn();
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        per_page: 20,
        artifact_id: ARTIFACT_ID,
        ip: undefined,
        user_id: undefined,
        from: new Date("2026-07-01T00:00:00").toISOString(),
        to: undefined,
      })
    );
    expect(eventOpts.placeholderData("previous")).toBe("previous");
  });

  it("switches to the by-IP topology view and groups events by IP/subnet", () => {
    queryState({
      sample: {
        data: page(
          [
            EVENT,
            { ...EVENT, artifact_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b" },
            { ...EVENT, ip_address: "10.9.9.9", user_id: null, username: null },
          ],
          500
        ),
        ...IDLE,
      },
    });

    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: /by ip \/ subnet/i }));

    // Grouped rows: busiest IP first with its /24 subnet badge.
    expect(screen.getByText("10.1.2.3")).toBeInTheDocument();
    expect(screen.getByText("10.1.2.0/24")).toBeInTheDocument();
    expect(screen.getByText("10.9.9.9")).toBeInTheDocument();
    expect(screen.getByText("10.9.9.0/24")).toBeInTheDocument();
    // The sample is a truncated slice of the matching events (3 of 500).
    expect(screen.getByText(/3 most recent of 500 matching/i)).toBeInTheDocument();
  });

  it("switches to the by-user view and drills down into one user's events", () => {
    queryState({
      events: { data: page([EVENT]), ...IDLE },
      sample: {
        data: page([
          EVENT,
          { ...EVENT, ip_address: "10.9.9.9" },
          { ...EVENT, user_id: null, username: null },
        ]),
        ...IDLE,
      },
    });

    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: /by user/i }));

    // alice (2 downloads, 2 IPs) and the pooled anonymous bucket.
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("anonymous")).toBeInTheDocument();

    // Drilling into alice returns to the events view with her id applied.
    fireEvent.click(
      screen.getByRole("button", { name: /view downloads by alice/i })
    );
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "events");
    expect(screen.getByLabelText(/user id/i)).toHaveValue(USER_ID);
  });

  it("drills down from an IP group into the filtered events view", () => {
    queryState({
      events: { data: page([EVENT]), ...IDLE },
      sample: { data: page([EVENT]), ...IDLE },
    });

    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: /by ip \/ subnet/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /view downloads from 10\.1\.2\.3/i })
    );

    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "events");
    expect(screen.getByLabelText(/client ip/i)).toHaveValue("10.1.2.3");
  });

  it("shows the grouped-view error alert when the sample query fails", () => {
    queryState({ sample: { data: undefined, ...IDLE, isError: true } });

    render(<DownloadsPage />);
    fireEvent.click(screen.getByRole("button", { name: /by ip \/ subnet/i }));

    expect(
      screen.getByText(/download attribution unavailable/i)
    ).toBeInTheDocument();
  });
});

describe("fetchDownloads endpoint routing", () => {
  const FILTERS = {
    artifact_id: "",
    user_id: "",
    ip: "",
    from: "",
    to: "",
  };

  beforeEach(() => vi.clearAllMocks());

  it("uses the general listing when no ip/user filter is set", async () => {
    mockList.mockResolvedValue(page([]));
    await fetchDownloads(FILTERS, 2, 50);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, per_page: 50 })
    );
    expect(mockListByIp).not.toHaveBeenCalled();
    expect(mockListByUser).not.toHaveBeenCalled();
  });

  it("routes an exclusive IP filter through the by-ip endpoint", async () => {
    mockListByIp.mockResolvedValue(page([]));
    await fetchDownloads({ ...FILTERS, ip: "10.1.2.3" }, 1, 20);
    expect(mockListByIp).toHaveBeenCalledWith(
      "10.1.2.3",
      expect.objectContaining({ page: 1, per_page: 20 })
    );
    expect(mockList).not.toHaveBeenCalled();
  });

  it("routes an exclusive user filter through the by-user endpoint", async () => {
    mockListByUser.mockResolvedValue(page([]));
    await fetchDownloads({ ...FILTERS, user_id: USER_ID }, 1, 20);
    expect(mockListByUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ page: 1, per_page: 20 })
    );
    expect(mockList).not.toHaveBeenCalled();
  });

  it("combines ip + user filters on the general listing", async () => {
    mockList.mockResolvedValue(page([]));
    await fetchDownloads(
      { ...FILTERS, ip: "10.1.2.3", user_id: USER_ID },
      1,
      20
    );
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "10.1.2.3", user_id: USER_ID })
    );
    expect(mockListByIp).not.toHaveBeenCalled();
    expect(mockListByUser).not.toHaveBeenCalled();
  });
});

describe("dateBoundsToIso", () => {
  it("maps a picked day to inclusive start/end instants", () => {
    const { from, to } = dateBoundsToIso({ from: "2026-07-01", to: "2026-07-02" });
    expect(from).toBe(new Date("2026-07-01T00:00:00").toISOString());
    expect(to).toBe(new Date("2026-07-02T23:59:59.999").toISOString());
    expect(new Date(to!).getTime()).toBeGreaterThan(new Date(from!).getTime());
  });

  it("omits unset bounds", () => {
    expect(dateBoundsToIso({ from: "", to: "" })).toEqual({
      from: undefined,
      to: undefined,
    });
  });
});
