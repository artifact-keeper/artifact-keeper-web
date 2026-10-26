// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import React from "react";
import type { SsoProvider } from "@/types/sso";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/image", () => {
  const MockImage = (props: any) => <img alt="" {...props} />;
  MockImage.displayName = "MockImage";
  return { default: MockImage };
});

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    Loader2: stub("Loader2"),
    Lock: stub("Lock"),
    LogIn: stub("LogIn"),
    Shield: stub("Shield"),
    Terminal: stub("Terminal"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => {
  const MockInput = React.forwardRef((props: any, ref: any) => (
    <input ref={ref} {...props} />
  ));
  MockInput.displayName = "MockInput";
  return { Input: MockInput };
});

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, ...props }: any) => (
    <div role="alert" {...props}>
      {children}
    </div>
  ),
  AlertTitle: ({ children }: any) => <strong>{children}</strong>,
  AlertDescription: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

const mockLogin = vi.fn();
const mockRefreshUser = vi.fn();
const mockVerifyTotp = vi.fn();
const mockClearTotpRequired = vi.fn();

let authState = {
  login: mockLogin,
  refreshUser: mockRefreshUser,
  setupRequired: false,
  totpRequired: false,
  verifyTotp: mockVerifyTotp,
  clearTotpRequired: mockClearTotpRequired,
};

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => authState,
}));

// Public runtime config. `auth.local_login_enabled` is what decides whether the
// local credentials form renders (issue #615).
let systemConfigState = {
  config: { auth: { local_login_enabled: true } },
  isLoading: false,
  isError: false,
};

vi.mock("@/providers/system-config-provider", () => ({
  useSystemConfig: () => systemConfigState,
}));

const { mockListProviders, mockLdapLogin } = vi.hoisted(() => ({
  mockListProviders: vi.fn().mockResolvedValue([]),
  mockLdapLogin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api/sso", () => ({
  ssoApi: {
    listProviders: mockListProviders,
    ldapLogin: mockLdapLogin,
  },
}));

// Import under test (after mocks)
import LoginPage, { resolveSelectedProvider } from "../login/page";

// Helpers --------------------------------------------------------------------

const oidcProvider: SsoProvider = {
  id: "oidc-1",
  name: "Corp SSO",
  provider_type: "oidc",
  login_url: "/api/v1/auth/sso/oidc/oidc-1/login",
};

const samlProvider: SsoProvider = {
  id: "saml-1",
  name: "Corp SAML",
  provider_type: "saml",
  login_url: "/api/v1/auth/sso/saml/saml-1/login",
};

const ldapProvider: SsoProvider = {
  id: "ldap-1",
  name: "Corp LDAP",
  provider_type: "ldap",
  login_url: "",
};

