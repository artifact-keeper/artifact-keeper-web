// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import React from "react";
import type { SsoProvider } from "@/types/sso";

// ---------------------------------------------------------------------------
// Mocks (mirrors login-form-visibility.test.tsx setup)
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
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

const authState = {
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

function makeProvider(
  overrides: Partial<SsoProvider> & Pick<SsoProvider, "provider_type">
): SsoProvider {
  return {
    id: overrides.id ?? `${overrides.provider_type}-1`,
    name: overrides.name ?? "Test",
    provider_type: overrides.provider_type,
    login_url:
      overrides.login_url ??
      `/api/v1/auth/sso/${overrides.provider_type}/${
        overrides.id ?? `${overrides.provider_type}-1`
      }/login`,
  };
}

async function renderAndWaitForProviders(): Promise<void> {
  await act(async () => {
    render(<LoginPage />);
  });
  await waitFor(() => {
    expect(mockListProviders).toHaveBeenCalled();
  });
}

// ---------------------------------------------------------------------------
// Tests — regression for #351 ("Sign in with default" is meaningless)
// ---------------------------------------------------------------------------

describe("LoginPage SSO button label (#351)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockClear();
    mockRefreshUser.mockClear();
    mockVerifyTotp.mockClear();
    mockClearTotpRequired.mockClear();
    mockListProviders.mockReset();
    mockLdapLogin.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders 'Sign in with SSO (OIDC)' instead of 'Sign in with default' for an OIDC provider named 'default'", async () => {
    mockListProviders.mockResolvedValue([
      makeProvider({ provider_type: "oidc", name: "default" }),
    ]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByText(/Sign in with SSO \(OIDC\)/i)
      ).toBeInTheDocument();
    });
    // The bug: button used to say "Sign in with default".
    expect(screen.queryByText(/Sign in with default/i)).not.toBeInTheDocument();
  });

  it("falls back to the generic label for other placeholder names ('primary', 'main', 'sso')", async () => {
    for (const placeholderName of ["primary", "main", "sso"]) {
      mockListProviders.mockResolvedValue([
        makeProvider({
          provider_type: "oidc",
          name: placeholderName,
          id: `oidc-${placeholderName}`,
        }),
      ]);

      await renderAndWaitForProviders();

      await waitFor(() => {
        expect(
          screen.getByText(/Sign in with SSO \(OIDC\)/i)
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByText(new RegExp(`Sign in with ${placeholderName}$`, "i"))
      ).not.toBeInTheDocument();

      cleanup();
      mockListProviders.mockReset();
    }
  });

  it("preserves a real, descriptive provider name", async () => {
    mockListProviders.mockResolvedValue([
      makeProvider({ provider_type: "oidc", name: "Corp SSO" }),
    ]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(screen.getByText("Sign in with Corp SSO")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Sign in with SSO \(OIDC\)/i)
    ).not.toBeInTheDocument();
  });

  it("uses the SAML protocol hint when a SAML provider has a generic name", async () => {
    mockListProviders.mockResolvedValue([
      makeProvider({ provider_type: "saml", name: "default" }),
    ]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByText(/Sign in with SSO \(SAML\)/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Sign in with default/i)).not.toBeInTheDocument();
  });

  it("falls back when the provider name is empty or whitespace", async () => {
    mockListProviders.mockResolvedValue([
      makeProvider({ provider_type: "oidc", name: "   " }),
    ]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByText(/Sign in with SSO \(OIDC\)/i)
      ).toBeInTheDocument();
    });
  });

  it("matches the placeholder name case-insensitively (e.g. 'Default', 'DEFAULT')", async () => {
    mockListProviders.mockResolvedValue([
      makeProvider({ provider_type: "oidc", name: "Default" }),
    ]);

    await renderAndWaitForProviders();

    await waitFor(() => {
      expect(
        screen.getByText(/Sign in with SSO \(OIDC\)/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Sign in with Default")).not.toBeInTheDocument();
  });
});
