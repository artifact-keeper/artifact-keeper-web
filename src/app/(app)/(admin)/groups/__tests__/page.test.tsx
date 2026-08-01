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
    Users2: stub("Users2"),
    UserPlus: stub("UserPlus"),
    UserMinus: stub("UserMinus"),
    Search: stub("Search"),
  };
});

const {
  mockUseAuth,
  mockUseQuery,
  mockUseMutation,
  mockInvalidateQueries,
  mockGroupsList,
  mockGroupsGetDetail,
  mockGroupsCreate,
  mockGroupsUpdate,
  mockGroupsDelete,
  mockGroupsAddMembers,
  mockGroupsRemoveMembers,
  mockAdminListUsersPage,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockGroupsList: vi.fn(),
  mockGroupsGetDetail: vi.fn(),
  mockGroupsCreate: vi.fn(),
  mockGroupsUpdate: vi.fn(),
  mockGroupsDelete: vi.fn(),
  mockGroupsAddMembers: vi.fn(),
  mockGroupsRemoveMembers: vi.fn(),
  mockAdminListUsersPage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/api/groups", () => ({
  groupsApi: {
    list: (...args: any[]) => mockGroupsList(...args),
    getDetail: (...args: any[]) => mockGroupsGetDetail(...args),
    create: (...args: any[]) => mockGroupsCreate(...args),
    update: (...args: any[]) => mockGroupsUpdate(...args),
    delete: (...args: any[]) => mockGroupsDelete(...args),
    addMembers: (...args: any[]) => mockGroupsAddMembers(...args),
    removeMembers: (...args: any[]) => mockGroupsRemoveMembers(...args),
  },
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    listUsersPage: (...args: any[]) => mockAdminListUsersPage(...args),
  },
}));

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

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: any) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
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
        <tbody>
          {data.map((row: any, i: number) => (
            <tr key={rowKey ? rowKey(row) : i}>
              {columns.map((c: any) => (
                <td key={c.id}>{c.cell ? c.cell(row) : null}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title, onConfirm }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title, description, action }: any) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action}
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

const mockGroup = {
  id: "grp-1",
  name: "engineering",
  description: "Engineers",
  auto_join: false,
  member_count: 1,
  is_external: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const memberUser = {
  id: "user-1",
  username: "alice",
  email: "alice@test.com",
  display_name: "Alice A",
  is_admin: false,
  is_active: true,
};

const nonMemberUser = {
  id: "user-2",
  username: "bob",
  email: "bob@test.com",
  display_name: "Bob B",
  is_admin: false,
  is_active: true,
};

const groupDetail = {
  ...mockGroup,
  members: [
    {
      user_id: "user-1",
      username: "alice",
      display_name: "Alice A",
      joined_at: "2026-01-02T00:00:00Z",
    },
  ],
};

let capturedQueryConfigs: any[] = [];

function setupMocks(
  opts: {
    user?: any;
    groups?: any[];
    groupsTotal?: number;
    pickerUsers?: any[];
    pickerTotal?: number;
  } = {}
) {
  const {
    user = adminUser,
    groups = [mockGroup],
    groupsTotal,
    pickerUsers = [memberUser, nonMemberUser],
    pickerTotal,
  } = opts;

  mockUseAuth.mockReturnValue({ user });
  capturedQueryConfigs = [];

  mockUseQuery.mockImplementation((q: any) => {
    capturedQueryConfigs.push(q);
    if (q.queryKey[0] === "admin-groups") {
      return {
        data: {
          items: groups,
          pagination: { total: groupsTotal ?? groups.length },
        },
        isLoading: false,
      };
    }
    if (q.queryKey[0] === "admin-group-detail") {
      return { data: groupDetail, isLoading: false };
    }
    if (q.queryKey[0] === "admin-users") {
      return {
        data: {
          items: pickerUsers,
          total: pickerTotal ?? pickerUsers.length,
        },
        isLoading: false,
      };
    }
    return { data: undefined, isLoading: false };
  });

  mockUseMutation.mockImplementation(() => ({
    mutate: vi.fn(),
    isPending: false,
  }));
}

function openMembersDialog() {
  const manageButtons = screen.getAllByTestId("icon-Users2");
  fireEvent.click(manageButtons[0]);
}

function pickerQueries() {
  return capturedQueryConfigs.filter(
    (c) => c.queryKey[0] === "admin-users" && c.queryKey[1] === "picker"
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import GroupsPage from "../page";

describe("GroupsPage", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the groups table for admins", () => {
    setupMocks();
    render(<GroupsPage />);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByText("engineering")).toBeInTheDocument();
  });

  describe("add member picker (#564)", () => {
    it("queries users with perPage 100 and no search when the dialog opens", async () => {
      mockAdminListUsersPage.mockResolvedValue({ items: [], total: 0 });
      setupMocks();
      render(<GroupsPage />);
      openMembersDialog();

      const picker = pickerQueries().at(-1);
      expect(picker).toBeDefined();
      expect(picker.queryKey).toEqual(["admin-users", "picker", ""]);
      await picker.queryFn();
      expect(mockAdminListUsersPage).toHaveBeenCalledWith({
        search: undefined,
        perPage: 100,
      });
    });

    it("offers users who are not already members", () => {
      setupMocks();
      render(<GroupsPage />);
      openMembersDialog();

      expect(screen.getByTestId("select-item-user-2")).toBeInTheDocument();
      expect(
        screen.queryByTestId("select-item-user-1")
      ).not.toBeInTheDocument();
    });

    it("passes the search term to the server-side query", async () => {
      mockAdminListUsersPage.mockResolvedValue({
        items: [nonMemberUser],
        total: 1,
      });
      setupMocks();
      render(<GroupsPage />);
      openMembersDialog();

      fireEvent.change(screen.getByLabelText("Search users to add"), {
        target: { value: "bob" },
      });

      const picker = pickerQueries().find((c) => c.queryKey[2] === "bob");
      expect(picker).toBeDefined();
      await picker.queryFn();
      expect(mockAdminListUsersPage).toHaveBeenCalledWith({
        search: "bob",
        perPage: 100,
      });
    });

    it("shows a match-specific empty message when a search finds nothing", () => {
      setupMocks({ pickerUsers: [] });
      render(<GroupsPage />);
      openMembersDialog();

      fireEvent.change(screen.getByLabelText("Search users to add"), {
        target: { value: "zzz" },
      });

      expect(
        screen.getByText("No users match your search")
      ).toBeInTheDocument();
    });

    it("shows a truncation notice when the server total exceeds the fetched page", () => {
      setupMocks({
        pickerUsers: [memberUser, nonMemberUser],
        pickerTotal: 150,
      });
      render(<GroupsPage />);
      openMembersDialog();

      expect(
        screen.getByText(/Showing first 2 of 150/)
      ).toBeInTheDocument();
    });

    it("does not show a truncation notice when all users fit in the page", () => {
      setupMocks({
        pickerUsers: [memberUser, nonMemberUser],
        pickerTotal: 2,
      });
      render(<GroupsPage />);
      openMembersDialog();

      expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
    });
  });
});
