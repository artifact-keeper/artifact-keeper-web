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
  // useQuery is itself mocked above, so queryFns never actually run — but we
  // still expose the API surface the page imports so module resolution works.
  // Note: no updateSmtpConfig — the backend has no SMTP save endpoint (#555).
  settingsApi: {
    getAllSettings: vi.fn(),
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
    Rss: icon,
    ExternalLink: icon,
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

import SettingsPage, { bytesToUploadSize, uploadSizeToBytes } from "../page";
import type { AdminSettings, SmtpConfig } from "@/lib/api/settings";
import { ADMIN_SETTINGS_QUERY_KEY } from "@/hooks/use-admin-settings";

// Lock the mock map key to the same constant the production code uses.
// If the queryKey ever drifts, every test that pins admin-settings would
// silently fall back to the default-undefined mock and most assertions
// would still pass (e.g. "all rows show Unavailable") — a real silent-
// failure mode caught by R3 (#349).
const ADMIN_SETTINGS_KEY = String(ADMIN_SETTINGS_QUERY_KEY[0]);

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
  // instead of relying on a fragile call-order index. Keys in SettingsPage:
  //   ["health"], ["admin-settings"]
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

  // Typed defaults for a fully-populated AdminSettings bundle. Tests that
  // override one slice merge their override on top; this lets a test pin
  // (e.g.) storage data without spelling out the SMTP and password-policy
  // shapes, while still typing the result as AdminSettings so a schema
  // drift breaks the fixture rather than rendering stale shapes (#347/#349).
  const DEFAULT_SMTP_DATA: SmtpConfig = {
    host: "",
    port: 587,
    username: "",
    password: "",
    from_address: "",
    tls_mode: "starttls",
  };
  const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
    passwordPolicy: {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_digit: true,
      require_special: false,
      history_count: 5,
    },
    storageSettings: {
      storage_backend: "filesystem",
      storage_path: "/data/storage",
      max_upload_size_bytes: 1_073_741_824,
    },
    smtpConfig: DEFAULT_SMTP_DATA,
    environment: "production",
  };

  /** Mocks the shared `admin-settings` query for a given bundle (or default). */
  function mockAdminSettings(
    bundle: AdminSettings = DEFAULT_ADMIN_SETTINGS
  ) {
    mockQueriesByKey({
      [ADMIN_SETTINGS_KEY]: {
        data: bundle,
        isLoading: false,
        isError: false,
      },
    });
  }

  it("populates Storage fields from loaded settings", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings({
      ...DEFAULT_ADMIN_SETTINGS,
      storageSettings: {
        storage_backend: "s3",
        storage_path: "/data/storage",
        max_upload_size_bytes: 1_073_741_824,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "S3")).toBeDefined();
    expect(inputs.find((i) => i.value === "/data/storage")).toBeDefined();
    // Max Upload Size is now an editable number input (#189). 1 GiB shows
    // as the value "1" with the unit selector set to GB.
    const numberInputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(numberInputs.find((i) => i.value === "1")).toBeDefined();
  });

  it("renders friendly storage backend labels", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings({
      ...DEFAULT_ADMIN_SETTINGS,
      storageSettings: {
        storage_backend: "filesystem",
        storage_path: "/var/lib/ak",
        max_upload_size_bytes: 0,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "Local Filesystem")).toBeDefined();
    // 0 bytes means "no limit" (#189): the editable number input is empty
    // with the "No limit" placeholder.
    const numberInputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(numberInputs.find((i) => i.value === "")).toBeDefined();
  });

  it("falls back to raw storage backend value when label is unknown", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings({
      ...DEFAULT_ADMIN_SETTINGS,
      storageSettings: {
        storage_backend: "minio",
        storage_path: "/data/minio",
        max_upload_size_bytes: 5_368_709_120,
      },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.find((i) => i.value === "minio")).toBeDefined();
    // 5 GiB shows as the value "5" in the editable number input (#189).
    const numberInputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(numberInputs.find((i) => i.value === "5")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Environment badge tests (General tab)
  // ---------------------------------------------------------------------------

  it("renders the Environment badge from the loaded settings value", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings({ ...DEFAULT_ADMIN_SETTINGS, environment: "staging" });

    render(<SettingsPage />);

    // Badge value comes from adminSettings.environment, no longer hardcoded.
    expect(screen.getByText("staging")).toBeDefined();
    expect(screen.queryByText("Production")).toBeNull();
  });

  it("falls back to Unknown when the environment field is empty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings({ ...DEFAULT_ADMIN_SETTINGS, environment: "" });

    render(<SettingsPage />);

    // An older backend that omits ENVIRONMENT yields "" — the badge degrades
    // to "Unknown" instead of the previous misleading hardcoded "Production".
    expect(screen.getByText("Unknown")).toBeDefined();
  });

  it("falls back to Unknown when admin-settings errors", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      [ADMIN_SETTINGS_KEY]: { data: undefined, isLoading: false, isError: true },
    });

    render(<SettingsPage />);

    expect(screen.getByText("Unknown")).toBeDefined();
  });

  it("shows Loading… in Storage fields while admin-settings is loading (#349)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      [ADMIN_SETTINGS_KEY]: { data: undefined, isLoading: true, isError: false },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    // Three storage rows + password-policy row all show "Loading...".
    const loadingInputs = inputs.filter((i) => i.value === "Loading...");
    expect(loadingInputs.length).toBeGreaterThanOrEqual(4);
  });

  it("shows Unavailable in all settings rows when admin-settings errors (#349)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockQueriesByKey({
      [ADMIN_SETTINGS_KEY]: { data: undefined, isLoading: false, isError: true },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const unavailableInputs = inputs.filter((i) => i.value === "Unavailable");
    // 3 storage rows + 1 password-policy row, all surface the failure
    // rather than falling back to the buggy placeholder strings (#334/#347).
    expect(unavailableInputs.length).toBe(4);
    // Critically: the buggy placeholders must NOT appear on error.
    expect(inputs.find((i) => i.value === "Local Filesystem")).toBeUndefined();
    expect(inputs.find((i) => i.value === "/data/artifacts")).toBeUndefined();
  });

  it("renders the Email tab trigger", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });

    render(<SettingsPage />);

    expect(screen.getByText("Email")).toBeDefined();
  });

  it("renders the npm Upstream tab and its read-only feed card (#702)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });

    render(<SettingsPage />);

    expect(screen.getByText("npm Upstream")).toBeDefined();
    expect(screen.getByText("npm Upstream Change-Feed")).toBeDefined();
    expect(screen.getByText("NPM_UPSTREAM_FEED_ENABLED")).toBeDefined();
    expect(screen.getByText("NPM_UPSTREAM_FEED_URL")).toBeDefined();
  });

  it("renders SMTP Configuration heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    expect(screen.getByText("SMTP Configuration")).toBeDefined();
  });

  it("renders Send Test Email heading", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    const elements = screen.getAllByText("Send Test Email");
    // One heading, one button
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });

  it("explains SMTP is configured via server environment variables (#555)", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    expect(
      screen.getByText("Configured via environment variables")
    ).toBeDefined();
    expect(screen.getByText(/SMTP_HOST/)).toBeDefined();
    expect(screen.getByText(/SMTP_TLS_MODE/)).toBeDefined();
  });

  it("does not render a Save SMTP Settings button or edit form (#555)", () => {
    // Regression: the backend has no SMTP save endpoint — PUT
    // /api/v1/admin/smtp returns 404. The UI must not offer a save flow.
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    expect(screen.queryByText("Save SMTP Settings")).toBeNull();
    expect(screen.queryByTestId("smtp-host")).toBeNull();
    expect(screen.queryByTestId("smtp-port")).toBeNull();
    expect(screen.queryByTestId("smtp-username")).toBeNull();
    expect(screen.queryByTestId("smtp-password")).toBeNull();
    expect(screen.queryByTestId("smtp-from")).toBeNull();
    expect(screen.queryByTestId("smtp-tls")).toBeNull();
  });

  it("calls test email mutation with recipient", () => {
    const mutateFn = vi.fn();
    // Both mutations use the same mutate so we can verify calls regardless of order
    mockUseMutation.mockReturnValue(createMutationMock({ mutate: mutateFn }));
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

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
    mockAdminSettings();

    render(<SettingsPage />);

    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find((el) => el.closest("button"));
    fireEvent.click(sendButton!);

    expect(mockToast.error).toHaveBeenCalledWith(
      "Please enter a recipient email address"
    );
  });

  it("renders the test recipient input", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    const recipientInput = screen.getByTestId("test-recipient") as HTMLInputElement;
    expect(recipientInput).toBeDefined();
    expect(recipientInput.type).toBe("email");
  });

  it("disables Send Test Email button when test mutation is pending", () => {
    // useMutation call order is: [1] upload-size save (storage tab, #189),
    // [2] send-test-email (Email tab). The test-email mutation is the second
    // call, so mark only that one pending.
    let mutationCallIndex = 0;
    mockUseMutation.mockImplementation(() => {
      mutationCallIndex++;
      if (mutationCallIndex === 2) {
        return createMutationMock({ isPending: true });
      }
      return createMutationMock();
    });
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockAdminSettings();

    render(<SettingsPage />);

    const sendButtons = screen.getAllByText("Send Test Email");
    const sendButton = sendButtons.find((el) => el.closest("button"));
    expect(sendButton?.closest("button")?.disabled).toBe(true);
  });
});

