/**
 * @vitest-environment jsdom
 *
 * Regression test for #406 — "Changing OIDC settings in the frontend
 * overwrites OIDC settings that are already in the db".
 *
 * The bug: when an OIDC provider has `attribute_mapping` entries beyond
 * the five inputs rendered by the form (username, email, display_name,
 * groups, admin_group), the edit-save flow rebuilds `attribute_mapping`
 * from scratch using only the form state and PUTs that to the backend,
 * silently discarding the additional mapping keys (e.g. anything set via
 * env vars or by a previous version of the UI).
 *
 * This test mounts the SSO page, opens the edit dialog on a provider
 * whose attribute_mapping contains an extra "custom_claim" key the form
 * does NOT render, changes only the Name field, submits, and asserts
 * the outbound update payload preserves that extra mapping key (or, as
 * a valid alternative, the update is sent as a partial that does not
 * include attribute_mapping at all — true PATCH semantics).
 *
 * Either outcome would fix the user-visible bug. The current code
 * does neither — it sends a fully-rebuilt attribute_mapping containing
 * only the five form-rendered keys — so this test FAILS on main.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSsoApi = {
  listProviders: vi.fn(),
  listOidc: vi.fn(),
  getOidc: vi.fn(),
  createOidc: vi.fn(),
  updateOidc: vi.fn(),
  deleteOidc: vi.fn(),
  enableOidc: vi.fn(),
  disableOidc: vi.fn(),
  listLdap: vi.fn(),
  getLdap: vi.fn(),
  createLdap: vi.fn(),
  updateLdap: vi.fn(),
  deleteLdap: vi.fn(),
  enableLdap: vi.fn(),
  disableLdap: vi.fn(),
  testLdap: vi.fn(),
  ldapLogin: vi.fn(),
  listSaml: vi.fn(),
  getSaml: vi.fn(),
  createSaml: vi.fn(),
  updateSaml: vi.fn(),
  deleteSaml: vi.fn(),
  enableSaml: vi.fn(),
  disableSaml: vi.fn(),
  exchangeCode: vi.fn(),
};
vi.mock("@/lib/api/sso", () => ({
  ssoApi: mockSsoApi,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (e: unknown) => String(e),
  mutationErrorToast: () => () => {},
}));

// Mocked UI primitives so the dialog/tabs render predictably in jsdom.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  );
  return {
    Select,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked ?? false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = {
  id: "user-1",
  username: "admin",
  email: "admin@example.com",
  display_name: "Admin",
  is_admin: true,
};

/**
 * An OIDC provider whose `attribute_mapping` contains a key the form does
 * NOT render — `custom_claim`. The bug: editing & saving will drop this.
 */
const OIDC_WITH_EXTRA_MAPPING = {
  id: "oidc-1",
  name: "Corporate IdP",
  issuer_url: "https://idp.example.com",
  client_id: "client-abc",
  has_secret: true,
  scopes: ["openid", "profile", "email"],
  attribute_mapping: {
    username: "preferred_username",
    email: "email",
    display_name: "name",
    groups: "groups",
    admin_group: "artifact-keeper-admins",
    // Key the UI does NOT expose — must be preserved across an update.
    custom_claim: "department_code",
  },
  auto_create_users: true,
  is_enabled: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

let SsoSettingsPage: React.ComponentType;

async function renderPage() {
  const qc = newQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SsoSettingsPage />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: ADMIN_USER });
  mockSsoApi.listOidc.mockResolvedValue([OIDC_WITH_EXTRA_MAPPING]);
  mockSsoApi.listLdap.mockResolvedValue([]);
  mockSsoApi.listSaml.mockResolvedValue([]);
  mockSsoApi.updateOidc.mockResolvedValue(OIDC_WITH_EXTRA_MAPPING);

  // Lazy-import the page so all vi.mocks are applied first.
  const mod = await import("../page");
  SsoSettingsPage = mod.default;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SSO OIDC update preserves attribute_mapping (regression #406)", () => {
  it("preserves attribute_mapping entries the form does not render when only the name is changed", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Wait for the provider name to appear in the table.
    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    // Open the edit dialog via its aria-label.
    const editBtn = screen.getByRole("button", {
      name: /Edit OIDC provider Corporate IdP/i,
    });
    await user.click(editBtn);

    // Dialog open — confirm by title.
    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    // Change only the Name field.
    const nameInput = screen.getByLabelText(/^Name$/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Corporate IdP (renamed)");

    // Submit.
    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    // The update must have been invoked.
    await waitFor(() => {
      expect(mockSsoApi.updateOidc).toHaveBeenCalledTimes(1);
    });

    const [id, payload] = mockSsoApi.updateOidc.mock.calls[0] as [
      string,
      { name?: string; attribute_mapping?: Record<string, string> },
    ];
    expect(id).toBe("oidc-1");
    expect(payload.name).toBe("Corporate IdP (renamed)");

    // Either of the following counts as "doesn't overwrite":
    //  (a) PATCH semantics — attribute_mapping is not sent at all.
    //  (b) Full update — but the extra `custom_claim` key is preserved.
    const mapping = payload.attribute_mapping;
    if (mapping !== undefined) {
      expect(mapping).toMatchObject({
        custom_claim: "department_code",
      });
    }
    // If mapping is undefined we accept that as PATCH semantics — pass.
  });
});
