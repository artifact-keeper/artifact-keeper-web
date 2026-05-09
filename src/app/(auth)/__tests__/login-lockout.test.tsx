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

// SSO mock with mutable return value so individual tests can override it
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

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import LoginPage from "../login/page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage lockout UI", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogin.mockClear();
    mockRefreshUser.mockClear();
    mockVerifyTotp.mockClear();
    mockClearTotpRequired.mockClear();
    mockListProviders.mockResolvedValue([]);
    mockLdapLogin.mockResolvedValue(undefined);
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

  it("does not show the lockout alert by default", () => {
    render(<LoginPage />);

    expect(screen.queryByText("Account Locked")).not.toBeInTheDocument();
  });

  it("shows Account Locked alert after a lockout error from login", async () => {
    mockLogin.mockRejectedValueOnce({
      message: "Account temporarily locked due to too many failed login attempts",
    });

    render(<LoginPage />);

    // Fill in username and password using the actual react-hook-form bindings
    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "testpass" } });
    });

    // Submit the form
    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Wait for the lockout alert to appear
    await waitFor(() => {
      expect(screen.getByText("Account Locked")).toBeInTheDocument();
    });

    // Verify the lockout description is shown
    expect(
      screen.getByText(/temporarily locked due to too many failed/)
    ).toBeInTheDocument();
  });

  it("shows generic error for non-lockout login failures", async () => {
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

    // The lockout alert should NOT be shown for generic errors
    expect(screen.queryByText("Account Locked")).not.toBeInTheDocument();
  });

  it("hides the generic error text when lockout is shown", async () => {
    mockLogin.mockRejectedValueOnce({
      error: "Account locked",
    });

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "testpass" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Account Locked")).toBeInTheDocument();
    });

    // The generic error div should NOT be rendered when accountLocked is true
    // (the component has: {error && !accountLocked && <div>...error...</div>})
    const errorDivs = document.querySelectorAll(".bg-destructive\\/10");
    expect(errorDivs.length).toBe(0);
  });

  it("clears lockout state on next submission attempt", async () => {
    // First attempt: lockout
    mockLogin.mockRejectedValueOnce({
      message: "Account temporarily locked due to too many failed login attempts",
    });

    render(<LoginPage />);

    const usernameInput = await screen.findByPlaceholderText("Enter your username");
    const passwordInput = screen.getByPlaceholderText("Enter your password");

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "testpass" } });
    });

    const submitButton = screen.getByText("Sign In");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Account Locked")).toBeInTheDocument();
    });

    // Second attempt: regular failure (lockout should clear)
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    await act(async () => {
      fireEvent.change(usernameInput, { target: { value: "testuser" } });
      fireEvent.change(passwordInput, { target: { value: "newpass" } });
    });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.queryByText("Account Locked")).not.toBeInTheDocument();
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
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
    mockLdapLogin.mockResolvedValueOnce(undefined);
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

    await act(async () => {
      render(<LoginPage />);
    });

    await waitFor(() => {
      expect(screen.getByText("Sign in with Okta SSO")).toBeInTheDocument();
    });

    // When only OIDC is configured (no LDAP, no setup-required), the local
    // username/password form is hidden — see issue #350 — so there is no
    // need for the "or continue with" divider above the provider button.
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
});