async function renderAndWaitForProviders(): Promise<void> {
  await act(async () => {
    render(<LoginPage />);
  });
  // Allow the useEffect that calls listProviders to flush.
  await waitFor(() => {
    expect(mockListProviders).toHaveBeenCalled();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage username/password form visibility", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockClear();
    mockRefreshUser.mockClear();
    mockVerifyTotp.mockClear();
    mockClearTotpRequired.mockClear();
    mockListProviders.mockReset();
    mockLdapLogin.mockReset();
    authState = {
      login: mockLogin,
      refreshUser: mockRefreshUser,
      setupRequired: false,
      totpRequired: false,
      verifyTotp: mockVerifyTotp,
      clearTotpRequired: mockClearTotpRequired,
    };
    systemConfigState = {
      config: { auth: { local_login_enabled: true } },
      isLoading: false,
      isError: false,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides username/password form when the backend reports local login disabled (regression for #350)", async () => {
    mockListProviders.mockResolvedValue([oidcProvider]);
    systemConfigState.config.auth.local_login_enabled = false;

    await renderAndWaitForProviders();

    // The OIDC button must still render so users can sign in.
    await waitFor(() => {
      expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
    });

    // The username and password fields should not be in the DOM at all,
    // because no auth method that consumes them is enabled.
    expect(
      screen.queryByPlaceholderText("Enter your username")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter your password")
    ).not.toBeInTheDocument();
    // The local "Sign In" submit button should also be hidden.
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument();
  });

  it("shows username/password form under OIDC when the operator enabled local admin login (#615)", async () => {
    // ALLOW_LOCAL_ADMIN_LOGIN=true alongside an OIDC provider: the break-glass
    // admin account still needs the credentials form.
    mockListProviders.mockResolvedValue([oidcProvider]);
    systemConfigState.config.auth.local_login_enabled = true;

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("Enter your password")
    ).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    // The OIDC button renders alongside it.
    expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
  });

  it("hides username/password form when only SAML is configured and local login is disabled", async () => {
    mockListProviders.mockResolvedValue([samlProvider]);
    systemConfigState.config.auth.local_login_enabled = false;

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(screen.getByText(/Sign in with Corp SAML/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByPlaceholderText("Enter your username")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter your password")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument();
  });

  it("shows username/password form for LDAP even when local login is disabled", async () => {
    // LDAP is independent of the local-login policy: the form is how LDAP
    // credentials are entered, so it renders whenever an LDAP provider exists.
    mockListProviders.mockResolvedValue([oidcProvider, ldapProvider]);
    systemConfigState.config.auth.local_login_enabled = false;

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("Enter your password")
    ).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
  });

  it("shows username/password form when no SSO is configured (local-only)", async () => {
    mockListProviders.mockResolvedValue([]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("Enter your password")
    ).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("shows username/password form when first-time setup is required, even if local login is disabled", async () => {
    mockListProviders.mockResolvedValue([oidcProvider]);
    systemConfigState.config.auth.local_login_enabled = false;
    authState.setupRequired = true;

    await renderAndWaitForProviders();

    // The admin still needs the local form to complete first-time setup.
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("Enter your password")
    ).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    // OIDC button should still render alongside.
    expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
  });

  it("shows the form when ?fallback=local is in the URL (operator escape hatch)", async () => {
    mockListProviders.mockResolvedValue([oidcProvider]);
    systemConfigState.config.auth.local_login_enabled = false;
    // Simulate an operator hitting /login?fallback=local to force the form open
    // when the reported config is stale or the config endpoint is misbehaving.
    // Harmless: the backend rejects the sign-in if local login really is off.
    mockSearchParams = new URLSearchParams("?fallback=local");

    try {
      await renderAndWaitForProviders();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Enter your username")
        ).toBeInTheDocument();
      });
      expect(
        screen.getByPlaceholderText("Enter your password")
      ).toBeInTheDocument();
    } finally {
      mockSearchParams = new URLSearchParams();
    }
  });

  it("shows a loading indicator while SSO providers are being fetched", async () => {
    // Hold the providers fetch open so we can observe the loading state.
    let resolve: ((v: SsoProvider[]) => void) | null = null;
    mockListProviders.mockReturnValueOnce(
      new Promise<SsoProvider[]>((r) => {
        resolve = r;
      })
    );

    await act(async () => {
      render(<LoginPage />);
    });

    // While loading: no form visible, loading indicator present.
    expect(
      screen.queryByPlaceholderText("Enter your username")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("icon-Loader2")).toBeInTheDocument();

    // Resolve and verify form decision happens after.
    systemConfigState.config.auth.local_login_enabled = false;
    await act(async () => {
      resolve?.([oidcProvider]);
    });
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Enter your username")
      ).not.toBeInTheDocument();
    });
  });

  it("shows the form via ?fallback=local even while the system config request hangs", async () => {
    // A hung (not failed) config request leaves isLoading true forever. The
    // escape hatch has to work in exactly that situation, so it must sit
    // outside the loading gate rather than behind it.
    mockListProviders.mockResolvedValue([oidcProvider]);
    systemConfigState.isLoading = true;
    systemConfigState.config.auth.local_login_enabled = false;
    mockSearchParams = new URLSearchParams("?fallback=local");

    try {
      await renderAndWaitForProviders();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Enter your username")
        ).toBeInTheDocument();
      });
      expect(
        screen.getByPlaceholderText("Enter your password")
      ).toBeInTheDocument();
    } finally {
      mockSearchParams = new URLSearchParams();
    }
  });

  it("shows the form via ?fallback=local even while the SSO provider list hangs", async () => {
    // Same reasoning for the other half of the gate: listProviders is also an
    // unbounded request.
    mockListProviders.mockReturnValue(new Promise<SsoProvider[]>(() => {}));
    systemConfigState.config.auth.local_login_enabled = false;
    mockSearchParams = new URLSearchParams("?fallback=local");

    try {
      await act(async () => {
        render(<LoginPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Enter your username")
        ).toBeInTheDocument();
      });
    } finally {
      mockSearchParams = new URLSearchParams();
    }
  });

  it("shows a loading indicator while the system config is still in flight", async () => {
    // The form decision depends on auth.local_login_enabled, so rendering it
    // before the config lands would flash a form that then disappears.
    mockListProviders.mockResolvedValue([]);
    systemConfigState.isLoading = true;

    await renderAndWaitForProviders();

    expect(
      screen.queryByPlaceholderText("Enter your username")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("icon-Loader2")).toBeInTheDocument();
  });
});

const secondLdapProvider: SsoProvider = {
  id: "ldap-2",
  name: "Partner LDAP",
  provider_type: "ldap",
  login_url: "",
};

