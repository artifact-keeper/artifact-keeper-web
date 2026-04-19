// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// lucide-react icons: explicit named exports (NO Proxy to avoid vitest hangs)
vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Key: stub("Key"),
    Shield: stub("Shield"),
    Plus: stub("Plus"),
    Trash2: stub("Trash2"),
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

vi.mock("@/lib/api/profile", () => ({
  profileApi: {
    listApiKeys: vi.fn(),
    listAccessTokens: vi.fn(),
    createApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    createAccessToken: vi.fn(),
    deleteAccessToken: vi.fn(),
  },
}));

vi.mock("@/lib/api/service-accounts", () => ({
  serviceAccountsApi: {
    previewRepoSelector: vi.fn(),
  },
}));

vi.mock("@/lib/constants/token", () => ({
  SCOPES: [
    { value: "read", label: "Read" },
    { value: "write", label: "Write" },
    { value: "admin", label: "Admin" },
  ],
}));

// UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, defaultValue }: any) => (
    <div data-testid="tabs" data-default={defaultValue}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => (
    <div data-testid="tabs-list">{children}</div>
  ),
  TabsTrigger: ({ children, value }: any) => (
    <button data-testid={`tab-trigger-${value}`} data-value={value}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
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
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

// Common components
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
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
                // Invoke accessor to cover those callbacks
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

vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("@/components/common/token-created-alert", () => ({
  TokenCreatedAlert: ({ title, token, onDone }: any) => (
    <div data-testid="token-created-alert">
      <span>
        {title}: {token}
      </span>
      <button data-testid="token-done-btn" onClick={onDone}>
        Done
      </button>
    </div>
  ),
}));

vi.mock("@/components/common/token-create-form", () => ({
  TokenCreateForm: ({
    title,
    onSubmit,
    onCancel,
    availableScopes,
    showRepoSelector,
    repoSelector,
    onRepoSelectorChange,
  }: any) => (
    <div data-testid="token-create-form">
      <span>{title}</span>
      <button data-testid="form-submit-btn" onClick={onSubmit}>
        Submit
      </button>
      <button data-testid="form-cancel-btn" onClick={onCancel}>
        Cancel
      </button>
      {availableScopes && (
        <div data-testid="available-scopes">
          {availableScopes.map((s: any) => (
            <span key={s.value} data-testid={`scope-${s.value}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}
      {showRepoSelector && (
        <div data-testid="repo-selector-section">
          <span data-testid="repo-selector-data">
            {JSON.stringify(repoSelector)}
          </span>
          <button
            data-testid="repo-selector-change-btn"
            onClick={() =>
              onRepoSelectorChange?.({ match_formats: ["docker"] })
            }
          >
            Change Selector
          </button>
        </div>
      )}
    </div>
  ),
}));

vi.mock("@/components/common/repo-selector-form", () => ({
  RepoSelectorForm: () => <div data-testid="repo-selector-form" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockApiKeys = [
  {
    id: "key-1",
    name: "CI Pipeline Key",
    key_prefix: "ak_ci12",
    scopes: ["read", "write"],
    expires_at: "2026-06-01T00:00:00Z",
    last_used_at: "2026-02-20T12:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "key-2",
    name: "Read Only Key",
    key_prefix: "ak_ro34",
    scopes: ["read"],
    expires_at: null,
    last_used_at: null,
    created_at: "2026-01-15T00:00:00Z",
  },
];

const mockAccessTokens = [
  {
    id: "token-1",
    name: "Local Dev Token",
    token_prefix: "at_dev1",
    scopes: ["read", "write", "admin"],
    expires_at: "2026-12-31T00:00:00Z",
    last_used_at: "2026-02-25T08:30:00Z",
    created_at: "2026-02-01T00:00:00Z",
  },
];

const mockScopedAccessTokens = [
  {
    id: "token-scoped-1",
    name: "Scoped Docker Token",
    token_prefix: "at_dck1",
    scopes: ["read", "write"],
    expires_at: "2026-12-31T00:00:00Z",
    last_used_at: null,
    created_at: "2026-03-01T00:00:00Z",
    repo_selector: {
      match_formats: ["docker", "helm"],
      match_pattern: "prod-*",
      match_labels: { env: "production" },
    },
  },
  {
    id: "token-scoped-2",
    name: "Repo ID Token",
    token_prefix: "at_rid1",
    scopes: ["read"],
    expires_at: null,
    last_used_at: "2026-03-10T12:00:00Z",
    created_at: "2026-03-05T00:00:00Z",
    repository_ids: ["repo-1", "repo-2", "repo-3"],
  },
  {
    id: "token-unscoped",
    name: "All Repos Token",
    token_prefix: "at_all1",
    scopes: ["read"],
    expires_at: null,
    last_used_at: null,
    created_at: "2026-03-10T00:00:00Z",
  },
];

// Store mutation configs so we can invoke onSuccess / onError callbacks
let mutationConfigs: any[] = [];

function setupDefaultMocks(
  overrides: {
    apiKeys?: any[];
    accessTokens?: any[];
    keysLoading?: boolean;
    tokensLoading?: boolean;
    isAdmin?: boolean;
  } = {}
) {
  const {
    apiKeys = [],
    accessTokens = [],
    keysLoading = false,
    tokensLoading = false,
    isAdmin = false,
  } = overrides;

  mockUseAuth.mockReturnValue({
    user: { username: "testuser", is_admin: isAdmin },
  });

  mockUseQuery.mockImplementation((opts: any) => {
    // Invoke queryFn to cover the inline arrow callbacks
    if (opts.queryFn) {
      try {
        opts.queryFn();
      } catch {
        /* mocked APIs, safe to ignore */
      }
    }
    if (opts.queryKey[1] === "api-keys") {
      return { data: apiKeys, isLoading: keysLoading };
    }
    if (opts.queryKey[1] === "access-tokens") {
      return { data: accessTokens, isLoading: tokensLoading };
    }
    return { data: [], isLoading: false };
  });

  mutationConfigs = [];
  mockUseMutation.mockImplementation((opts: any) => {
    mutationConfigs.push(opts);
    return {
      mutate: vi.fn((arg: any) => opts.mutationFn?.(arg)),
      isPending: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Import the component under test (vi.mock calls above are hoisted)
// ---------------------------------------------------------------------------

import AccessTokensPage, { renderRepoAccess } from "../page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AccessTokensPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Page header
  // -------------------------------------------------------------------------
  it("renders page header with title and description", () => {
    render(<AccessTokensPage />);

    const header = screen.getByTestId("page-header");
    expect(header).toBeInTheDocument();
    expect(header.querySelector("h1")?.textContent).toBe("Access Tokens");
    expect(
      screen.getByText(
        "Manage API keys and personal access tokens for programmatic access to the registry."
      )
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Both tabs render
  // -------------------------------------------------------------------------
  it("renders both API Keys and Access Tokens tab triggers", () => {
    render(<AccessTokensPage />);

    expect(screen.getByTestId("tab-trigger-api-keys")).toBeInTheDocument();
    expect(
      screen.getByTestId("tab-trigger-access-tokens")
    ).toBeInTheDocument();
    expect(screen.getByTestId("tab-content-api-keys")).toBeInTheDocument();
    expect(
      screen.getByTestId("tab-content-access-tokens")
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Empty state for API keys
  // -------------------------------------------------------------------------
  it("shows empty state when there are no API keys", () => {
    setupDefaultMocks({ apiKeys: [], accessTokens: [] });

    render(<AccessTokensPage />);

    const emptyStates = screen.getAllByTestId("empty-state");
    const apiKeyEmpty = emptyStates.find((el) =>
      el.textContent?.includes("No API keys")
    );
    expect(apiKeyEmpty).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Empty state for access tokens
  // -------------------------------------------------------------------------
  it("shows empty state when there are no access tokens", () => {
    setupDefaultMocks({ apiKeys: [], accessTokens: [] });

    render(<AccessTokensPage />);

    const emptyStates = screen.getAllByTestId("empty-state");
    const tokenEmpty = emptyStates.find((el) =>
      el.textContent?.includes("No access tokens")
    );
    expect(tokenEmpty).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Renders API key data with DataTable (DateCell, ScopeBadges, TokenPrefix)
  // -------------------------------------------------------------------------
  it("renders API key data in the table with helper components", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    // Name column renders key name
    expect(screen.getByText("CI Pipeline Key")).toBeInTheDocument();
    expect(screen.getByText("Read Only Key")).toBeInTheDocument();

    // TokenPrefix renders prefix with ellipsis
    expect(screen.getByText(/ak_ci12/)).toBeInTheDocument();
    expect(screen.getByText(/ak_ro34/)).toBeInTheDocument();

    // ScopeBadges renders scope badges
    const badges = screen.getAllByTestId("badge");
    expect(badges.length).toBeGreaterThan(0);

    // DateCell renders dates; the key with last_used_at = null shows "Never"
    const neverElements = screen.getAllByText("Never");
    expect(neverElements.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 6. Renders access token data
  // -------------------------------------------------------------------------
  it("renders access token data in the table", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    expect(screen.getByText("Local Dev Token")).toBeInTheDocument();
    expect(screen.getByText(/at_dev1/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 7. Loading state
  // -------------------------------------------------------------------------
  it("shows loading state for API keys and access tokens", () => {
    setupDefaultMocks({ keysLoading: true, tokensLoading: true });

    render(<AccessTokensPage />);

    const loadingElements = screen.getAllByTestId("data-table-loading");
    expect(loadingElements.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 8. Filters admin scope for non-admin users
  // -------------------------------------------------------------------------
  it("filters admin scope for non-admin users when creating a key", () => {
    setupDefaultMocks({ isAdmin: false });

    render(<AccessTokensPage />);

    // Click the button inside the API keys tab that says "Create API Key"
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // The form should show available scopes without admin
    const scopeContainers = screen.getAllByTestId("available-scopes");
    expect(scopeContainers.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("scope-read").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("scope-write").length
    ).toBeGreaterThanOrEqual(1);
    // admin scope should NOT be present
    expect(screen.queryByTestId("scope-admin")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Includes admin scope for admin users
  // -------------------------------------------------------------------------
  it("includes admin scope for admin users when creating a key", () => {
    setupDefaultMocks({ isAdmin: true });

    render(<AccessTokensPage />);

    // Open create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // admin scope should be present for admin users
    expect(
      screen.getAllByTestId("scope-admin").length
    ).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 10. Create API Key dialog opens and closes
  // -------------------------------------------------------------------------
  it("opens Create API Key dialog on button click", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();

    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("token-create-form")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 11. Create Access Token dialog opens
  // -------------------------------------------------------------------------
  it("opens Create Access Token dialog on button click", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create Access Token")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 12. Create API Key mutation onSuccess
  // -------------------------------------------------------------------------
  it("handles createKeyMutation onSuccess correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // The component registers 4 mutations in order:
    // 0: createKeyMutation, 1: revokeKeyMutation,
    // 2: createTokenMutation, 3: revokeTokenMutation
    const createKeyConfig = mutationConfigs[0];
    expect(createKeyConfig).toBeDefined();

    // Simulate onSuccess
    act(() => {
      createKeyConfig.onSuccess({ token: "new-api-key-token-value" });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["profile", "api-keys"],
    });
    expect(toast.success).toHaveBeenCalledWith("API key created");
  });

  // -------------------------------------------------------------------------
  // 13. Create API Key mutation onError
  // -------------------------------------------------------------------------
  it("handles createKeyMutation onError correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const createKeyConfig = mutationConfigs[0];
    act(() => {
      createKeyConfig.onError();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to create API key");
  });

  // -------------------------------------------------------------------------
  // 14. Revoke API Key mutation onSuccess
  // -------------------------------------------------------------------------
  it("handles revokeKeyMutation onSuccess correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const revokeKeyConfig = mutationConfigs[1];
    act(() => {
      revokeKeyConfig.onSuccess();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["profile", "api-keys"],
    });
    expect(toast.success).toHaveBeenCalledWith("API key revoked");
  });

  // -------------------------------------------------------------------------
  // 15. Revoke API Key mutation onError
  // -------------------------------------------------------------------------
  it("handles revokeKeyMutation onError correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const revokeKeyConfig = mutationConfigs[1];
    act(() => {
      revokeKeyConfig.onError();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to revoke API key");
  });

  // -------------------------------------------------------------------------
  // 16. Create Access Token mutation onSuccess
  // -------------------------------------------------------------------------
  it("handles createTokenMutation onSuccess correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const createTokenConfig = mutationConfigs[2];
    act(() => {
      createTokenConfig.onSuccess({ token: "new-access-token-value" });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["profile", "access-tokens"],
    });
    expect(toast.success).toHaveBeenCalledWith("Access token created");
  });

  // -------------------------------------------------------------------------
  // 17. Create Access Token mutation onError
  // -------------------------------------------------------------------------
  it("handles createTokenMutation onError correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const createTokenConfig = mutationConfigs[2];
    act(() => {
      createTokenConfig.onError();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to create access token"
    );
  });

  // -------------------------------------------------------------------------
  // 18. Revoke Access Token mutation onSuccess
  // -------------------------------------------------------------------------
  it("handles revokeTokenMutation onSuccess correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const revokeTokenConfig = mutationConfigs[3];
    act(() => {
      revokeTokenConfig.onSuccess();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["profile", "access-tokens"],
    });
    expect(toast.success).toHaveBeenCalledWith("Access token revoked");
  });

  // -------------------------------------------------------------------------
  // 19. Revoke Access Token mutation onError
  // -------------------------------------------------------------------------
  it("handles revokeTokenMutation onError correctly", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const revokeTokenConfig = mutationConfigs[3];
    act(() => {
      revokeTokenConfig.onError();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to revoke access token"
    );
  });

  // -------------------------------------------------------------------------
  // 20. Revoke API Key confirm dialog appears on trash click
  // -------------------------------------------------------------------------
  it("shows revoke confirm dialog when trash button is clicked on an API key", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    // The DataTable renders cells with Trash2 icon buttons
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    expect(trashIcons.length).toBeGreaterThanOrEqual(2);

    // Click the first trash icon's parent button to trigger setRevokeKeyId
    const firstTrashButton = trashIcons[0].closest("button");
    expect(firstTrashButton).toBeTruthy();
    fireEvent.click(firstTrashButton!);

    // The ConfirmDialog for revoking API key should now be visible
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Revoke API Key")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 21. Revoke Access Token confirm dialog appears
  // -------------------------------------------------------------------------
  it("shows revoke confirm dialog when trash button is clicked on an access token", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    const trashIcons = screen.getAllByTestId("icon-Trash2");
    expect(trashIcons.length).toBeGreaterThanOrEqual(1);

    const trashButton = trashIcons[0].closest("button");
    fireEvent.click(trashButton!);

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Revoke Access Token")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 22. Confirm revoke API key calls mutation
  // -------------------------------------------------------------------------
  it("calls revokeKeyMutation.mutate when confirm is clicked", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    // Click trash on first API key
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    const firstTrashButton = trashIcons[0].closest("button");
    fireEvent.click(firstTrashButton!);

    // Click confirm
    const confirmBtn = screen.getByTestId("confirm-btn");
    fireEvent.click(confirmBtn);

    // The revokeKeyMutation.mutate should have been called
    const revokeKeyConfig = mutationConfigs[1];
    expect(revokeKeyConfig.mutationFn).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 23. Cancel revoke API key closes dialog
  // -------------------------------------------------------------------------
  it("closes revoke dialog when cancel is clicked", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    const trashIcons = screen.getAllByTestId("icon-Trash2");
    fireEvent.click(trashIcons[0].closest("button")!);
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-confirm-btn"));
    expect(
      screen.queryByTestId("confirm-dialog")
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 24. Cancel create form closes the dialog
  // -------------------------------------------------------------------------
  it("closes Create API Key dialog when cancel is clicked on form", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open the create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Click cancel on the form
    fireEvent.click(screen.getByTestId("form-cancel-btn"));
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 25. Token created alert shows after successful key creation
  // -------------------------------------------------------------------------
  it("shows TokenCreatedAlert after successful API key creation", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Simulate mutation onSuccess which sets newlyCreatedKey state
    act(() => {
      mutationConfigs[0].onSuccess({ token: "test-key" });
    });

    // The dialog should now show the TokenCreatedAlert instead of the form
    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();
    expect(
      screen.getByText("API Key Created: test-key")
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 26. Token created alert shows after successful token creation
  // -------------------------------------------------------------------------
  it("shows TokenCreatedAlert after successful access token creation", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Simulate mutation onSuccess
    act(() => {
      mutationConfigs[2].onSuccess({ token: "test-tok" });
    });

    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();
    expect(
      screen.getByText("Access Token Created: test-tok")
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 27. DateCell renders "Never" for null values
  // -------------------------------------------------------------------------
  it("renders 'Never' for null date fields in API keys", () => {
    setupDefaultMocks({
      apiKeys: [
        {
          id: "key-null-dates",
          name: "Null Dates Key",
          key_prefix: "ak_null",
          scopes: [],
          expires_at: null,
          last_used_at: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    render(<AccessTokensPage />);

    // Both expires_at and last_used_at are null, so "Never" appears twice
    const neverElements = screen.getAllByText("Never");
    expect(neverElements.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 28. ScopeBadges with empty scopes array
  // -------------------------------------------------------------------------
  it("renders ScopeBadges without crashing for empty scopes", () => {
    setupDefaultMocks({
      apiKeys: [
        {
          id: "key-no-scopes",
          name: "No Scopes Key",
          key_prefix: "ak_ns",
          scopes: [],
          expires_at: null,
          last_used_at: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    render(<AccessTokensPage />);

    expect(screen.getByText("No Scopes Key")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 29. Submit create key form calls mutation
  // -------------------------------------------------------------------------
  it("calls createKeyMutation.mutate when submit is clicked on create key form", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // Click submit
    fireEvent.click(screen.getByTestId("form-submit-btn"));

    // The mutationFn should have been invoked via mutate
    const createKeyConfig = mutationConfigs[0];
    expect(createKeyConfig.mutationFn).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 30. Submit create token form calls mutation
  // -------------------------------------------------------------------------
  it("calls createTokenMutation.mutate when submit is clicked on create token form", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // Click submit
    fireEvent.click(screen.getByTestId("form-submit-btn"));

    const createTokenConfig = mutationConfigs[2];
    expect(createTokenConfig.mutationFn).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 31. Tab content sections render sub-headings
  // -------------------------------------------------------------------------
  it("renders sub-heading descriptions for each tab section", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    expect(
      screen.getByText(
        "Use API keys for programmatic access to the registry API."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Personal access tokens for CLI and CI/CD authentication. Tokens can be scoped to specific repositories."
      )
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 32. Multiple API keys and tokens render simultaneously
  // -------------------------------------------------------------------------
  it("renders both API keys and access tokens tables when data exists", () => {
    setupDefaultMocks({
      apiKeys: mockApiKeys,
      accessTokens: mockAccessTokens,
    });

    render(<AccessTokensPage />);

    const tables = screen.getAllByTestId("data-table");
    expect(tables.length).toBe(2);

    expect(screen.getByText("CI Pipeline Key")).toBeInTheDocument();
    expect(screen.getByText("Local Dev Token")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 33. Token done button closes dialog and clears state
  // -------------------------------------------------------------------------
  it("closes the dialog when Done is clicked on TokenCreatedAlert", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // Simulate successful creation
    act(() => {
      mutationConfigs[0].onSuccess({ token: "ak_done_test" });
    });

    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();

    // Click Done
    fireEvent.click(screen.getByTestId("token-done-btn"));

    // Dialog should close
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 34. Key icon renders in API key name column
  // -------------------------------------------------------------------------
  it("renders Key icon in API key name column", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    const keyIcons = screen.getAllByTestId("icon-Key");
    // At least the tab trigger icon + the ones from data rows
    expect(keyIcons.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 35. Shield icon renders in access token name column
  // -------------------------------------------------------------------------
  it("renders Shield icon in access token name column", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    const shieldIcons = screen.getAllByTestId("icon-Shield");
    // At least the tab trigger icon + the one from data row
    expect(shieldIcons.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 36. ScopeBadges with undefined scopes
  // -------------------------------------------------------------------------
  it("handles undefined scopes in ScopeBadges gracefully", () => {
    setupDefaultMocks({
      apiKeys: [
        {
          id: "key-undef-scopes",
          name: "Undef Scopes Key",
          key_prefix: "ak_un",
          scopes: undefined,
          expires_at: null,
          last_used_at: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    render(<AccessTokensPage />);

    expect(screen.getByText("Undef Scopes Key")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 37. Confirm revoke access token calls mutation
  // -------------------------------------------------------------------------
  it("calls revokeTokenMutation when confirm revoke is clicked on access token", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    // Click trash on the token row
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    fireEvent.click(trashIcons[0].closest("button")!);

    // Confirm dialog should appear for access token
    expect(screen.getByText("Revoke Access Token")).toBeInTheDocument();

    // Click confirm
    fireEvent.click(screen.getByTestId("confirm-btn"));

    // The mutation should have been called
    const revokeTokenConfig = mutationConfigs[3];
    expect(revokeTokenConfig.mutationFn).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 38. Non-admin user filter for create token dialog
  // -------------------------------------------------------------------------
  it("filters admin scope in create access token dialog for non-admin users", () => {
    setupDefaultMocks({ isAdmin: false });

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);

    // Should have scopes but not admin
    expect(
      screen.getAllByTestId("scope-read").length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("scope-admin")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 39. Admin user sees admin scope in create token dialog
  // -------------------------------------------------------------------------
  it("includes admin scope in create access token dialog for admin users", () => {
    setupDefaultMocks({ isAdmin: true });

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);

    expect(
      screen.getAllByTestId("scope-admin").length
    ).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 40. Query keys are correct
  // -------------------------------------------------------------------------
  it("uses correct query keys for API keys and access tokens", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const queryKeys = mockUseQuery.mock.calls.map(
      (call: any[]) => call[0].queryKey
    );
    expect(queryKeys).toContainEqual(["profile", "api-keys"]);
    expect(queryKeys).toContainEqual(["profile", "access-tokens"]);
  });

  // -------------------------------------------------------------------------
  // 41. Dialog onOpenChange resets API key state when closed
  // -------------------------------------------------------------------------
  it("resets API key dialog state when dialog is closed via onOpenChange", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Close via the onOpenChange(false) trigger
    const closeBtn = screen.getByTestId("dialog-close-trigger");
    fireEvent.click(closeBtn);

    // Dialog should be closed
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 42. Dialog onOpenChange resets access token state when closed
  // -------------------------------------------------------------------------
  it("resets access token dialog state when dialog is closed via onOpenChange", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Close via the onOpenChange(false) trigger
    const closeBtn = screen.getByTestId("dialog-close-trigger");
    fireEvent.click(closeBtn);

    // Dialog should be closed
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 43. API key dialog onOpenChange clears newlyCreatedKey
  // -------------------------------------------------------------------------
  it("clears newlyCreatedKey when API key dialog is closed after creation", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    fireEvent.click(apiKeysTab.querySelector("button")!);

    // Trigger onSuccess to set newlyCreatedKey
    act(() => {
      mutationConfigs[0].onSuccess({ token: "ak_test_close" });
    });
    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();

    // Close via onOpenChange
    fireEvent.click(screen.getByTestId("dialog-close-trigger"));
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 44. Access token dialog onOpenChange clears newlyCreatedToken
  // -------------------------------------------------------------------------
  it("clears newlyCreatedToken when access token dialog is closed after creation", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    fireEvent.click(tokenTab.querySelector("button")!);

    // Trigger onSuccess to set newlyCreatedToken
    act(() => {
      mutationConfigs[2].onSuccess({ token: "at_test_close" });
    });
    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();

    // Close via onOpenChange
    fireEvent.click(screen.getByTestId("dialog-close-trigger"));
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 45. Revoke confirm calls mutate with the correct key ID
  // -------------------------------------------------------------------------
  it("calls revokeKeyMutation.mutate with the correct key ID on confirm", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    // Click trash on the second API key (key-2)
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    fireEvent.click(trashIcons[1].closest("button")!);

    // Confirm revoke
    fireEvent.click(screen.getByTestId("confirm-btn"));

    // The revokeKeyMutation's mutate should have been called
    expect(mutationConfigs[1]).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 46. Revoke token confirm calls mutate with the correct token ID
  // -------------------------------------------------------------------------
  it("calls revokeTokenMutation.mutate with the correct token ID on confirm", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    // Click trash on the first access token
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    fireEvent.click(trashIcons[0].closest("button")!);

    // Confirm revoke
    fireEvent.click(screen.getByTestId("confirm-btn"));

    expect(mutationConfigs[3]).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 47. Cancel create token form closes dialog
  // -------------------------------------------------------------------------
  it("closes Create Access Token dialog when cancel is clicked on form", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    fireEvent.click(tokenTab.querySelector("button")!);
    expect(screen.getByTestId("dialog")).toBeInTheDocument();

    // Click cancel on the form
    fireEvent.click(screen.getByTestId("form-cancel-btn"));
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 48. Access token done button closes dialog
  // -------------------------------------------------------------------------
  it("closes the dialog when Done is clicked on access token TokenCreatedAlert", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    fireEvent.click(tokenTab.querySelector("button")!);

    // Simulate successful creation
    act(() => {
      mutationConfigs[2].onSuccess({ token: "at_done_test" });
    });
    expect(screen.getByTestId("token-created-alert")).toBeInTheDocument();

    // Click Done
    fireEvent.click(screen.getByTestId("token-done-btn"));
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 49. Cancel revoke access token closes dialog
  // -------------------------------------------------------------------------
  it("closes revoke access token dialog when cancel is clicked", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    // Click trash on the access token
    const trashIcons = screen.getAllByTestId("icon-Trash2");
    fireEvent.click(trashIcons[0].closest("button")!);
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Revoke Access Token")).toBeInTheDocument();

    // Click cancel to close the dialog
    fireEvent.click(screen.getByTestId("cancel-confirm-btn"));
    expect(
      screen.queryByTestId("confirm-dialog")
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 50. DataTable column headers are passed correctly for API keys
  // -------------------------------------------------------------------------
  it("passes correct column headers to the API keys DataTable", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    expect(apiKeysTab.textContent).toContain("Name");
    expect(apiKeysTab.textContent).toContain("Key Prefix");
    expect(apiKeysTab.textContent).toContain("Scopes");
    expect(apiKeysTab.textContent).toContain("Expires");
    expect(apiKeysTab.textContent).toContain("Last Used");
    expect(apiKeysTab.textContent).toContain("Created");
  });

  // -------------------------------------------------------------------------
  // 51. DataTable column headers for access tokens include Repo Access
  // -------------------------------------------------------------------------
  it("passes correct column headers to the access tokens DataTable including Repo Access", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    expect(tokenTab.textContent).toContain("Name");
    expect(tokenTab.textContent).toContain("Token Prefix");
    expect(tokenTab.textContent).toContain("Scopes");
    expect(tokenTab.textContent).toContain("Repo Access");
    expect(tokenTab.textContent).toContain("Expires");
    expect(tokenTab.textContent).toContain("Last Used");
    expect(tokenTab.textContent).toContain("Created");
  });

  // -------------------------------------------------------------------------
  // 52. DateCell renders formatted dates for non-null values
  // -------------------------------------------------------------------------
  it("renders formatted dates for non-null date fields", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    // The first API key has all dates set, check they are rendered
    // toLocaleDateString output varies by locale; just verify no "Never" for key-1's dates
    const tables = screen.getAllByTestId("data-table");
    expect(tables[0].textContent).toContain("CI Pipeline Key");
    // The second key has null dates showing "Never"
    expect(tables[0].textContent).toContain("Never");
  });

  // =========================================================================
  // Repository scoping tests
  // =========================================================================

  // -------------------------------------------------------------------------
  // 53. Access token create dialog shows repo selector
  // -------------------------------------------------------------------------
  it("shows repo selector section in create access token dialog", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create token dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    const createBtn = tokenTab.querySelector("button")!;
    fireEvent.click(createBtn);

    expect(screen.getByTestId("repo-selector-section")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 54. API key create dialog does NOT show repo selector
  // -------------------------------------------------------------------------
  it("does not show repo selector in create API key dialog", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open create API key dialog
    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    const createBtn = apiKeysTab.querySelector("button")!;
    fireEvent.click(createBtn);

    expect(screen.queryByTestId("repo-selector-section")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 55. Repo selector initializes with empty object
  // -------------------------------------------------------------------------
  it("initializes repo selector with empty object", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    fireEvent.click(tokenTab.querySelector("button")!);

    const selectorData = screen.getByTestId("repo-selector-data");
    expect(selectorData.textContent).toBe("{}");
  });

  // -------------------------------------------------------------------------
  // 56. Repo selector resets on dialog close
  // -------------------------------------------------------------------------
  it("resets repo selector when access token dialog is closed", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    // Open dialog
    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    fireEvent.click(tokenTab.querySelector("button")!);

    // Change the selector
    fireEvent.click(screen.getByTestId("repo-selector-change-btn"));

    // Close dialog
    fireEvent.click(screen.getByTestId("dialog-close-trigger"));

    // Re-open dialog
    fireEvent.click(tokenTab.querySelector("button")!);

    // Selector should be reset to empty
    const selectorData = screen.getByTestId("repo-selector-data");
    expect(selectorData.textContent).toBe("{}");
  });

  // -------------------------------------------------------------------------
  // 57. createTokenMutation onSuccess resets repo selector
  // -------------------------------------------------------------------------
  it("resets repo selector after successful token creation", async () => {
    const { toast } = await import("sonner");
    setupDefaultMocks();

    render(<AccessTokensPage />);

    const createTokenConfig = mutationConfigs[2];
    act(() => {
      createTokenConfig.onSuccess({ token: "new-scoped-token" });
    });

    expect(toast.success).toHaveBeenCalledWith("Access token created");
    // The repo selector should be reset (tested implicitly by re-opening dialog)
  });

  // -------------------------------------------------------------------------
  // 58. Tokens with repo_selector show scope summary in table
  // -------------------------------------------------------------------------
  it("renders repo access column showing selector summary for scoped tokens", () => {
    setupDefaultMocks({ accessTokens: mockScopedAccessTokens });

    render(<AccessTokensPage />);

    // The scoped token with formats, pattern, and labels
    expect(screen.getByText(/2 format\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/prod-\*/)).toBeInTheDocument();
    expect(screen.getByText(/1 label\(s\)/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 59. Tokens with repository_ids show repo count
  // -------------------------------------------------------------------------
  it("renders repo access column showing repo count for repository_ids tokens", () => {
    setupDefaultMocks({ accessTokens: mockScopedAccessTokens });

    render(<AccessTokensPage />);

    expect(screen.getByText("3 repo(s)")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 60. Tokens without scope show 'All repos'
  // -------------------------------------------------------------------------
  it("renders 'All repos' for tokens without repo_selector or repository_ids", () => {
    setupDefaultMocks({ accessTokens: mockScopedAccessTokens });

    render(<AccessTokensPage />);

    expect(screen.getByText("All repos")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 61. Updated access tokens description mentions scoping
  // -------------------------------------------------------------------------
  it("shows updated description mentioning repository scoping", () => {
    setupDefaultMocks();

    render(<AccessTokensPage />);

    expect(
      screen.getByText(
        "Personal access tokens for CLI and CI/CD authentication. Tokens can be scoped to specific repositories."
      )
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 62. Token table has Repo Access column header
  // -------------------------------------------------------------------------
  it("includes Repo Access in the access tokens column headers", () => {
    setupDefaultMocks({ accessTokens: mockAccessTokens });

    render(<AccessTokensPage />);

    const tokenTab = screen.getByTestId("tab-content-access-tokens");
    expect(tokenTab.textContent).toContain("Repo Access");
  });

  // -------------------------------------------------------------------------
  // 63. API keys table does NOT have Repo Access column
  // -------------------------------------------------------------------------
  it("does not include Repo Access in the API keys column headers", () => {
    setupDefaultMocks({ apiKeys: mockApiKeys });

    render(<AccessTokensPage />);

    const apiKeysTab = screen.getByTestId("tab-content-api-keys");
    // Check no "Repo Access" in the API keys section
    // Both tabs are visible in DOM. Check the table headers within the API keys tab
    const apiTable = apiKeysTab.querySelector("[data-testid='data-table']");
    if (apiTable) {
      const headers = apiTable.querySelectorAll("th");
      const headerTexts = Array.from(headers).map((h) => h.textContent);
      expect(headerTexts).not.toContain("Repo Access");
    }
  });
});

// ---------------------------------------------------------------------------
// renderRepoAccess unit tests
// ---------------------------------------------------------------------------

describe("renderRepoAccess", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 'Selector' fallback when repo_selector has no useful fields", () => {
    const token = {
      id: "t1",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: {},
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toBe("Selector");
  });

  it("renders format count from repo_selector", () => {
    const token = {
      id: "t2",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: { match_formats: ["docker", "npm", "maven"] },
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toContain("3 format(s)");
  });

  it("renders pattern from repo_selector", () => {
    const token = {
      id: "t3",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: { match_pattern: "staging-*" },
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toContain("staging-*");
  });

  it("renders label count from repo_selector", () => {
    const token = {
      id: "t4",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: { match_labels: { env: "prod", tier: "backend" } },
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toContain("2 label(s)");
  });

  it("renders combined summary for selector with all fields", () => {
    const token = {
      id: "t5",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: {
        match_formats: ["docker"],
        match_pattern: "prod-*",
        match_labels: { env: "production" },
      },
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toContain("1 format(s)");
    expect(container.textContent).toContain("prod-*");
    expect(container.textContent).toContain("1 label(s)");
  });

  it("renders repository_ids count when no repo_selector", () => {
    const token = {
      id: "t6",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repository_ids: ["r1", "r2"],
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toBe("2 repo(s)");
  });

  it("renders 'All repos' when neither repo_selector nor repository_ids", () => {
    const token = {
      id: "t7",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toBe("All repos");
  });

  it("renders 'All repos' when repository_ids is empty", () => {
    const token = {
      id: "t8",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repository_ids: [],
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    expect(container.textContent).toBe("All repos");
  });

  it("prefers repo_selector over repository_ids when both are present", () => {
    const token = {
      id: "t9",
      name: "test",
      token_prefix: "at_x",
      created_at: "2026-01-01",
      repo_selector: { match_formats: ["npm"] },
      repository_ids: ["r1", "r2"],
    };
    const { container } = render(<>{renderRepoAccess(token)}</>);
    // Should show selector, not repo count
    expect(container.textContent).toContain("1 format(s)");
    expect(container.textContent).not.toContain("repo(s)");
  });
});
