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
    ScrollText: stub("ScrollText"),
  };
});

const {
  mockUseAuth,
  mockUseQuery,
  mockInvalidateQueries,
  mockAuditList,
  mockAdminListUsers,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockAuditList: vi.fn(),
  mockAdminListUsers: vi.fn(),
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
    auditApi: { list: (...args: any[]) => mockAuditList(...args) },
  };
});

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    listUsers: (...args: any[]) => mockAdminListUsers(...args),
  },
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
// renderers, empty message, and loading flag the page passes in.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ columns, data, loading, emptyMessage }: any) => {
    if (loading) return <div data-testid="data-table-loading" />;
    if (!data.length) return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <table data-testid="data-table">
        <tbody>
          {data.map((row: any, i: number) => (
            <tr key={row.id ?? i}>
              {columns.map((c: any) => (
                <td key={c.id}>
                  {c.cell ? c.cell(row) : String(c.accessor?.(row) ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
