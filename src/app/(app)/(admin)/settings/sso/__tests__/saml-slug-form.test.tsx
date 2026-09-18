/**
 * @vitest-environment jsdom
 *
 * #856 — SAML provider slug and slug-based login/ACS URLs (backend 1.10.0,
 * artifact-keeper#2583).
 *
 * Covers the SAML tab's side of the feature: the optional Slug input and its
 * pattern validation, the copyable login/ACS URLs (built from the slug when
 * set and from the provider id otherwise), and the duplicate-slug 409 landing
 * on the field that collided rather than in a toast.
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
vi.mock("@/lib/api/sso", () => ({ ssoApi: mockSsoApi }));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
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
  ConfirmDialog: () => null,
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

const SAML_BASE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Corporate SAML IdP",
  slug: null as string | null,
  entity_id: "urn:example:idp",
  sso_url: "https://idp.example.com/sso",
  slo_url: null,
  sp_entity_id: "urn:artifact-keeper",
  name_id_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  has_certificate: true,
  attribute_mapping: {
    username: "username",
    email: "email",
    display_name: "displayName",
    groups: "groups",
  },
  admin_group: null,
  sign_requests: false,
  require_signed_assertions: true,
  use_absolute_acs_url: false,
  map_groups_to_groups: false,
  is_enabled: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const SAML_WITH_SLUG = { ...SAML_BASE, slug: "okta-prod" };

const ACS_PREFIX = `${window.location.origin}/api/v1/auth/sso/saml`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let SsoSettingsPage: React.ComponentType;

async function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SsoSettingsPage />
    </QueryClientProvider>,
  );
}

/** Open the SAML edit dialog for the seeded provider. */
async function openSamlEdit(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByText("Corporate SAML IdP")).toBeTruthy();
  });
  await user.click(
    screen.getByRole("button", { name: /Edit SAML provider Corporate SAML IdP/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Edit SAML Provider")).toBeTruthy();
  });
}

function slugInput() {
  return screen.getByLabelText(/Slug \(optional\)/i) as HTMLInputElement;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: ADMIN_USER });
  mockSsoApi.listOidc.mockResolvedValue([]);
  mockSsoApi.listLdap.mockResolvedValue([]);
  mockSsoApi.listSaml.mockResolvedValue([SAML_WITH_SLUG]);
  mockSsoApi.updateSaml.mockResolvedValue(SAML_WITH_SLUG);
  mockSsoApi.createSaml.mockResolvedValue(SAML_WITH_SLUG);

  const mod = await import("../page");
  SsoSettingsPage = mod.default;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SAML slug field (#856)", () => {
  it("lists the slug and prefills it in the edit dialog", async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("okta-prod")).toBeTruthy();
    });

    await openSamlEdit(user);
    expect(slugInput().value).toBe("okta-prod");
  });

  it("shows login and ACS URLs built from the slug, and re-derives them as it is edited", async () => {
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    expect(screen.getByText(`${ACS_PREFIX}/okta-prod/login`)).toBeTruthy();
    expect(screen.getByText(`${ACS_PREFIX}/okta-prod/acs`)).toBeTruthy();

    await user.clear(slugInput());
    await user.type(slugInput(), "entra");
    expect(screen.getByText(`${ACS_PREFIX}/entra/acs`)).toBeTruthy();
  });

  it("falls back to the provider id when no slug is set", async () => {
    mockSsoApi.listSaml.mockResolvedValue([SAML_BASE]);
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    expect(slugInput().value).toBe("");
    expect(screen.getByText(`${ACS_PREFIX}/${SAML_BASE.id}/acs`)).toBeTruthy();
  });

  it("offers a copy affordance for each URL", async () => {
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    expect(screen.getByRole("button", { name: /Copy ACS URL/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy Login URL/i })).toBeTruthy();
  });

  it("rejects a slug the backend would refuse and blocks the save", async () => {
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    await user.clear(slugInput());
    await user.type(slugInput(), "Okta Prod");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/lowercase/);
    expect(
      (screen.getByRole("button", { name: /Save Changes/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mockSsoApi.updateSaml).not.toHaveBeenCalled();
  });

  it("sends the slug on save and omits it when the field is blank", async () => {
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    await user.clear(slugInput());
    await user.type(slugInput(), "entra");
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(1));
    expect(mockSsoApi.updateSaml.mock.calls[0][1].slug).toBe("entra");

    // Blank means "leave the stored slug alone", so the key must be absent
    // rather than sent as an empty string the backend would reject.
    await openSamlEdit(user);
    await user.clear(slugInput());
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(mockSsoApi.updateSaml).toHaveBeenCalledTimes(2));
    expect(mockSsoApi.updateSaml.mock.calls[1][1].slug).toBeUndefined();
  });

  it("maps a duplicate-slug 409 to a field error instead of a toast", async () => {
    mockSsoApi.updateSaml.mockRejectedValue({
      code: "CONFLICT",
      message: "SAML slug 'entra' is already used by another SAML configuration",
    });
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    await user.clear(slugInput());
    await user.type(slugInput(), "entra");
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already used by another SAML configuration/);
    expect(mockToastError).not.toHaveBeenCalled();
    // The dialog stays open on the offending field.
    expect(slugInput().value).toBe("entra");
  });

  it("maps a duplicate-name 409 to the name field", async () => {
    mockSsoApi.updateSaml.mockRejectedValue({
      code: "CONFLICT",
      message: "a SAML configuration named 'Okta' already exists",
    });
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("id")).toBe("saml-name-error");
    expect(alert.textContent).toMatch(/already exists/);
  });

  it("still toasts a non-conflict write failure", async () => {
    mockSsoApi.updateSaml.mockRejectedValue({
      code: "INTERNAL_ERROR",
      message: "database unavailable",
    });
    const user = userEvent.setup();
    await renderPage();
    await openSamlEdit(user);

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("creates a provider with the slug it was given", async () => {
    // With no SAML providers the tab renders its empty state, whose
    // "Add SAML Provider" button is unambiguous even though the mocked Tabs
    // render the OIDC and LDAP panels alongside it.
    mockSsoApi.listSaml.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add SAML Provider/i })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: /Add SAML Provider/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add SAML Provider" })).toBeTruthy();
    });
    await user.type(screen.getByLabelText(/^Name$/i), "Entra");
    await user.type(slugInput(), "entra");
    await user.type(screen.getByLabelText(/^Entity ID$/i), "urn:entra");
    await user.type(screen.getByLabelText(/^SSO URL$/i), "https://login.example.com/sso");
    await user.type(screen.getByLabelText(/^Certificate$/i), "PEM");
    await user.click(screen.getByRole("button", { name: /Create Provider/i }));

    await waitFor(() => expect(mockSsoApi.createSaml).toHaveBeenCalledTimes(1));
    expect(mockSsoApi.createSaml.mock.calls[0][0].slug).toBe("entra");
  });
});
