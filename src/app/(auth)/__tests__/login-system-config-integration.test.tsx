// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Integration coverage for the login page's local-form decision, wired through
 * the REAL `SystemConfigProvider` and the REAL zod parser with only `fetch`
 * stubbed.
 *
 * The sibling specs all mock `@/providers/system-config-provider` wholesale,
 * which proves the page reacts to `auth.local_login_enabled` but proves nothing
 * about the flag surviving the trip from the wire. That gap let a parser that
 * rejected every anonymous payload ship green: the query threw, the provider
 * silently fell back to the permissive `DEFAULT_SYSTEM_CONFIG`, and the form
 * rendered on every SSO-only deployment. These tests feed the endpoint's actual
 * anonymous response shape so that failure mode cannot come back.
 */

// ---------------------------------------------------------------------------
// Mocks: everything except the system-config chain under test
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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

vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr /> }));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    login: vi.fn(),
    refreshUser: vi.fn(),
    setupRequired: false,
    setupPasswordHint: undefined,
    totpRequired: false,
    verifyTotp: vi.fn(),
    clearTotpRequired: vi.fn(),
  }),
}));

const { mockListProviders } = vi.hoisted(() => ({
  mockListProviders: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/sso", () => ({
  ssoApi: {
    listProviders: mockListProviders,
    ldapLogin: vi.fn().mockResolvedValue(undefined),
  },
}));

// `apiFetch` reads these from the SDK client; stub them so the real fetch
// wrapper runs without pulling in the generated SDK.
vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "",
  CSRF_HEADER_NAME: "x-csrf-protection",
  CSRF_HEADER_VALUE: "1",
}));

import LoginPage from "../login/page";
import { SystemConfigProvider } from "@/providers/system-config-provider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const oidcProvider = {
  id: "oidc-1",
  name: "Corp SSO",
  provider_type: "oidc" as const,
  login_url: "/api/v1/auth/sso/oidc/oidc-1/login",
};

/**
 * The payload `GET /api/v1/system/config` actually returns to an anonymous
 * caller. Backend #1960 made `scanners` / `search_engine` / `storage_backend` /
 * `permissions` / `plugin_signing` admin-only `Option<T>` fields with
 * `skip_serializing_if = "Option::is_none"`, so the handler's non-admin branch
 * omits all five. The login page is always anonymous, so this is its reality.
 */
function anonymousConfig(localLoginEnabled: boolean) {
  return {
    max_upload_size_bytes: 10_737_418_240,
    demo_mode: false,
    guest_access_enabled: true,
    auth: {
      oidc_enabled: true,
      ldap_enabled: false,
      sso_enabled: true,
      local_login_enabled: localLoginEnabled,
    },
    oidc_issuer: "https://auth.example.com",
  };
}

const mockFetch = vi.fn();

function stubConfigResponse(body: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

async function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SystemConfigProvider>
          <LoginPage />
        </SystemConfigProvider>
      </QueryClientProvider>
    );
  });
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalled();
    expect(mockListProviders).toHaveBeenCalled();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage wired to the real system-config provider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockListProviders.mockReset();
    mockListProviders.mockResolvedValue([oidcProvider]);
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides the credentials form when the anonymous payload reports local login disabled", async () => {
    stubConfigResponse(anonymousConfig(false));

    await renderLogin();

    await waitFor(() => {
      expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByPlaceholderText("Enter your username")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter your password")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sign In")).not.toBeInTheDocument();
  });

  it("shows the credentials form when the anonymous payload reports local login enabled", async () => {
    stubConfigResponse(anonymousConfig(true));

    await renderLogin();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Sign in with Corp SSO/i)).toBeInTheDocument();
  });

  it("requests the public config endpoint", async () => {
    stubConfigResponse(anonymousConfig(false));

    await renderLogin();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/system/config",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("falls back to showing the form when the config endpoint errors", async () => {
    // Fail-open: an unreachable config endpoint must not hide the only form a
    // local-only deployment has. The backend rejects the sign-in if local
    // login really is disabled.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    } as unknown as Response);

    await renderLogin();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your username")
      ).toBeInTheDocument();
    });
  });
});
