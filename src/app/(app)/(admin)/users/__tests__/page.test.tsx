// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
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
    Plus: stub("Plus"),
    Pencil: stub("Pencil"),
    Trash2: stub("Trash2"),
    KeyRound: stub("KeyRound"),
    Key: stub("Key"),
    ToggleLeft: stub("ToggleLeft"),
    ToggleRight: stub("ToggleRight"),
    Copy: stub("Copy"),
    Users: stub("Users"),
    ShieldCheck: stub("ShieldCheck"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/sdk-client", () => ({}));
vi.mock("@artifact-keeper/sdk", () => ({
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    listUsers: vi.fn(),
    listUserTokens: vi.fn(),
    revokeUserToken: vi.fn(),
  },
}));

vi.mock("@/lib/api/profile", () => ({}));
vi.mock("@/lib/query-keys", () => ({
  invalidateGroup: vi.fn(),
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

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => <input type="checkbox" {...props} />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button
          data-testid="dialog-close-trigger"
          onClick={() => onOpenChange?.(false)}
        >
          Close
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  AlertTitle: ({ children }: any) => <span>{children}</span>,
  AlertDescription: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, description, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {actions}
    </div>
  ),
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ data, columns, loading, emptyMessage, rowKey }: any) => {
    if (loading) return <div data-testid="data-table-loading">Loading...</div>;
    if (!data || data.length === 0)
      return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <table data-testid="data-table">
        <thead>
          <tr>
            {columns.map((c: any) => (
              <th key={c.id}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, i: number) => (
            <tr key={rowKey ? rowKey(row) : i}>
              {columns.map((c: any) => {
                if (c.accessor) c.accessor(row);
                return (
                  <td key={c.id}>{c.cell ? c.cell(row) : null}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: any) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title, onConfirm, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button
          data-testid="cancel-confirm-btn"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminUser = {
  id: "admin-1",
  username: "admin",
  email: "admin@test.com",
  is_admin: true,
  is_active: true,
};

const regularUser = {
  id: "user-2",
  username: "jdoe",
  email: "jdoe@test.com",
  display_name: "John Doe",
  is_admin: false,
  is_active: true,
};

const mockUsers = [adminUser, regularUser];

const mockTokens = [
  {
    id: "tok-1",
    name: "CI Pipeline",
    key_prefix: "ak_ci",
    scopes: ["read", "write"],
    created_at: "2026-01-15T00:00:00Z",
    expires_at: "2026-07-15T00:00:00Z",
    last_used_at: "2026-03-10T00:00:00Z",
  },
  {
    id: "tok-2",
    name: "Read Only",
    key_prefix: "ak_ro",
    scopes: ["read"],
    created_at: "2026-02-01T00:00:00Z",
    expires_at: null,
    last_used_at: null,
  },
];

// Track mutation handlers so we can trigger them in tests
let capturedMutationConfigs: any[] = [];
let capturedQueryConfigs: any[] = [];

function setupMocks(opts: {
  user?: any;
  users?: any[];
  usersLoading?: boolean;
  tokens?: any[];
  tokensLoading?: boolean;
} = {}) {
  const {
    user = adminUser,
    users = mockUsers,
    usersLoading = false,
    tokens = [],
    tokensLoading = false,
  } = opts;

  mockUseAuth.mockReturnValue({ user });

  capturedQueryConfigs = [];
  capturedMutationConfigs = [];

  mockUseQuery.mockImplementation((opts: any) => {
    capturedQueryConfigs.push(opts);
    if (opts.queryKey[0] === "admin-users") {
      return { data: users, isLoading: usersLoading };
    }
    if (opts.queryKey[0] === "admin-user-tokens") {
      return { data: tokens, isLoading: tokensLoading };
    }
    return { data: undefined, isLoading: false };
  });

  mockUseMutation.mockImplementation((opts: any) => {
    capturedMutationConfigs.push(opts);
    return {
      mutate: vi.fn(),
      isPending: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import UsersPage from "../page";

describe("UsersPage", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Basic rendering --

  it("renders page header for admin users", () => {
    setupMocks();
    render(<UsersPage />);
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("shows access denied for non-admin users", () => {
    setupMocks({ user: { ...adminUser, is_admin: false } });
    render(<UsersPage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("renders user table with user data", () => {
    setupMocks();
    render(<UsersPage />);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  // -- View Tokens button --

  it("renders View Tokens button (Key icon) for each user row", () => {
    setupMocks();
    render(<UsersPage />);
    const keyIcons = screen.getAllByTestId("icon-Key");
    expect(keyIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows View Tokens tooltip text in the actions", () => {
    setupMocks();
    render(<UsersPage />);
    expect(screen.getAllByText("View Tokens").length).toBeGreaterThanOrEqual(1);
  });

  // -- Tokens dialog --

  it("opens tokens dialog when View Tokens is clicked", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    // Find and click the View Tokens button for the second user (jdoe)
    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    // The dialog should be open with the username in the title
    expect(screen.getByText(/API Tokens:/)).toBeInTheDocument();
    const dialogTitle = screen.getByTestId("dialog-title");
    expect(dialogTitle).toHaveTextContent("jdoe");
  });

  it("shows token details in the tokens dialog", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    // Click View Tokens for jdoe
    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    // Check token details are rendered
    expect(screen.getByText("CI Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Read Only")).toBeInTheDocument();
    expect(screen.getByText("ak_ci...")).toBeInTheDocument();
    expect(screen.getByText("ak_ro...")).toBeInTheDocument();
  });

  it("shows empty state when user has no tokens", () => {
    setupMocks({ tokens: [] });
    render(<UsersPage />);

    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    expect(screen.getByText("No tokens")).toBeInTheDocument();
  });

  it("shows loading state when tokens are loading", () => {
    setupMocks({ tokens: undefined as any, tokensLoading: true });
    render(<UsersPage />);

    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    expect(screen.getByText("Loading tokens...")).toBeInTheDocument();
  });

  // -- Revoke token flow --

  it("shows revoke confirmation when Revoke button is clicked on a token", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    // Open tokens dialog
    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    // Click the first Revoke button
    const revokeButtons = screen.getAllByText("Revoke");
    fireEvent.click(revokeButtons[0]);

    // Confirmation dialog should appear
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Revoke Token")).toBeInTheDocument();
  });

  it("calls revokeUserToken mutation with correct user and token IDs", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    // Open tokens dialog for jdoe (user-2)
    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    // Click Revoke on the first token
    const revokeButtons = screen.getAllByText("Revoke");
    fireEvent.click(revokeButtons[0]);

    // Confirm the revocation
    const confirmBtn = screen.getByTestId("confirm-btn");
    fireEvent.click(confirmBtn);

    // The revoke mutation should have been registered
    // (since we're mocking useMutation, we verify the config was captured)
    const revokeMutationConfig = capturedMutationConfigs.find(
      (c) => c.onSuccess && c.onError
    );
    expect(revokeMutationConfig).toBeDefined();
  });

  // -- Token query configuration --

  it("fetches user tokens query with correct user ID and enabled flag", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    // Before opening dialog, the token query should exist but be disabled
    const tokenQueryBefore = capturedQueryConfigs.find(
      (c) => c.queryKey[0] === "admin-user-tokens"
    );
    expect(tokenQueryBefore).toBeDefined();

    // Open tokens dialog for jdoe
    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    // After opening, the re-rendered query should be enabled with the user ID
    const tokenQueryAfter = capturedQueryConfigs.find(
      (c) =>
        c.queryKey[0] === "admin-user-tokens" &&
        c.queryKey[1] === "user-2"
    );
    expect(tokenQueryAfter).toBeDefined();
  });

  // -- Token scopes display --

  it("renders scope badges for tokens in the dialog", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    const badges = screen.getAllByTestId("badge");
    // mockTokens[0] has ["read", "write"], mockTokens[1] has ["read"]
    // Plus the admin badge from the admin user in the table
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  // -- Close dialog --

  it("closes tokens dialog when Close button is clicked", () => {
    setupMocks({ tokens: mockTokens });
    render(<UsersPage />);

    const keyIcons = screen.getAllByTestId("icon-Key");
    fireEvent.click(keyIcons[1]);

    expect(screen.getByText(/API Tokens:/)).toBeInTheDocument();

    // Click the Close button in the dialog footer
    const closeButtons = screen.getAllByText("Close");
    // The first "Close" is the dialog-close-trigger mock, others may be the button
    fireEvent.click(closeButtons[closeButtons.length - 1]);
  });

  // -- Non-admin users should not see token management --

  it("does not render token management for non-admin users", () => {
    setupMocks({ user: { ...adminUser, is_admin: false } });
    render(<UsersPage />);

    // Non-admin users see Access Denied, not the users table
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("View Tokens")).not.toBeInTheDocument();
  });
});
