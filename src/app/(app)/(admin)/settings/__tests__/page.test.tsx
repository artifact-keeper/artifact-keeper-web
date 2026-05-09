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
    getStorageSettings: vi.fn(),
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
import type { SmtpConfig } from "@/lib/api/settings";

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

  // ---------------------------------------------------------------------------
  // Storage tab tests
  // ---------------------------------------------------------------------------

  // Mock useQuery's return value based on which queryKey it's called with,
  // instead of relying on a fragile call-order index. Order is:
  // health, password-policy, storage-settings, smtp-config (in SettingsPage).
  function mockQueriesByKey(
    overrides: Record<string, ReturnType<typeof mockUseQuery>>
  ) {
    mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
      const key = String(opts?.queryKey?.[0] ?? "");
      return (
        overrides[key] ?? { data: undefined, isLoading: false, isError: false }
      );
    });
  }

  // Default SMTP data for tests that exercise the form (not the error/loading
  // state). After #347, getSmtpConfig throws on load failure rather than
  // silently falling back to defaults, so the page now renders an error
  // state when smtp-config is undefined — tests that want the form must
  // supply concrete data. Typed as SmtpConfig so a future schema change
  // (new required field) breaks this fixture rather than silently rendering
  // stale shapes — the `useQuery: (opts: any)` mock would otherwise hide
  // shape drift entirely (R3 finding, #347).
  const DEFAULT_SMTP_DATA: SmtpConfig = {
    host: "",
    port: 587,
    username: "",
    password: "",
    from_address: "",
    tls_mode: "starttls",
  };
  function mockSmtpForm(
    overrides: Record<string, ReturnType<typeof mockUseQuery>> = {}
  ) {
    mockQueriesByKey({
      "smtp-config": {
        data: DEFAULT_SMTP_DATA,
        isLoading: false,
        isError: false,
      },
      ...overrides,
    });
  }

  it("populates Storage fields from loaded settings", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "storage-settings": {
        data: {
          storage_backend: "s3",
          storage_path: "/data/storage",
          max_upload_size_bytes: 1_073_741_824,
        },
        isLoading: false,
        isError: false,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "S3")).toBeDefined();
    expect(inputs.find((i) => i.value === "/data/storage")).toBeDefined();
    // formatBytes from @/lib/utils renders 1 GiB as "1 GB" (no trailing .0).
    expect(inputs.find((i) => i.value === "1 GB")).toBeDefined();
  });

  it("renders friendly storage backend labels", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "storage-settings": {
        data: {
          storage_backend: "filesystem",
          storage_path: "/var/lib/ak",
          max_upload_size_bytes: 0,
        },
        isLoading: false,
        isError: false,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "Local Filesystem")).toBeDefined();
    // 0 bytes renders literally as "0 B" — we no longer invent an
    // "Unlimited" semantic that isn't in the API contract.
    expect(inputs.find((i) => i.value === "0 B")).toBeDefined();
  });

  it("falls back to raw storage backend value when label is unknown", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "storage-settings": {
        data: {
          storage_backend: "minio",
          storage_path: "/data/minio",
          max_upload_size_bytes: 5_368_709_120,
        },
        isLoading: false,
        isError: false,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "minio")).toBeDefined();
    expect(inputs.find((i) => i.value === "5 GB")).toBeDefined();
  });

  it("shows Loading… in Storage fields while the query is loading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "storage-settings": { data: undefined, isLoading: true, isError: false },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    // The three storage rows all show "Loading...".
    const loadingInputs = inputs.filter((i) => i.value === "Loading...");
    expect(loadingInputs.length).toBeGreaterThanOrEqual(3);
  });

  it("shows Unavailable in Storage fields when the query errors", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      // Pin password-policy to a real value so the only Unavailable rows
      // counted below come from storage. Password policy gets its own
      // assertion in the next test (#347).
      "password-policy": {
        data: {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_digit: true,
          require_special: false,
          history_count: 5,
        },
        isLoading: false,
        isError: false,
      },
      "storage-settings": { data: undefined, isLoading: false, isError: true },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const unavailableInputs = inputs.filter((i) => i.value === "Unavailable");
    // All three storage rows surface the failure rather than silently
    // falling back to the placeholder strings called out in #334.
    expect(unavailableInputs.length).toBe(3);
    // Critically: the buggy placeholders must NOT appear on error.
    expect(inputs.find((i) => i.value === "Local Filesystem")).toBeUndefined();
    expect(inputs.find((i) => i.value === "/data/artifacts")).toBeUndefined();
  });

  it("shows Unavailable in Password Policy when the query errors (#347)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    // Pin storage-settings to a successful response so the only Unavailable
    // row counted below comes from password-policy. Without this pin,
    // storage rows would also render Unavailable (3 of them) and the
    // assertion below would pass even if the password-policy logic were
    // broken — a load-bearing-by-accident test (caught by R3, #347).
    mockQueriesByKey({
      "password-policy": { data: undefined, isLoading: false, isError: true },
      "storage-settings": {
        data: {
          storage_backend: "filesystem",
          storage_path: "/data/storage",
          max_upload_size_bytes: 1_073_741_824,
        },
        isLoading: false,
        isError: false,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const unavailableInputs = inputs.filter((i) => i.value === "Unavailable");
    // Exactly one Unavailable row — the password policy.
    expect(unavailableInputs.length).toBe(1);
  });

  it("shows error alert in SMTP tab when the query errors (#347)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "smtp-config": {
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load SMTP config: unauthorized"),
      },
    });

    render(<SettingsPage />);

    expect(screen.getByText("SMTP configuration unavailable")).toBeDefined();
    // The thrown Error's message is rendered so an operator sees the
    // actual cause (not a generic placeholder).
    expect(
      screen.getByText("Failed to load SMTP config: unauthorized")
    ).toBeDefined();
    // The buggy default form placeholders must NOT render on error.
    expect(screen.queryByTestId("smtp-host")).toBeNull();
  });

  it("shows loader in SMTP tab while smtp-config is loading (#347)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      "smtp-config": { data: undefined, isLoading: true, isError: false },
    });

    render(<SettingsPage />);

    // Neither the form nor the error alert should render during loading.
    expect(screen.queryByTestId("smtp-host")).toBeNull();
    expect(screen.queryByText("SMTP configuration unavailable")).toBeNull();
  });

  it("renders the Email tab trigger", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });

    render(<SettingsPage />);

    expect(screen.getByText("Email")).toBeDefined();
  });

  it("renders SMTP Configuration heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

    render(<SettingsPage />);

    expect(screen.getByText("SMTP Configuration")).toBeDefined();
  });

  it("renders Send Test Email heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

    render(<SettingsPage />);

    const elements = screen.getAllByText("Send Test Email");
    // One heading, one button
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders SMTP form fields with placeholders", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

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
    mockQueriesByKey({
      "smtp-config": {
        data: {
          host: "mail.example.com",
          port: 465,
          username: "sender",
          password: "secret",
          from_address: "no-reply@example.com",
          tls_mode: "tls" as const,
        },
        isLoading: false,
      },
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
    mockSmtpForm();

    render(<SettingsPage />);

    const saveButton = screen.getByText("Save SMTP Settings");
    expect(saveButton.closest("button")?.disabled).toBe(true);
  });

  it("enables Save button after editing a field", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

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
    mockSmtpForm();

    render(<SettingsPage />);

    const recipientInput = screen.getByTestId("test-recipient") as HTMLInputElement;
    expect(recipientInput).toBeDefined();
    expect(recipientInput.type).toBe("email");
  });

  it("trims whitespace from fields before saving", () => {
    const mutateFn = vi.fn();
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

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
    mockSmtpForm();

    render(<SettingsPage />);

    const pwInput = screen.getByTestId("smtp-password") as HTMLInputElement;
    expect(pwInput.type).toBe("password");
  });

  it("renders TLS mode options", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

    render(<SettingsPage />);

    expect(screen.getByText("None")).toBeDefined();
    expect(screen.getByText("STARTTLS")).toBeDefined();
    expect(screen.getByText("TLS")).toBeDefined();
  });

  it("disables Save button when mutation is pending", () => {
    mockUseMutation.mockReturnValue(createMutationMock({ isPending: true }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockSmtpForm();

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
    mockSmtpForm();

    render(<SettingsPage />);

    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find((el) => el.closest("button"));
    expect(sendButton?.closest("button")?.disabled).toBe(true);
  });
});
