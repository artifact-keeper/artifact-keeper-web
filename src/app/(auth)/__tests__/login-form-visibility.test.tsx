// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
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
import LoginPage from "../login/page";

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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides username/password form when only OIDC is configured (regression for #350)", async () => {
    mockListProviders.mockResolvedValue([oidcProvider]);

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

  it("hides username/password form when only SAML is configured", async () => {
    mockListProviders.mockResolvedValue([samlProvider]);

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

  it("shows username/password form when LDAP is configured (even if OIDC is also)", async () => {
    mockListProviders.mockResolvedValue([oidcProvider, ldapProvider]);

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

  it("shows username/password form when first-time setup is required, even if only OIDC is configured", async () => {
    mockListProviders.mockResolvedValue([oidcProvider]);
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
    // Simulate operator hitting /login?fallback=local to recover when admin
    // bypass is enabled but no LDAP provider is configured.
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
    await act(async () => {
      resolve?.([oidcProvider]);
    });
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Enter your username")
      ).not.toBeInTheDocument();
    });
  });
});
