// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => {
  const MockImage = (props: any) => <img alt="" {...props} />;
  MockImage.displayName = "MockImage";
  return { default: MockImage };
});

// Stub lucide-react icons
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

// Stub UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
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

// Auth provider mock with mutable state
const mockLogin = vi.fn();
const mockRefreshUser = vi.fn();
const mockVerifyTotp = vi.fn();
const mockClearTotpRequired = vi.fn();

let authState: {
  login: typeof mockLogin;
  refreshUser: typeof mockRefreshUser;
  setupRequired: boolean;
  setupPasswordHint: string | null;
  totpRequired: boolean;
  verifyTotp: typeof mockVerifyTotp;
  clearTotpRequired: typeof mockClearTotpRequired;
} = {
  login: mockLogin,
  refreshUser: mockRefreshUser,
  setupRequired: false,
  setupPasswordHint: null,
  totpRequired: false,
  verifyTotp: mockVerifyTotp,
  clearTotpRequired: mockClearTotpRequired,
};

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => authState,
}));

// Local login defaults to enabled here: these tests exercise the credentials
// form itself, not the flag that gates it (see login-form-visibility.test.tsx).
let localLoginEnabled = true;
vi.mock("@/providers/system-config-provider", () => ({
  useSystemConfig: () => ({
    config: { auth: { local_login_enabled: localLoginEnabled } },
    isLoading: false,
    isError: false,
  }),
}));

// SSO mock with mutable return value so individual tests can override it
const { mockListProviders, mockLdapLogin } = vi.hoisted(() => ({
  mockListProviders: vi.fn().mockResolvedValue([]),
  mockLdapLogin: vi.fn().mockResolvedValue({ kind: "session" }),
}));