describe("upload size helpers (#189)", () => {
  it("converts whole GB to value + GB unit", () => {
    expect(bytesToUploadSize(5 * 1024 * 1024 * 1024)).toEqual({
      value: "5",
      unit: "GB",
    });
  });

  it("falls back to MB for non-GB-aligned sizes", () => {
    expect(bytesToUploadSize(100 * 1024 * 1024)).toEqual({
      value: "100",
      unit: "MB",
    });
  });

  it("treats 0 bytes as no limit (empty value)", () => {
    expect(bytesToUploadSize(0)).toEqual({ value: "", unit: "MB" });
  });

  it("converts a value + unit back to bytes", () => {
    expect(uploadSizeToBytes("2", "GB")).toBe(2 * 1024 * 1024 * 1024);
    expect(uploadSizeToBytes("250", "MB")).toBe(250 * 1024 * 1024);
  });

  it("returns 0 (no limit) for empty or invalid input", () => {
    expect(uploadSizeToBytes("", "GB")).toBe(0);
    expect(uploadSizeToBytes("-1", "MB")).toBe(0);
    expect(uploadSizeToBytes("abc", "GB")).toBe(0);
  });

  it("round-trips through bytes -> size -> bytes", () => {
    const original = 3 * 1024 * 1024 * 1024;
    const { value, unit } = bytesToUploadSize(original);
    expect(uploadSizeToBytes(value, unit)).toBe(original);
  });
});
