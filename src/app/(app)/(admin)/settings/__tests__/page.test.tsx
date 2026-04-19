// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseQueryClient = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => mockUseQueryClient(),
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn() },
}));

vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getPasswordPolicy: vi.fn(),
    getSmtpConfig: vi.fn(),
    updateSmtpConfig: vi.fn(),
    sendTestEmail: vi.fn(),
  },
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    Server: icon,
    HardDrive: icon,
    Lock: icon,
    Info: icon,
    Mail: icon,
    Loader2: icon,
  };
});

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange, id, type, placeholder, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      id={id}
      type={type}
      placeholder={placeholder}
      data-testid={id}
      readOnly={!onChange}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-wrapper" data-value={value}>
      {typeof children === "function"
        ? children({ value, onValueChange })
        : children}
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => (
    <button data-testid={id}>{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import SettingsPage from "../page";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Creates a mutation mock that captures mutationFn and callbacks */
function createMutationMock(overrides?: Partial<ReturnType<typeof mockUseMutation>>) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    delete process.env.NEXT_PUBLIC_GIT_SHA;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0";
    mockUseQuery.mockReturnValue({ data: undefined });
    mockUseMutation.mockReturnValue(createMutationMock());
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
  });

  it("shows access denied for non-admin users", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: false } });

    render(<SettingsPage />);

    expect(screen.getByText("Access Denied")).toBeDefined();
  });

  it("shows server version from health data", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: { version: "1.1.0-rc.5" } });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value.includes("1.1.0-rc.5"));
    expect(serverInput).toBeDefined();
  });

  it("shows server commit hash when dirty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({
      data: { version: "1.1.0-rc.5", dirty: true, commit: "abc1234567890def" },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value.includes("(abc1234)"));
    expect(serverInput).toBeDefined();
    expect(serverInput!.value).toBe("1.1.0-rc.5 (abc1234)");
  });

  it("hides server commit hash when not dirty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({
      data: { version: "1.1.0-rc.5", dirty: false, commit: "abc1234567890def" },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value === "1.1.0-rc.5");
    expect(serverInput).toBeDefined();
  });

  it("shows web version with git SHA for prerelease", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0-rc.8";
    process.env.NEXT_PUBLIC_GIT_SHA = "cf1b0d2abc1234567890";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value.includes("(cf1b0d2)"));
    expect(webInput).toBeDefined();
    expect(webInput!.value).toBe("1.1.0-rc.8 (cf1b0d2)");
  });

  it("shows plain web version for stable release", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0";
    process.env.NEXT_PUBLIC_GIT_SHA = "cf1b0d2abc1234567890";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value === "1.1.0");
    expect(webInput).toBeDefined();
  });

  it("shows plain web version when SHA is unknown", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0-rc.8";
    process.env.NEXT_PUBLIC_GIT_SHA = "unknown";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value === "1.1.0-rc.8");
    expect(webInput).toBeDefined();
  });

  it("renders the Email tab trigger", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });

    render(<SettingsPage />);

    expect(screen.getByText("Email")).toBeDefined();
  });

  it("renders SMTP Configuration heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    expect(screen.getByText("SMTP Configuration")).toBeDefined();
  });

  it("renders Send Test Email heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const elements = screen.getAllByText("Send Test Email");
    // One heading, one button
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders SMTP form fields with placeholders", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    expect(screen.getByTestId("smtp-host")).toBeDefined();
    expect(screen.getByTestId("smtp-port")).toBeDefined();
    expect(screen.getByTestId("smtp-username")).toBeDefined();
    expect(screen.getByTestId("smtp-password")).toBeDefined();
    expect(screen.getByTestId("smtp-from")).toBeDefined();
    expect(screen.getByTestId("smtp-tls")).toBeDefined();
  });

  it("populates SMTP fields from loaded config", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });

    let queryCallIndex = 0;
    mockUseQuery.mockImplementation(() => {
      queryCallIndex++;
      // Third useQuery call is for smtp-config
      if (queryCallIndex === 3) {
        return {
          data: {
            host: "mail.example.com",
            port: 465,
            username: "sender",
            password: "secret",
            from_address: "no-reply@example.com",
            tls_mode: "tls" as const,
          },
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });

    render(<SettingsPage />);

    const hostInput = screen.getByTestId("smtp-host") as HTMLInputElement;
    expect(hostInput.value).toBe("mail.example.com");

    const portInput = screen.getByTestId("smtp-port") as HTMLInputElement;
    expect(portInput.value).toBe("465");

    const usernameInput = screen.getByTestId("smtp-username") as HTMLInputElement;
    expect(usernameInput.value).toBe("sender");

    const fromInput = screen.getByTestId("smtp-from") as HTMLInputElement;
    expect(fromInput.value).toBe("no-reply@example.com");

    // Password should not be populated from server response
    const passwordInput = screen.getByTestId("smtp-password") as HTMLInputElement;
    expect(passwordInput.value).toBe("");
  });

  it("disables Save button when form is not dirty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const saveButton = screen.getByText("Save SMTP Settings");
    expect(saveButton.closest("button")?.disabled).toBe(true);
  });

  it("enables Save button after editing a field", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const hostInput = screen.getByTestId("smtp-host");
    fireEvent.change(hostInput, { target: { value: "smtp.test.com" } });

    const saveButton = screen.getByText("Save SMTP Settings");
    expect(saveButton.closest("button")?.disabled).toBe(false);
  });

  it("calls save mutation with form values on Save click", () => {
    const mutateFn = vi.fn();
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    // Fill required fields
    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "smtp.test.com" },
    });
    fireEvent.change(screen.getByTestId("smtp-from"), {
      target: { value: "test@test.com" },
    });

    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mutateFn).toHaveBeenCalledWith({
      host: "smtp.test.com",
      port: 587,
      username: "",
      from_address: "test@test.com",
      tls_mode: "starttls",
    });
  });

  it("includes password in save payload only when modified", () => {
    const mutateFn = vi.fn();
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    // Fill required fields
    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "smtp.test.com" },
    });
    fireEvent.change(screen.getByTestId("smtp-from"), {
      target: { value: "test@test.com" },
    });
    // Modify the password field
    fireEvent.change(screen.getByTestId("smtp-password"), {
      target: { value: "new-secret" },
    });

    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.test.com",
        password: "new-secret",
      })
    );
  });

  it("shows validation error for empty host on save", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    // Make form dirty by setting from address, but leave host blank
    fireEvent.change(screen.getByTestId("smtp-from"), {
      target: { value: "test@test.com" },
    });
    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mockToast.error).toHaveBeenCalledWith("SMTP host is required");
  });

  it("shows validation error for empty from address on save", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    // Make form dirty with a host but no from address
    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "smtp.test.com" },
    });
    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mockToast.error).toHaveBeenCalledWith("From address is required");
  });

  it("shows validation error for invalid port on save", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "smtp.test.com" },
    });
    fireEvent.change(screen.getByTestId("smtp-port"), {
      target: { value: "99999" },
    });
    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mockToast.error).toHaveBeenCalledWith(
      "Port must be a number between 1 and 65535"
    );
  });

  it("shows validation error for non-numeric port on save", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "smtp.test.com" },
    });
    fireEvent.change(screen.getByTestId("smtp-port"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mockToast.error).toHaveBeenCalledWith(
      "Port must be a number between 1 and 65535"
    );
  });

  it("calls test email mutation with recipient", () => {
    const mutateFn = vi.fn();
    // Both mutations use the same mutate so we can verify calls regardless of order
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId("test-recipient"), {
      target: { value: "admin@test.com" },
    });
    // Find the Send Test Email button (the one that is a direct <button>, not a heading)
    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find(
      (el) => el.tagName === "BUTTON"
    );
    fireEvent.click(sendButton!);

    expect(mutateFn).toHaveBeenCalledWith("admin@test.com");
  });

  it("shows validation error when sending test email without recipient", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find((el) => el.closest("button"));
    fireEvent.click(sendButton!);

    expect(mockToast.error).toHaveBeenCalledWith(
      "Please enter a recipient email address"
    );
  });

  it("renders SMTP field labels", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    expect(screen.getByText("Host")).toBeDefined();
    expect(screen.getByText("Port")).toBeDefined();
    expect(screen.getByText("Username")).toBeDefined();
    expect(screen.getByText("Password")).toBeDefined();
    expect(screen.getByText("From Address")).toBeDefined();
    expect(screen.getByText("TLS Mode")).toBeDefined();
  });

  it("renders the test recipient input", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const recipientInput = screen.getByTestId("test-recipient") as HTMLInputElement;
    expect(recipientInput).toBeDefined();
    expect(recipientInput.type).toBe("email");
  });

  it("trims whitespace from fields before saving", () => {
    const mutateFn = vi.fn();
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId("smtp-host"), {
      target: { value: "  smtp.test.com  " },
    });
    fireEvent.change(screen.getByTestId("smtp-from"), {
      target: { value: "  test@test.com  " },
    });
    fireEvent.change(screen.getByTestId("smtp-username"), {
      target: { value: "  user  " },
    });

    fireEvent.click(screen.getByText("Save SMTP Settings"));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.test.com",
        from_address: "test@test.com",
        username: "user",
      })
    );
  });

  it("password field is type=password", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const pwInput = screen.getByTestId("smtp-password") as HTMLInputElement;
    expect(pwInput.type).toBe("password");
  });

  it("renders TLS mode options", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    expect(screen.getByText("None")).toBeDefined();
    expect(screen.getByText("STARTTLS")).toBeDefined();
    expect(screen.getByText("TLS")).toBeDefined();
  });

  it("disables Save button when mutation is pending", () => {
    mockUseMutation.mockReturnValue(createMutationMock({ isPending: true }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const saveButton = screen.getByText("Save SMTP Settings");
    expect(saveButton.closest("button")?.disabled).toBe(true);
  });

  it("disables Send Test Email button when test mutation is pending", () => {
    let mutationCallIndex = 0;
    mockUseMutation.mockImplementation(() => {
      mutationCallIndex++;
      if (mutationCallIndex === 2) {
        return createMutationMock({ isPending: true });
      }
      return createMutationMock();
    });
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<SettingsPage />);

    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find((el) => el.closest("button"));
    expect(sendButton?.closest("button")?.disabled).toBe(true);
  });
});