describe("LoginPage LDAP tabs when local login is disabled (#899)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockReset();
    mockRefreshUser.mockReset();
    mockListProviders.mockReset();
    mockLdapLogin.mockReset().mockResolvedValue(undefined);
    mockSearchParams = new URLSearchParams();
    authState = { ...authState, setupRequired: false, totpRequired: false };
    systemConfigState = {
      config: { auth: { local_login_enabled: false } },
      isLoading: false,
      isError: false,
    };
  });

  afterEach(() => {
    cleanup();
    mockSearchParams = new URLSearchParams();
  });

  async function submitCredentials() {
    fireEvent.change(screen.getByPlaceholderText("Enter your username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "secret" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In"));
    });
  }

  it("with one LDAP provider: no tab bar, no Local tab, and the form signs in through LDAP", async () => {
    mockListProviders.mockResolvedValue([ldapProvider]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByText("Sign in with your Corp LDAP account"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("Local")).not.toBeInTheDocument();

    await submitCredentials();
    await waitFor(() => {
      expect(mockLdapLogin).toHaveBeenCalledWith("ldap-1", "alice", "secret");
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("with several LDAP providers: tabs for each, the first selected, no Local tab", async () => {
    mockListProviders.mockResolvedValue([ldapProvider, secondLdapProvider]);

    await renderAndWaitForProviders();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Corp LDAP",
      "Partner LDAP",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    fireEvent.click(tabs[1]);
    expect(screen.getByRole("tab", { name: "Partner LDAP" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await submitCredentials();
    await waitFor(() => {
      expect(mockLdapLogin).toHaveBeenCalledWith("ldap-2", "alice", "secret");
    });
  });

  it("keeps Local as the default tab when local login is enabled", async () => {
    systemConfigState.config.auth.local_login_enabled = true;
    mockListProviders.mockResolvedValue([ldapProvider]);

    await renderAndWaitForProviders();

    const local = await screen.findByRole("tab", { name: "Local" });
    expect(local).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Corp LDAP" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("offers a 'Sign in with a local account' link to ?fallback=local when only LDAP forms are shown (#4857)", async () => {
    mockListProviders.mockResolvedValue([ldapProvider]);

    await renderAndWaitForProviders();

    const link = await screen.findByText("Sign in with a local account");
    fireEvent.click(link);
    expect(mockPush).toHaveBeenCalledWith("/login?fallback=local");
  });

  it("does not show the local-account link when local login is already offered (#4857)", async () => {
    systemConfigState.config.auth.local_login_enabled = true;
    mockListProviders.mockResolvedValue([ldapProvider]);

    await renderAndWaitForProviders();

    await screen.findByRole("tab", { name: "Local" });
    expect(
      screen.queryByText("Sign in with a local account"),
    ).not.toBeInTheDocument();
  });

  it("?fallback=local brings the Local tab back, selected, next to LDAP", async () => {
    mockSearchParams = new URLSearchParams("?fallback=local");
    mockListProviders.mockResolvedValue([ldapProvider]);

    await renderAndWaitForProviders();

    const local = await screen.findByRole("tab", { name: "Local" });
    expect(local).toHaveAttribute("aria-selected", "true");
    await submitCredentials();
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("alice", "secret");
    });
    expect(mockLdapLogin).not.toHaveBeenCalled();
  });
});

describe("resolveSelectedProvider (#899)", () => {
  const ldap = [ldapProvider, secondLdapProvider];

  it("defaults to Local when local login is offered", () => {
    expect(resolveSelectedProvider(null, true, ldap)).toEqual({ type: "local" });
  });

  it("defaults to the first LDAP provider when local login is not offered", () => {
    expect(resolveSelectedProvider(null, false, ldap)).toEqual({
      type: "ldap",
      id: "ldap-1",
      name: "Corp LDAP",
    });
  });

  it("keeps the user's LDAP choice while that provider exists", () => {
    const chosen = { type: "ldap" as const, id: "ldap-2", name: "Partner LDAP" };
    expect(resolveSelectedProvider(chosen, false, ldap)).toBe(chosen);
    expect(resolveSelectedProvider(chosen, false, [ldapProvider])).toEqual({
      type: "ldap",
      id: "ldap-1",
      name: "Corp LDAP",
    });
  });

  it("drops a Local choice that is no longer offered", () => {
    expect(resolveSelectedProvider({ type: "local" }, false, ldap)).toEqual({
      type: "ldap",
      id: "ldap-1",
      name: "Corp LDAP",
    });
  });

  it("falls back to Local when there is no LDAP provider", () => {
    expect(resolveSelectedProvider(null, false, [])).toEqual({ type: "local" });
  });
});
