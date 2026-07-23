// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

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
    ScrollText: stub("ScrollText"),
    Download: stub("Download"),
    Loader2: stub("Loader2"),
  };
});

const {
  mockUseAuth,
  mockUseQuery,
  mockInvalidateQueries,
  mockAuditList,
  mockAuditExport,
  mockAdminListUsers,
  mockTriggerDownload,
  mockToast,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockAuditList: vi.fn(),
  mockAuditExport: vi.fn(),
  mockAdminListUsers: vi.fn(),
  mockTriggerDownload: vi.fn(),
  mockToast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/sdk-client", () => ({}));

vi.mock("@/lib/api/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit")>();
  return {
    ...actual,
    auditApi: {
      list: (...args: any[]) => mockAuditList(...args),
      export: (...args: any[]) => mockAuditExport(...args),
    },
  };
});

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    listUsers: (...args: any[]) => mockAdminListUsers(...args),
  },
}));

vi.mock("@/lib/download", () => ({
  triggerBrowserDownload: (...args: any[]) => mockTriggerDownload(...args),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

// Minimal dropdown-menu that renders its items inline so the export actions are
// clickable without portals/pointer events.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled }: any) => (
    <button disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
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
    if (!data.length) return <div data-testid="data-table-empty">{emptyMessage}</div>;
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
        <button onClick={() => onPageChange?.(2)}>next-page</button>
        <button onClick={() => onPageSizeChange?.(100)}>set-page-size</button>
      </div>
    );
  },
}));

import AuditLogPage, { dateBoundsToIso } from "../page";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ADMIN = { id: "admin-id", username: "admin", is_admin: true };
const ACTOR_ID = "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b";

const EVENT = {
  id: "0d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b",
  user_id: ACTOR_ID,
  action: "USER_CREATED",
  resource_type: "user",
  resource_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
  details: { username: "alice" },
  ip_address: "10.0.0.1",
  correlation_id: "2a6b01c3-3333-4f2b-9f7d-1c2d3e4f5a6b",
  created_at: "2026-07-10T12:00:00Z",
};

