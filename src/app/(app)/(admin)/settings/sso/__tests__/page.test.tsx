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
  map_groups_to_groups: false,
  allow_legacy_rsa_keys: false,
  is_enabled: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

/**
 * A SAML provider with the same hazard as the OIDC fixture above. The SAML
 * tab's handleSubmit builds attribute_mapping from only the four form-
 * rendered claim inputs (username/email/display_name/groups), so without
 * a spread of editTarget.attribute_mapping any extra keys (e.g. a
 * department_code claim the backend wrote) get wiped on every save.
 */
const SAML_WITH_EXTRA_MAPPING = {
  id: "saml-1",
  name: "Corporate SAML IdP",
  entity_id: "urn:example:idp",
  sso_url: "https://idp.example.com/sso",
  slo_url: undefined,
  sp_entity_id: "urn:artifact-keeper",
  name_id_format: "emailAddress",
  has_certificate: true,
  attribute_mapping: {
    username: "username",
    email: "email",
    display_name: "displayName",
    groups: "groups",
    // Key the UI does NOT expose — must be preserved across an update.
    custom_claim: "department_code",
  },
  admin_group: "artifact-keeper-admins",
  sign_requests: true,
  require_signed_assertions: true,
  use_absolute_acs_url: false,
  map_groups_to_groups: false,
  is_enabled: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

/**
 * A SAML provider that already has IdP group mapping switched on. Used to
 * prove the edit dialog reflects the stored value rather than always
 * starting from the create-time default of off (#588).
 */
const SAML_WITH_GROUP_MAPPING_ENABLED = {
  ...SAML_WITH_EXTRA_MAPPING,
  id: "saml-2",
  name: "Group Mapped SAML IdP",
  map_groups_to_groups: true,
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
  mockSsoApi.listSaml.mockResolvedValue([SAML_WITH_EXTRA_MAPPING]);
  mockSsoApi.updateOidc.mockResolvedValue(OIDC_WITH_EXTRA_MAPPING);
  mockSsoApi.updateSaml.mockResolvedValue(SAML_WITH_EXTRA_MAPPING);

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

describe("SSO SAML update preserves attribute_mapping (regression #406 sibling)", () => {
  it("preserves attribute_mapping entries the SAML form does not render when only the name is changed", async () => {
    // Same wholesale-overwrite hazard as the OIDC tab — surfaced during the
    // round-3 adversarial review of PR for #406. SAML's handleSubmit
    // rebuilds attribute_mapping from only the four form-rendered claim
    // inputs (username/email/display_name/groups), so without spreading
    // editTarget.attribute_mapping any extra keys (custom_claim here)
    // get wiped on every save.
    const user = userEvent.setup();
    await renderPage();

    // Wait for the SAML provider name to appear (Tabs mock renders all
    // tab contents inline so the SAML row is in the DOM alongside OIDC).
    await waitFor(() => {
      expect(screen.getByText("Corporate SAML IdP")).toBeTruthy();
    });

    // Open the SAML edit dialog via its aria-label.
    const editBtn = screen.getByRole("button", {
      name: /Edit SAML provider Corporate SAML IdP/i,
    });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    // Change only the Name field — claim mapping inputs left untouched.
    const nameInput = screen.getByLabelText(/^Name$/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Corporate SAML IdP (renamed)");

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(1);
    });

    const [id, payload] = mockSsoApi.updateSaml.mock.calls[0] as [
      string,
      { name?: string; attribute_mapping?: Record<string, string> },
    ];
    expect(id).toBe("saml-1");
    expect(payload.name).toBe("Corporate SAML IdP (renamed)");

    // Either of the following counts as "doesn't overwrite":
    //  (a) PATCH semantics — attribute_mapping is not sent at all.
    //  (b) Full update — but the extra `custom_claim` key is preserved.
    const mapping = payload.attribute_mapping;
    if (mapping !== undefined) {
      expect(mapping).toMatchObject({
        custom_claim: "department_code",
      });
    }
  });
});

describe("SSO OIDC claim keys match backend (#516)", () => {
  it("writes username_claim/email_claim/groups_claim and drops the legacy bare keys", async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", { name: /Edit OIDC provider Corporate IdP/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockSsoApi.updateOidc).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateOidc.mock.calls[0] as [
      string,
      { attribute_mapping?: Record<string, string> },
    ];
    const mapping = payload.attribute_mapping ?? {};

    // Backend (sso.rs::resolve_oidc_claim_name) reads the `_claim` keys.
    expect(mapping.username_claim).toBe("preferred_username");
    expect(mapping.email_claim).toBe("email");
    expect(mapping.groups_claim).toBe("groups");
    expect(mapping.display_name_claim).toBe("name");

    // The legacy bare keys the backend silently ignored must be gone.
    expect(mapping.username).toBeUndefined();
    expect(mapping.email).toBeUndefined();
    expect(mapping.groups).toBeUndefined();
    expect(mapping.display_name).toBeUndefined();

    // Unrelated keys still round-trip (regression #406).
    expect(mapping.custom_claim).toBe("department_code");
  });
});

