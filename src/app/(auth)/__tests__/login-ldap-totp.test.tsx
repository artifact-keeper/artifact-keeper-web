// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * LDAP sign-in for an account with TOTP enrolled (artifact-keeper#5484),
 * wired through the REAL AuthProvider so the test covers the hand-off from
 * `ssoApi.ldapLogin`'s challenge to `beginTotpChallenge`, the TOTP form, and
 * the `POST /auth/totp/verify` body. Only the SDK, the SSO API wrapper and
 * the presentational components are mocked.
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
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
  const MockInput = React.forwardRef((props: any, ref: any) => <input ref={ref} {...props} />);
  MockInput.displayName = "MockInput";
  return { Input: MockInput };
});

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, ...props }: any) => <div role="alert" {...props}>{children}</div>,
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

vi.mock("@/lib/sdk-client", () => ({}));

const sdk = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  verifyTotp: vi.fn(),
  changePassword: vi.fn(),
  setupStatus: vi.fn(),
}));
vi.mock("@artifact-keeper/sdk", () => sdk);

vi.mock("@/providers/system-config-provider", () => ({
  SYSTEM_CONFIG_QUERY_KEY: ["system-config"],
  useSystemConfig: () => ({
    config: { auth: { local_login_enabled: false } },
    isLoading: false,
    isError: false,
  }),
}));

const { mockListProviders, mockLdapLogin } = vi.hoisted(() => ({
  mockListProviders: vi.fn(),
  mockLdapLogin: vi.fn(),
}));
vi.mock("@/lib/api/sso", () => ({
  ssoApi: { listProviders: mockListProviders, ldapLogin: mockLdapLogin },
}));

import LoginPage from "../login/page";
import { AuthProvider } from "@/providers/auth-provider";

const USER = {
  id: "u-ldap",
  username: "alice",
  email: "alice@corp.example",
  is_admin: false,
  must_change_password: false,
};

async function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

async function submitLdapCredentials() {
  const username = await screen.findByPlaceholderText("Enter your username");
  await act(async () => {
    fireEvent.change(username, { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "directory-pw" },
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Sign In"));
  });
}

describe("LDAP sign-in with TOTP enrolled (artifact-keeper#5484)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.setupStatus.mockResolvedValue({ data: { setup_required: false } });
    // Anonymous at mount; a session exists only once the TOTP step succeeds.
    sdk.getCurrentUser.mockResolvedValue({ data: undefined, error: { status: 401 } });
    mockListProviders.mockResolvedValue([
      { id: "ldap-1", name: "Corp LDAP", provider_type: "ldap", login_url: "" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ demo_mode: false }) }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the TOTP form and redeems the LDAP challenge token at /auth/totp/verify", async () => {
    mockLdapLogin.mockResolvedValue({ kind: "totp", totpToken: "ldap-pending.jwt" });
    await renderLogin();
    await submitLdapCredentials();

    expect(mockLdapLogin).toHaveBeenCalledWith("ldap-1", "alice", "directory-pw");
    expect(await screen.findByText("Two-Factor Authentication")).toBeInTheDocument();
    // No session yet, so no navigation and no extra /auth/me beyond the mount.
    expect(mockPush).not.toHaveBeenCalled();
    expect(sdk.getCurrentUser).toHaveBeenCalledTimes(1);

    sdk.verifyTotp.mockResolvedValue({
      data: { access_token: "AT", refresh_token: "RT", must_change_password: false },
    });
    sdk.getCurrentUser.mockResolvedValue({ data: USER });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("000000"), {
        target: { value: "123456" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Verify"));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(sdk.verifyTotp).toHaveBeenCalledWith({
      body: { totp_token: "ldap-pending.jwt", code: "123456" },
    });
  });

  it("no TOTP: signs in straight away with no TOTP form (unchanged)", async () => {
    mockLdapLogin.mockResolvedValue({ kind: "session" });
    await renderLogin();
    sdk.getCurrentUser.mockResolvedValue({ data: USER });
    await submitLdapCredentials();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Two-Factor Authentication")).not.toBeInTheDocument();
    expect(sdk.verifyTotp).not.toHaveBeenCalled();
  });
});