/** Route the two useQuery calls (audit list / admin users) by query key. */
function queryState({
  audit = { data: undefined, isLoading: false, isError: false, isFetching: false },
  users = [] as Array<{ id: string; username: string }>,
} = {}) {
  mockUseQuery.mockImplementation((opts: any) => {
    if (opts.queryKey?.[0] === "admin-audit-log") return audit;
    if (opts.queryKey?.[0] === "admin-users") {
      return { data: users, isLoading: false, isError: false };
    }
    throw new Error(`Unexpected query key: ${JSON.stringify(opts.queryKey)}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: ADMIN });
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditLogPage", () => {
  it("denies access to non-admins", () => {
    mockUseAuth.mockReturnValue({ user: { ...ADMIN, is_admin: false } });
    queryState();

    render(<AuditLogPage />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText(/apply filters/i)).not.toBeInTheDocument();
  });

  it("renders audit events with resolved actor usernames", () => {
    queryState({
      audit: {
        data: { items: [EVENT], total: 1, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
      users: [{ id: ACTOR_ID, username: "alice-admin" }],
    });

    render(<AuditLogPage />);

    expect(
      screen.getByRole("heading", { name: /audit log/i })
    ).toBeInTheDocument();
    expect(screen.getByText("USER_CREATED")).toBeInTheDocument();
    expect(screen.getByText("alice-admin")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
  });

  it("shows 'system' for events without an acting user and a truncated id for unknown actors", () => {
    queryState({
      audit: {
        data: {
          items: [
            { ...EVENT, id: "e1", user_id: null },
            { ...EVENT, id: "e2" },
          ],
          total: 2,
          page: 1,
          per_page: 50,
        },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
      users: [],
    });

    render(<AuditLogPage />);

    expect(screen.getByText("system")).toBeInTheDocument();
    // Unknown actor id renders truncated with the full id as a tooltip.
    expect(screen.getByTitle(ACTOR_ID)).toBeInTheDocument();
  });

  it("shows the empty state when there are no events", () => {
    queryState({
      audit: {
        data: { items: [], total: 0, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    expect(screen.getByText(/no audit events found/i)).toBeInTheDocument();
  });

  it("shows an error alert when the query fails", () => {
    queryState({
      audit: {
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    expect(screen.getByText(/audit log unavailable/i)).toBeInTheDocument();
  });

  it("rejects a malformed user-id filter client-side", () => {
    queryState({
      audit: {
        data: { items: [], total: 0, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    fireEvent.change(screen.getByLabelText(/user id/i), {
      target: { value: "not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/must be a uuid/i);

    // Fixing the value clears the error on the next apply.
    fireEvent.change(screen.getByLabelText(/user id/i), {
      target: { value: ACTOR_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("applies filters on Enter and clears them via Clear filters", () => {
    queryState({
      audit: {
        data: { items: [], total: 0, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    // Fill every filter input, then apply with Enter from a text filter.
    fireEvent.change(screen.getByLabelText(/^action$/i), {
      target: { value: "LOGIN" },
    });
    fireEvent.change(screen.getByLabelText(/resource type/i), {
      target: { value: "user" },
    });
    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText(/^to$/i), {
      target: { value: "2026-07-02" },
    });
    fireEvent.keyDown(screen.getByLabelText(/resource type/i), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText(/user id/i), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText(/^action$/i), { key: "Enter" });

    // Applied filters reveal the clear affordance; clicking it resets state.
    const clear = screen.getByRole("button", { name: /clear filters/i });
    fireEvent.click(clear);
    expect(
      screen.queryByRole("button", { name: /clear filters/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^action$/i)).toHaveValue("");
  });

  it("invalidates the audit query on refresh and forwards pagination callbacks", () => {
    queryState({
      audit: {
        data: { items: [EVENT], total: 300, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    fireEvent.click(screen.getByRole("button", { name: /refresh audit log/i }));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin-audit-log"],
    });

    // The DataTable stub forwards onPageChange / onPageSizeChange; the page
    // must not crash and keeps rendering after both.
    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    fireEvent.click(screen.getByRole("button", { name: "set-page-size" }));
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("builds the audit query from applied filters when the query runs", async () => {
    queryState({
      audit: {
        data: { items: [], total: 0, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });
    mockAuditList.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 50 });
    mockAdminListUsers.mockResolvedValue([]);

    render(<AuditLogPage />);

    fireEvent.change(screen.getByLabelText(/^action$/i), {
      target: { value: "LOGIN" },
    });
    fireEvent.change(screen.getByLabelText(/^from$/i), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    // Execute the captured queryFn / placeholderData for both queries the way
    // react-query would, and assert the audit call carries the applied
    // filters (dates converted to RFC 3339 bounds).
    const auditOpts = mockUseQuery.mock.calls
      .map(([o]) => o)
      .filter((o) => o.queryKey?.[0] === "admin-audit-log")
      .at(-1);
    await auditOpts.queryFn();
    expect(mockAuditList).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        per_page: 50,
        action: "LOGIN",
        user_id: undefined,
        resource_type: undefined,
        from: new Date("2026-07-01T00:00:00").toISOString(),
        to: undefined,
      })
    );
    expect(auditOpts.placeholderData("previous")).toBe("previous");

    const usersOpts = mockUseQuery.mock.calls
      .map(([o]) => o)
      .find((o) => o.queryKey?.[0] === "admin-users");
    await usersOpts.queryFn();
    expect(mockAdminListUsers).toHaveBeenCalled();
  });

  it("renders string details and truncates long payloads", () => {
    const longDetails = { blob: "x".repeat(200) };
    queryState({
      audit: {
        data: {
          items: [
            { ...EVENT, id: "s1", details: "plain-string-details" },
            { ...EVENT, id: "s2", details: longDetails },
            { ...EVENT, id: "s3", details: null },
          ],
          total: 3,
          page: 1,
          per_page: 50,
        },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
    });

    render(<AuditLogPage />);

    expect(screen.getByText("plain-string-details")).toBeInTheDocument();
    // The long payload preview is truncated to 80 chars with an ellipsis.
    const expectedPreview = `${JSON.stringify(longDetails).slice(0, 80)}…`;
    expect(screen.getByText(expectedPreview)).toBeInTheDocument();
  });
});

describe("AuditLogPage export", () => {
  function renderWithEvents(total = 3) {
    queryState({
      audit: {
        data: { items: [EVENT], total, page: 1, per_page: 50 },
        isLoading: false,
        isError: false,
        isFetching: false,
      },
      users: [{ id: ACTOR_ID, username: "alice-admin" }],
    });
    render(<AuditLogPage />);
  }

  it("exports CSV honoring the applied filters", async () => {
    renderWithEvents();
    mockAuditExport.mockResolvedValue({
      items: [EVENT],
      total: 1,
      truncated: false,
    });

    fireEvent.change(screen.getByLabelText(/^action$/i), {
      target: { value: "LOGIN" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    fireEvent.click(screen.getByRole("button", { name: /export as csv/i }));

    await waitFor(() => expect(mockTriggerDownload).toHaveBeenCalledTimes(1));

    expect(mockAuditExport).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN" })
    );
    const [filename, content, mime] = mockTriggerDownload.mock.calls[0];
    expect(filename).toMatch(/^audit-log-.*\.csv$/);
    expect(mime).toMatch(/text\/csv/);
    expect(content).toContain("id,created_at,action"); // header row
    expect(content).toContain("USER_CREATED");
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("exports JSON as a versioned structured envelope", async () => {
    renderWithEvents();
    mockAuditExport.mockResolvedValue({
      items: [EVENT],
      total: 1,
      truncated: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /export as json/i }));

    await waitFor(() => expect(mockTriggerDownload).toHaveBeenCalledTimes(1));
    const [filename, content, mime] = mockTriggerDownload.mock.calls[0];
    expect(filename).toMatch(/\.json$/);
    expect(mime).toMatch(/application\/json/);
    const parsed = JSON.parse(content);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.count).toBe(1);
    expect(parsed.items).toHaveLength(1);
  });

  it("shows an info toast and skips download when nothing matches", async () => {
    renderWithEvents();
    mockAuditExport.mockResolvedValue({
      items: [],
      total: 0,
      truncated: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /export as csv/i }));

    await waitFor(() => expect(mockToast.info).toHaveBeenCalled());
    expect(mockTriggerDownload).not.toHaveBeenCalled();
  });

  it("warns when a large export is truncated", async () => {
    renderWithEvents();
    mockAuditExport.mockResolvedValue({
      items: [EVENT, { ...EVENT, id: "e2" }],
      total: 1000,
      truncated: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /export as csv/i }));

    await waitFor(() => expect(mockTriggerDownload).toHaveBeenCalledTimes(1));
    expect(mockToast.warning).toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when the export fails", async () => {
    renderWithEvents();
    mockAuditExport.mockRejectedValue(new Error("network"));

    fireEvent.click(screen.getByRole("button", { name: /export as json/i }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(mockTriggerDownload).not.toHaveBeenCalled();
  });

  it("disables the export control when there are no events", () => {
    renderWithEvents(0);
    expect(
      screen.getByRole("button", { name: /export audit log/i })
    ).toBeDisabled();
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
