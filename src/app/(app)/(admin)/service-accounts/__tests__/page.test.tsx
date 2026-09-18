// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// lucide-react icons: explicit named exports (NO Proxy to avoid vitest hangs)
vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    Bot: stub("Bot"),
    Plus: stub("Plus"),
    Trash2: stub("Trash2"),
    Pencil: stub("Pencil"),
    Key: stub("Key"),
    ToggleLeft: stub("ToggleLeft"),
    ToggleRight: stub("ToggleRight"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_admin: true } }),
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/api/service-accounts", () => ({
  serviceAccountsApi: {
    list: vi.fn(),
    listTokens: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createToken: vi.fn(),
    revokeToken: vi.fn(),
  },
}));

vi.mock("@/lib/constants/token", () => ({
  SCOPES: [{ value: "read:artifacts", label: "Read" }],
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));
vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title }: any) => (open ? <div>{title}</div> : null),
}));
vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: any) => <span>{status}</span>,
}));
vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ data, columns, rowKey }: any) => (
    <table>
      <tbody>
        {(data ?? []).map((row: any, i: number) => (
          <tr key={rowKey ? rowKey(row) : i}>
            {columns.map((c: any) => (
              <td key={c.id}>{c.cell ? c.cell(row) : null}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
vi.mock("@/components/common/token-create-form", () => ({
  TokenCreateForm: ({ onSubmit }: any) => (
    <button data-testid="form-submit-btn" onClick={onSubmit}>
      Create
    </button>
  ),
}));
vi.mock("@/components/common/token-created-alert", () => ({
  TokenCreatedAlert: ({ token, expiresAt, policyApplied }: any) => (
    <div
      data-testid="token-created-alert"
      data-expires-at={expiresAt ?? ""}
      data-policy-applied={String(!!policyApplied)}
    >
      {token}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import ServiceAccountsPage from "../page";
import { ApiError } from "@/lib/api/fetch";

const ACCOUNT = {
  id: "sa-1",
  username: "ci-bot",
  display_name: "CI",
  is_active: true,
  token_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** The page's useMutation options, in declaration order. */
let mutationConfigs: any[] = [];

/** Index of `createTokenMutation` among the page's useMutation calls. */
const CREATE_TOKEN_MUTATION = 3;

function setupMocks() {
  mutationConfigs = [];
  mockUseQuery.mockImplementation((opts: any) =>
    opts.queryKey[0] === "service-accounts"
      ? { data: [ACCOUNT], isLoading: false }
      : { data: [], isLoading: false },
  );
  mockUseMutation.mockImplementation((opts: any) => {
    mutationConfigs.push(opts);
    return { mutate: vi.fn(), isPending: false };
  });
}

/** Open the per-account "Manage Tokens" dialog. */
function openTokenDialog() {
  const manageButton = screen
    .getAllByTestId("icon-Key")[0]
    .closest("button") as HTMLButtonElement;
  fireEvent.click(manageButton);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

afterEach(() => cleanup());

describe("ServiceAccountsPage — token reveal (#854)", () => {
  it("hands the reveal the expiry the instance policy applied", () => {
    render(<ServiceAccountsPage />);
    openTokenDialog();

    act(() => {
      mutationConfigs[CREATE_TOKEN_MUTATION].onSuccess({
        id: "tok-1",
        name: "deploy",
        token: "akt_secret",
        expires_at: "2026-12-17T09:30:00Z",
        policy_applied: true,
      });
    });

    const alert = screen.getByTestId("token-created-alert");
    expect(alert).toHaveTextContent("akt_secret");
    expect(alert).toHaveAttribute("data-expires-at", "2026-12-17T09:30:00Z");
    expect(alert).toHaveAttribute("data-policy-applied", "true");
  });

  it("reports a never-expiring mint as such", () => {
    render(<ServiceAccountsPage />);
    openTokenDialog();

    act(() => {
      mutationConfigs[CREATE_TOKEN_MUTATION].onSuccess({
        id: "tok-2",
        name: "deploy",
        token: "akt_secret",
        expires_at: null,
        policy_applied: false,
      });
    });

    const alert = screen.getByTestId("token-created-alert");
    expect(alert).toHaveAttribute("data-expires-at", "");
    expect(alert).toHaveAttribute("data-policy-applied", "false");
  });

  it("shows the backend's out-of-range refusal verbatim", async () => {
    const { toast } = await import("sonner");
    render(<ServiceAccountsPage />);

    const message =
      "expires_in_days (5000) violates this instance's token expiration " +
      "policy: it must be between 7 and 365 days";
    act(() => {
      mutationConfigs[CREATE_TOKEN_MUTATION].onError(
        new ApiError(400, JSON.stringify({ code: "VALIDATION_ERROR", message })),
      );
    });

    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it("falls back to the generic label for an opaque failure", async () => {
    const { toast } = await import("sonner");
    render(<ServiceAccountsPage />);

    act(() => {
      mutationConfigs[CREATE_TOKEN_MUTATION].onError(undefined);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to create token");
  });
});