describe("SSO OIDC map_groups_to_groups toggle (#534)", () => {
  it("sends map_groups_to_groups=true when the operator enables it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit OIDC provider Corporate IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    const mapGroupsToggle = screen.getByLabelText(
      /Map OIDC groups to local groups/i,
    ) as HTMLInputElement;
    // Sourced from the loaded config (fixture: false).
    expect(mapGroupsToggle.checked).toBe(false);
    await user.click(mapGroupsToggle);

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockSsoApi.updateOidc).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateOidc.mock.calls[0] as [
      string,
      { map_groups_to_groups?: boolean },
    ];
    expect(payload.map_groups_to_groups).toBe(true);
  });
});

describe("SSO SAML use_absolute_acs_url toggle (#521)", () => {
  it("sends use_absolute_acs_url=true when the operator enables it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate SAML IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit SAML provider Corporate SAML IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    const acsToggle = screen.getByLabelText(
      /Use absolute ACS URL/i,
    ) as HTMLInputElement;
    expect(acsToggle.checked).toBe(false);
    await user.click(acsToggle);

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateSaml.mock.calls[0] as [
      string,
      { use_absolute_acs_url?: boolean },
    ];
    expect(payload.use_absolute_acs_url).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SAML map_groups_to_groups opt-in (#588, backend#2448)
//
// Mirrors the OIDC toggle from #534. Queries go through role + accessible
// name so the assertions also pin the Label htmlFor -> Switch id wiring that
// gives the control its accessible name; a toggle rendered without that
// association fails these tests rather than silently shipping unlabelled.
// ---------------------------------------------------------------------------

const SAML_MAP_GROUPS_LABEL = /Map IdP groups to Artifact Keeper groups/i;

describe("SSO SAML map_groups_to_groups toggle (#588)", () => {
  it("defaults to off on a new provider and sends map_groups_to_groups=true once enabled", async () => {
    // Empty SAML list so the create flow is reachable by a unique button
    // name ("Add SAML Provider" only renders in the SAML empty state).
    mockSsoApi.listSaml.mockResolvedValue([]);
    mockSsoApi.createSaml.mockResolvedValue(SAML_WITH_GROUP_MAPPING_ENABLED);

    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("No SAML providers configured.")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", { name: /Add SAML Provider/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Add SAML Provider" }),
      ).toBeTruthy();
    });

    const toggle = screen.getByRole("checkbox", {
      name: SAML_MAP_GROUPS_LABEL,
    }) as HTMLInputElement;
    // Default OFF on create.
    expect(toggle.checked).toBe(false);

    // Fill the fields the Create button gates on.
    await user.type(screen.getByLabelText(/^Name$/i), "New SAML IdP");
    await user.type(
      screen.getByLabelText(/^Entity ID$/i),
      "urn:example:new-idp",
    );
    await user.type(
      screen.getByLabelText(/^SSO URL$/i),
      "https://idp.example.com/sso",
    );
    await user.type(screen.getByLabelText(/^Certificate$/i), "cert-pem-body");

    await user.click(toggle);
    expect(toggle.checked).toBe(true);

    await user.click(screen.getByRole("button", { name: /Create Provider/i }));

    await waitFor(() => {
      expect(mockSsoApi.createSaml).toHaveBeenCalledTimes(1);
    });

    const [payload] = mockSsoApi.createSaml.mock.calls[0] as [
      { map_groups_to_groups?: boolean },
    ];
    expect(payload.map_groups_to_groups).toBe(true);
  });

  it("shows the stored value when editing a provider that already has it enabled", async () => {
    // Round-trip check: the toggle must be sourced from SamlConfigResponse,
    // not reset to the create-time default.
    mockSsoApi.listSaml.mockResolvedValue([SAML_WITH_GROUP_MAPPING_ENABLED]);

    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Group Mapped SAML IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit SAML provider Group Mapped SAML IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    const toggle = screen.getByRole("checkbox", {
      name: SAML_MAP_GROUPS_LABEL,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("echoes the stored value back on an edit that does not touch the toggle", async () => {
    // Renaming a provider must not silently switch group mapping off.
    mockSsoApi.listSaml.mockResolvedValue([SAML_WITH_GROUP_MAPPING_ENABLED]);
    mockSsoApi.updateSaml.mockResolvedValue(SAML_WITH_GROUP_MAPPING_ENABLED);

    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Group Mapped SAML IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit SAML provider Group Mapped SAML IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Group Mapped SAML IdP (renamed)");

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(1);
    });

    const [id, payload] = mockSsoApi.updateSaml.mock.calls[0] as [
      string,
      { map_groups_to_groups?: boolean },
    ];
    expect(id).toBe("saml-2");
    expect(payload.map_groups_to_groups).toBe(true);
  });

  it("sends map_groups_to_groups=true when the operator enables it on an existing provider", async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate SAML IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit SAML provider Corporate SAML IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    const toggle = screen.getByRole("checkbox", {
      name: SAML_MAP_GROUPS_LABEL,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateSaml.mock.calls[0] as [
      string,
      { map_groups_to_groups?: boolean },
    ];
    expect(payload.map_groups_to_groups).toBe(true);
  });

  it("explains group matching and per-login reconciliation in the help text", async () => {
    // Operators need to know which assertion attribute drives the mapping
    // and that memberships are reconciled (removals at the IdP propagate).
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate SAML IdP")).toBeTruthy();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Edit SAML provider Corporate SAML IdP/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
    });

    // Resolved by its content, not a test id, so the assertions below fail if
    // the paragraph is reworded rather than silently following a hook.
    const help =
      screen.getByText(/attribute_mapping\.groups/i).textContent ?? "";
    expect(help).toMatch(/auto-created/i);
    expect(help).toMatch(/reconciled on every login/i);
    expect(help).toMatch(/removing a group at the IdP/i);
    // Backend #2759 ownership guard (sso.rs): a name collision with a group
    // this provider did not create returns no row and membership is refused
    // with only a tracing::warn!, so nothing surfaces in the UI. Operators
    // have to learn that from the help text or not at all.
    expect(help).toMatch(/never reused/i);
    expect(help).toMatch(/refused/i);
  });
});

