// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track mutation and query configs for exercising callbacks
interface MutationConfig {
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
}

const mutationConfigs: MutationConfig[] = [];

// Response map keyed by first element of queryKey
let queryResponses: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: string[]; queryFn: () => unknown; enabled?: boolean }) => {
    const keyStr = opts.queryKey[0];
    if (queryResponses[keyStr]) {
      // Execute queryFn so the arrow callback is covered
      if (opts.queryFn && opts.enabled !== false) {
        try {
          opts.queryFn();
        } catch {
          /* safe */
        }
      }
      return queryResponses[keyStr];
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    return { mutate: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockEnable = vi.fn();
const mockDisable = vi.fn();
const mockTest = vi.fn();

vi.mock("@/lib/api/webhooks", () => ({
  webhooksApi: {
    list: (...args: unknown[]) => mockList(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    enable: (...args: unknown[]) => mockEnable(...args),
    disable: (...args: unknown[]) => mockDisable(...args),
    test: (...args: unknown[]) => mockTest(...args),
  },
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (_err: unknown, fallback: string) => fallback,
}));

// Stub out radix tooltip/dialog to avoid portal issues in jsdom
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: Object.assign(
    React.forwardRef<
      HTMLDivElement,
      { children: React.ReactNode; asChild?: boolean }
    >(function TooltipTrigger({ children }, _ref) {
      return <>{children}</>;
    }),
    { displayName: "TooltipTrigger" }
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

// Stub Checkbox as a simple native checkbox
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    "aria-label"?: string;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      aria-label={ariaLabel}
      data-testid="mock-checkbox"
    />
  ),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_WEBHOOKS = [
  {
    id: "wh-1",
    name: "CI Pipeline",
    url: "https://ci.example.com/hook",
    events: ["artifact_uploaded", "build_completed"] as string[],
    is_enabled: true,
    repository_id: "repo-123",
    last_triggered_at: "2026-04-10T12:00:00Z",
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "wh-2",
    name: "Slack Alerts",
    url: "https://hooks.slack.com/services/abc",
    events: ["artifact_deleted"] as string[],
    is_enabled: false,
    repository_id: "repo-123",
    last_triggered_at: null,
    created_at: "2026-03-15T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { NotificationsTabContent, WEBHOOK_EVENTS } from "./notifications-tab-content";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NotificationsTabContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationConfigs.length = 0;
    queryResponses = {};
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it("renders loading skeleton when query is loading", () => {
    queryResponses["webhooks"] = { data: undefined, isLoading: true };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    expect(screen.getByTestId("notifications-loading")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("renders empty state when no webhooks are configured", () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    expect(
      screen.getByText("No webhooks configured for this repository.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("add-webhook-button")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Webhook list rendering
  // -----------------------------------------------------------------------

  it("renders webhook cards with name, url, events, and status", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Verify both webhooks render
    expect(screen.getByTestId("webhook-card-wh-1")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-card-wh-2")).toBeInTheDocument();

    // Check name
    expect(screen.getByText("CI Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Slack Alerts")).toBeInTheDocument();

    // Check URLs
    expect(screen.getByText("https://ci.example.com/hook")).toBeInTheDocument();
    expect(
      screen.getByText("https://hooks.slack.com/services/abc")
    ).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    // Check event badges
    expect(screen.getByText("Artifact Uploaded")).toBeInTheDocument();
    expect(screen.getByText("Build Completed")).toBeInTheDocument();
    expect(screen.getByText("Artifact Deleted")).toBeInTheDocument();
  });

  it("displays last triggered date for triggered webhooks", () => {
    queryResponses["webhooks"] = {
      data: { items: [SAMPLE_WEBHOOKS[0]], total: 1 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    expect(screen.getByText(/Last triggered/)).toBeInTheDocument();
  });

  it('displays "Never triggered" for webhooks with no last_triggered_at', () => {
    queryResponses["webhooks"] = {
      data: { items: [SAMPLE_WEBHOOKS[1]], total: 1 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    expect(screen.getByText("Never triggered")).toBeInTheDocument();
  });

  it("shows webhook count badge", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    expect(screen.getByText("2 configured")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Create webhook dialog
  // -----------------------------------------------------------------------

  it("opens create dialog when Add Webhook button is clicked", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Dialog should not be open initially
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("add-webhook-button"));

    // Dialog should now be open
    const dialog = screen.getByTestId("dialog");
    expect(dialog).toBeInTheDocument();
    // The dialog title is rendered as an h2
    expect(within(dialog).getByRole("heading", { name: "Add Webhook" })).toBeInTheDocument();
  });

  it("renders all event checkboxes in the create dialog", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    await userEvent.click(screen.getByTestId("add-webhook-button"));

    for (const event of WEBHOOK_EVENTS) {
      expect(screen.getByText(event.label)).toBeInTheDocument();
      expect(screen.getByText(event.description)).toBeInTheDocument();
    }
  });

  it("renders form inputs for name, url, and secret", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    await userEvent.click(screen.getByTestId("add-webhook-button"));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Payload URL")).toBeInTheDocument();
    // Secret label contains "(optional)" text
    expect(screen.getByPlaceholderText("Used to sign payloads")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Mutation callback coverage
  // -----------------------------------------------------------------------

  it("registers create mutation with correct onSuccess behavior", () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Create mutation is the first registered
    const createConfig = mutationConfigs[0];
    expect(createConfig).toBeDefined();

    // Exercise onSuccess
    createConfig.onSuccess?.();
    expect(mockToastSuccess).toHaveBeenCalledWith("Webhook created");
  });

  it("registers create mutation with correct onError behavior", () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const createConfig = mutationConfigs[0];
    createConfig.onError?.(new Error("network"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to create webhook");
  });

  it("registers delete mutation with correct callbacks", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Delete mutation is the second registered (index 1)
    const deleteConfig = mutationConfigs[1];
    expect(deleteConfig).toBeDefined();

    deleteConfig.onSuccess?.();
    expect(mockToastSuccess).toHaveBeenCalledWith("Webhook deleted");

    deleteConfig.onError?.(new Error("fail"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to delete webhook");
  });

  it("registers enable mutation with correct callbacks", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Enable is third (index 2)
    const enableConfig = mutationConfigs[2];
    expect(enableConfig).toBeDefined();

    enableConfig.onSuccess?.();
    expect(mockToastSuccess).toHaveBeenCalledWith("Webhook enabled");

    enableConfig.onError?.(new Error("fail"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to enable webhook");
  });

  it("registers disable mutation with correct callbacks", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Disable is fourth (index 3)
    const disableConfig = mutationConfigs[3];
    expect(disableConfig).toBeDefined();

    disableConfig.onSuccess?.();
    expect(mockToastSuccess).toHaveBeenCalledWith("Webhook disabled");

    disableConfig.onError?.(new Error("fail"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to disable webhook");
  });

  it("registers test mutation with correct success callback for successful test", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    // Test is fifth (index 4)
    const testConfig = mutationConfigs[4];
    expect(testConfig).toBeDefined();

    testConfig.onSuccess?.({ success: true, status_code: 200 });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Test delivery succeeded (HTTP 200)"
    );
  });

  it("registers test mutation showing error toast on failed test delivery", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const testConfig = mutationConfigs[4];
    testConfig.onSuccess?.({ success: false, error: "Connection refused" });
    expect(mockToastError).toHaveBeenCalledWith("Connection refused");
  });

  it("registers test mutation showing generic message on failed test without error", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const testConfig = mutationConfigs[4];
    testConfig.onSuccess?.({ success: false });
    expect(mockToastError).toHaveBeenCalledWith("Test delivery failed");
  });

  it("registers test mutation with correct onError callback", () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const testConfig = mutationConfigs[4];
    testConfig.onError?.(new Error("timeout"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to send test");
  });

  // -----------------------------------------------------------------------
  // Create webhook form validation
  // -----------------------------------------------------------------------

  it("shows error toast when create is submitted with empty fields", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    await userEvent.click(screen.getByTestId("add-webhook-button"));

    // Click create without filling in fields
    await userEvent.click(screen.getByTestId("create-webhook-submit"));
    expect(mockToastError).toHaveBeenCalledWith(
      "Name, URL, and at least one event are required"
    );
  });

  // -----------------------------------------------------------------------
  // Webhook card action buttons
  // -----------------------------------------------------------------------

  it("renders action buttons on each webhook card", () => {
    queryResponses["webhooks"] = {
      data: { items: [SAMPLE_WEBHOOKS[0]], total: 1 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const card = screen.getByTestId("webhook-card-wh-1");
    const testBtn = within(card).getByRole("button", { name: "Test webhook" });
    const toggleBtn = within(card).getByRole("button", {
      name: "Disable webhook",
    });
    const deleteBtn = within(card).getByRole("button", {
      name: "Delete webhook",
    });

    expect(testBtn).toBeInTheDocument();
    expect(toggleBtn).toBeInTheDocument();
    expect(deleteBtn).toBeInTheDocument();
  });

  it("renders Enable button for inactive webhooks", () => {
    queryResponses["webhooks"] = {
      data: { items: [SAMPLE_WEBHOOKS[1]], total: 1 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const card = screen.getByTestId("webhook-card-wh-2");
    const enableBtn = within(card).getByRole("button", {
      name: "Enable webhook",
    });
    expect(enableBtn).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // WEBHOOK_EVENTS constant
  // -----------------------------------------------------------------------

  it("exports WEBHOOK_EVENTS with 9 event types", () => {
    expect(WEBHOOK_EVENTS).toHaveLength(9);
    expect(WEBHOOK_EVENTS.map((e) => e.value)).toContain("artifact_uploaded");
    expect(WEBHOOK_EVENTS.map((e) => e.value)).toContain("build_completed");
    expect(WEBHOOK_EVENTS.map((e) => e.value)).toContain("repository_deleted");
  });

  // -----------------------------------------------------------------------
  // Query function coverage
  // -----------------------------------------------------------------------

  it("calls webhooksApi.list with repository_id", () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-456" />);
    expect(mockList).toHaveBeenCalledWith({ repository_id: "repo-456" });
  });

  // -----------------------------------------------------------------------
  // Mutation function coverage (exercise the mutationFn arrows)
  // -----------------------------------------------------------------------

  it("create mutationFn calls webhooksApi.create", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const createConfig = mutationConfigs[0];
    const payload = {
      name: "Test",
      url: "https://example.com",
      events: ["artifact_uploaded"],
      repository_id: "repo-123",
    };
    mockCreate.mockResolvedValue({ id: "new-1" });
    await createConfig.mutationFn(payload);
    expect(mockCreate).toHaveBeenCalledWith(payload);
  });

  it("delete mutationFn calls webhooksApi.delete", async () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const deleteConfig = mutationConfigs[1];
    mockDelete.mockResolvedValue(undefined);
    await deleteConfig.mutationFn("wh-1");
    expect(mockDelete).toHaveBeenCalledWith("wh-1");
  });

  it("enable mutationFn calls webhooksApi.enable", async () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const enableConfig = mutationConfigs[2];
    mockEnable.mockResolvedValue(undefined);
    await enableConfig.mutationFn("wh-2");
    expect(mockEnable).toHaveBeenCalledWith("wh-2");
  });

  it("disable mutationFn calls webhooksApi.disable", async () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const disableConfig = mutationConfigs[3];
    mockDisable.mockResolvedValue(undefined);
    await disableConfig.mutationFn("wh-1");
    expect(mockDisable).toHaveBeenCalledWith("wh-1");
  });

  it("test mutationFn calls webhooksApi.test", async () => {
    queryResponses["webhooks"] = {
      data: { items: SAMPLE_WEBHOOKS, total: 2 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);

    const testConfig = mutationConfigs[4];
    mockTest.mockResolvedValue({ success: true, status_code: 200 });
    await testConfig.mutationFn("wh-1");
    expect(mockTest).toHaveBeenCalledWith("wh-1");
  });

  // -----------------------------------------------------------------------
  // Checkbox toggling
  // -----------------------------------------------------------------------

  it("toggles event checkboxes in the create dialog", async () => {
    queryResponses["webhooks"] = {
      data: { items: [], total: 0 },
      isLoading: false,
    };
    render(<NotificationsTabContent repositoryId="repo-123" />);
    await userEvent.click(screen.getByTestId("add-webhook-button"));

    const checkboxes = screen.getAllByTestId("mock-checkbox");
    expect(checkboxes.length).toBe(WEBHOOK_EVENTS.length);

    // Check first checkbox
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();

    // Uncheck it
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });
});