vi.mock("@/lib/api/sso", () => ({
  ssoApi: {
    listProviders: mockListProviders,
    ldapLogin: mockLdapLogin,
  },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import LoginPage from "../login/page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage sign-in errors", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockClear();
    mockRefreshUser.mockClear();
    mockVerifyTotp.mockClear();
    mockClearTotpRequired.mockClear();
    mockListProviders.mockResolvedValue([]);
    mockLdapLogin.mockResolvedValue({ kind: "session" });
    localLoginEnabled = true;
    authState = {
      login: mockLogin,
      refreshUser: mockRefreshUser,
      setupRequired: false,
      setupPasswordHint: null,
      totpRequired: false,
      verifyTotp: mockVerifyTotp,
      clearTotpRequired: mockClearTotpRequired,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows generic error for a rejected login", async () => {
    mockLogin.mockRejectedValueOnce(
      new Error("Invalid username or password")
    );

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "wrongpass" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid username or password")).toBeInTheDocument();
    });

  });

  it.each([
    "User not found",
    "Invalid password",
    "User account is disabled",
  ])("shows one fixed message for any 401, never the backend text %s (#1153)", async (detail) => {
    mockLogin.mockRejectedValueOnce({ code: "AUTH_ERROR", message: detail });

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "someone" } });
      fireEvent.change(passwordInput, { target: { value: "whatever" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In"));
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid username or password")).toBeInTheDocument();
    });
    expect(screen.queryByText(detail)).not.toBeInTheDocument();
  });

  async function submit(username = "someone", password = "whatever") {
    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: username } });
      fireEvent.change(passwordInput, { target: { value: password } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In"));
    });
  }

  // #1239: backend v1.12.1 answers a locked account with the same 401 as a
  // wrong password, so the page has no lockout state to show.
  it("never shows lockout copy, even for a lockout-worded error", async () => {
    mockLogin.mockRejectedValueOnce({
      code: "AUTH_ERROR",
      status: 401,
      message: "Account temporarily locked due to too many failed login attempts",
    });
    render(<LoginPage />);
    await submit();

    await waitFor(() => {
      expect(screen.getByText("Invalid username or password")).toBeInTheDocument();
    });
    expect(screen.queryByText("Account Locked")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/lock/i);
  });

  it("shows the account-neutral hint only after three rejected sign-ins, any username", async () => {
    const reject = { code: "AUTH_ERROR", status: 401, message: "Invalid username or password" };
    mockLogin.mockRejectedValue(reject);
    render(<LoginPage />);
    const hint = /Still can't sign in\? Check your username and password, or ask an administrator to reset your password\./;

    await submit("alice", "a");
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    await submit("bob", "b");
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    await submit("carol", "c");
    await waitFor(() => expect(screen.getByText(hint)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/lock/i);
  });

  it("does not count non-credential failures toward the hint", async () => {
    mockLogin.mockRejectedValue({ status: 503, code: "DATABASE_UNAVAILABLE", message: "Database unavailable" });
    render(<LoginPage />);
    for (let i = 0; i < 3; i++) await submit();
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Still can't sign in/)).not.toBeInTheDocument();
  });

  it("shows the rate-limit message with Retry-After seconds on a 429", async () => {
    mockLogin.mockRejectedValueOnce({
      status: 429,
      retryAfter: 42,
      message: "Rate limit exceeded. Please try again later.",
    });
    render(<LoginPage />);
    await submit();
    await waitFor(() => {
      expect(
        screen.getByText("Too many sign-in attempts. Try again in 42 seconds.")
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Rate limit exceeded/)).not.toBeInTheDocument();
  });

  it("shows the rate-limit message without a count when Retry-After is absent", async () => {
    mockLogin.mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded. Please try again later." });
    render(<LoginPage />);
    await submit();
    await waitFor(() => {
      expect(
        screen.getByText("Too many sign-in attempts. Try again in a moment.")
      ).toBeInTheDocument();
    });
  });

  it("shows the rate-limit message for an LDAP sign-in too", async () => {
    mockListProviders.mockResolvedValue([
      { id: "ldap-1", name: "Corp LDAP", provider_type: "ldap", login_url: "" },
    ]);
    localLoginEnabled = false;
    mockLdapLogin.mockRejectedValueOnce({ status: 429, retryAfter: 1, message: "Rate limit exceeded." });
    render(<LoginPage />);
    await screen.findByText(/Sign in with your Corp LDAP account/);
    await submit();
    await waitFor(() => {
      expect(
        screen.getByText("Too many sign-in attempts. Try again in 1 second.")
      ).toBeInTheDocument();
    });
  });

  it("shows the sign in form with username and password fields", async () => {
    render(<LoginPage />);

    expect(await screen.findByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });

  it("renders the first-time setup alert when setupRequired is true", () => {
    authState.setupRequired = true;

    render(<LoginPage />);

    expect(screen.getByText("First-Time Setup")).toBeInTheDocument();
  });

  it("does not render setup alert when setupRequired is false", () => {
    render(<LoginPage />);

    expect(screen.queryByText("First-Time Setup")).not.toBeInTheDocument();
  });

  it("shows the built-in docker compose instruction when no hint is provided", () => {
    authState.setupRequired = true;

    render(<LoginPage />);

    expect(
      screen.getByText(
        "docker exec artifact-keeper-backend cat /data/storage/admin.password"
      )
    ).toBeInTheDocument();
  });

  it("renders the backend-provided setup hint in place of the default", () => {
    authState.setupRequired = true;
    authState.setupPasswordHint =
      "kubectl exec deploy/artifact-keeper -- cat /data/storage/admin.password";

    render(<LoginPage />);

    expect(
      screen.getByText(
        "kubectl exec deploy/artifact-keeper -- cat /data/storage/admin.password"
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "docker exec artifact-keeper-backend cat /data/storage/admin.password"
      )
    ).not.toBeInTheDocument();
  });

  it("renders the TOTP form when totpRequired is true", () => {
    authState.totpRequired = true;

    render(<LoginPage />);

    expect(
      screen.getByText("Two-Factor Authentication")
    ).toBeInTheDocument();
    expect(screen.getByText("Back to login")).toBeInTheDocument();
  });

  it("renders Artifact Keeper heading in the login card", () => {
    render(<LoginPage />);

    expect(screen.getByText("Artifact Keeper")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
  });

  it("navigates to / on successful login", async () => {
    mockLogin.mockResolvedValueOnce(false);

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "admin" } });
      fireEvent.change(passwordInput, { target: { value: "correct" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("navigates to /change-password when login returns true (must change)", async () => {
    mockLogin.mockResolvedValueOnce(true);

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "admin" } });
      fireEvent.change(passwordInput, { target: { value: "expired" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/change-password");
    });
  });

  // ---- TOTP flow tests ----

  it("submits TOTP code and navigates to / on success", async () => {
    authState.totpRequired = true;
    mockVerifyTotp.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    const totpInput = screen.getByPlaceholderText("000000");

    await act(async () => {
      fireEvent.change(totpInput, { target: { value: "123456" } });
    });

    const verifyButton = screen.getByText("Verify");
    await act(async () => {
      fireEvent.click(verifyButton);
    });

    await waitFor(() => {
      expect(mockVerifyTotp).toHaveBeenCalledWith("123456");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows error when TOTP verification fails", async () => {
    authState.totpRequired = true;
    mockVerifyTotp.mockRejectedValueOnce(new Error("Invalid code"));

    render(<LoginPage />);

    const totpInput = screen.getByPlaceholderText("000000");

    await act(async () => {
      fireEvent.change(totpInput, { target: { value: "999999" } });
    });

    const verifyButton = screen.getByText("Verify");
    await act(async () => {
      fireEvent.click(verifyButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid code")).toBeInTheDocument();
    });
  });

  it("clicking Back to login clears TOTP state", async () => {
    authState.totpRequired = true;

    render(<LoginPage />);

    const backButton = screen.getByText("Back to login");
    await act(async () => {
      fireEvent.click(backButton);
    });

    expect(mockClearTotpRequired).toHaveBeenCalled();
  });

  // ---- SSO provider tests ----

  it("renders LDAP provider tabs and allows switching", async () => {
    mockListProviders.mockResolvedValue([
      { id: "ldap-1", name: "Corp LDAP", provider_type: "ldap", login_url: "" },
    ]);

    await act(async () => {
      render(<LoginPage />);
    });

    // Wait for the provider tabs to appear
    await waitFor(() => {
      expect(screen.getByText("Corp LDAP")).toBeInTheDocument();
    });

    expect(screen.getByText("Local")).toBeInTheDocument();

    // Click the LDAP provider tab
    await act(async () => {
      fireEvent.click(screen.getByText("Corp LDAP"));
    });

    // Click back to Local tab
    await act(async () => {
      fireEvent.click(screen.getByText("Local"));
    });
  });

  it("performs LDAP login when an LDAP provider is selected", async () => {
    mockListProviders.mockResolvedValue([
      { id: "ldap-1", name: "Corp LDAP", provider_type: "ldap", login_url: "" },
    ]);
    mockLdapLogin.mockResolvedValueOnce({ kind: "session" });
    mockRefreshUser.mockResolvedValueOnce(undefined);

    await act(async () => {
      render(<LoginPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Corp LDAP")).toBeInTheDocument();
    });

    // Select the LDAP provider
    await act(async () => {
      fireEvent.click(screen.getByText("Corp LDAP"));
    });

    // Fill credentials and submit
    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "ldapuser" } });
      fireEvent.change(passwordInput, { target: { value: "ldappass" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockLdapLogin).toHaveBeenCalledWith("ldap-1", "ldapuser", "ldappass");
      expect(mockRefreshUser).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("renders OIDC/SAML redirect provider buttons", async () => {
    mockListProviders.mockResolvedValue([
      { id: "oidc-1", name: "Okta SSO", provider_type: "oidc", login_url: "/api/v1/sso/oidc/oidc-1/login" },
    ]);
    localLoginEnabled = false;

    await act(async () => {
      render(<LoginPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign in with Okta SSO")).toBeInTheDocument();
    });

    // With local login disabled by the backend and no LDAP provider, the
    // username/password form is hidden (issue #350), so there is no need for
    // the "or continue with" divider above the provider button.
    expect(screen.queryByText("or continue with")).not.toBeInTheDocument();
  });

  it("redirects when clicking an OIDC provider button with relative login_url", async () => {
    mockListProviders.mockResolvedValue([
      { id: "saml-1", name: "Azure AD", provider_type: "saml", login_url: "/api/v1/sso/saml/saml-1/login" },
    ]);

    await act(async () => {
      render(<LoginPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign in with Azure AD")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Sign in with Azure AD"));
    });
  });

  it("an explicit SSO click drops a silent probe's leftover return path (artifact-keeper#5484)", async () => {
    // The callback reads a stored return path as "this was a silent probe"
    // and then never prompts for TOTP, so an explicit sign-in must not carry
    // one left behind by a probe that ended on an IdP error.
    sessionStorage.setItem("ak.silent-sso.return-to", "/stale");
    mockListProviders.mockResolvedValue([
      { id: "oidc-1", name: "Okta", provider_type: "oidc", login_url: "/api/v1/auth/sso/oidc/oidc-1/login" },
    ]);

    await act(async () => {
      render(<LoginPage />);
    });
    await waitFor(() => {
      expect(screen.getByText("Sign in with Okta")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sign in with Okta"));
    });

    expect(sessionStorage.getItem("ak.silent-sso.return-to")).toBeNull();
  });

  it("LDAP sign-in for a TOTP account starts the TOTP step instead of signing in", async () => {
    const mockBeginTotpChallenge = vi.fn();
    (authState as Record<string, unknown>).beginTotpChallenge = mockBeginTotpChallenge;
    mockListProviders.mockResolvedValue([
      { id: "ldap-1", name: "Corp LDAP", provider_type: "ldap", login_url: "" },
    ]);
    mockLdapLogin.mockResolvedValueOnce({ kind: "totp", totpToken: "pending.jwt" });

    await act(async () => {
      render(<LoginPage />);
    });
    await waitFor(() => {
      expect(screen.getByText("Corp LDAP")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Corp LDAP"));
    });
    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "ldapuser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
        target: { value: "ldappass" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sign In"));
    });

    await waitFor(() => {
      expect(mockBeginTotpChallenge).toHaveBeenCalledWith("pending.jwt");
    });
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