// ---------------------------------------------------------------------------
// OIDC allow_legacy_rsa_keys opt-in (artifact-keeper backend migration 144)
// ---------------------------------------------------------------------------

describe("SSO OIDC allow_legacy_rsa_keys toggle", () => {
  it("preserves the existing allow_legacy_rsa_keys value on an unrelated edit", async () => {
    // Regression: editing an unrelated field (e.g. Name) must not flip the
    // legacy-RSA flag on or off — the toggle's initial state is sourced
    // from the loaded provider, and the submit payload must echo it back.
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    const editBtn = screen.getByRole("button", {
      name: /Edit OIDC provider Corporate IdP/i,
    });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Corporate IdP (renamed)");

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockSsoApi.updateOidc).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateOidc.mock.calls[0] as [
      string,
      { allow_legacy_rsa_keys?: boolean },
    ];
    expect(payload.allow_legacy_rsa_keys).toBe(false);
  });

  it("propagates the toggled value into the update payload", async () => {
    // The toggle starts off (as in the fixture); the operator turns it on
    // because their IdP is a legacy 1024-bit RSA IdP and saves. The
    // outbound payload must carry `true`.
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    const editBtn = screen.getByRole("button", {
      name: /Edit OIDC provider Corporate IdP/i,
    });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    // Flip the new switch on via its label text.
    const toggle = screen.getByLabelText(
      /Allow legacy RSA keys/i,
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    expect(toggle.checked).toBe(true);

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockSsoApi.updateOidc).toHaveBeenCalledTimes(1);
    });

    const [, payload] = mockSsoApi.updateOidc.mock.calls[0] as [
      string,
      { allow_legacy_rsa_keys?: boolean },
    ];
    expect(payload.allow_legacy_rsa_keys).toBe(true);
  });

  it("surfaces the OWASP-baseline warning in the toggle help text", async () => {
    // Reviewers asking "why is this opt-in" should land directly on the
    // amber warning — pin its wording so a future refactor cannot quietly
    // soften it.
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Corporate IdP")).toBeTruthy();
    });

    const editBtn = screen.getByRole("button", {
      name: /Edit OIDC provider Corporate IdP/i,
    });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("Edit OIDC Provider")).toBeTruthy();
    });

    expect(
      screen.getByText(/Below the OWASP ASVS 4\.0 baseline/i),
    ).toBeTruthy();
  });
});
