// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Plus: stub("Plus"),
    RefreshCw: stub("RefreshCw"),
    Trash2: stub("Trash2"),
    Zap: stub("Zap"),
    History: stub("History"),
    Play: stub("Play"),
    Pause: stub("Pause"),
    Send: stub("Send"),
    RotateCcw: stub("RotateCcw"),
    Webhook: stub("Webhook"),
    ChevronDownIcon: stub("ChevronDownIcon"),
    ChevronUpIcon: stub("ChevronUpIcon"),
    CheckIcon: stub("CheckIcon"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/api/webhooks", () => ({
  webhooksApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    test: vi.fn(),
    listDeliveries: vi.fn(),
    redeliver: vi.fn(),
  },
}));

// UI mocks
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea data-testid="textarea" {...props} />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-root" data-value={value}>
      {typeof children === "function"
        ? children({ value, onValueChange })
        : children}
    </div>
  ),
  SelectTrigger: ({ children, ...props }: any) => (
    <button data-testid="select-trigger" {...props}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value, ...props }: any) => (
    <div data-testid={`select-item-${value}`} data-value={value} {...props}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: any) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog">
        <button
          data-testid="dialog-close-trigger"
          onClick={() => onOpenChange?.(false)}
        >
          Close
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: any) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: any) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: any) => (
    <div data-testid="sheet-header">{children}</div>
  ),
  SheetTitle: ({ children }: any) => <h3>{children}</h3>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

// Common components
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, description, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      <div data-testid="page-header-actions">{actions}</div>
    </div>
  ),
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ data, columns, loading, emptyMessage, rowKey }: any) => {
    if (loading) return <div data-testid="data-table-loading">Loading...</div>;
    if (!data || data.length === 0)
      return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <table data-testid="data-table">
        <thead>
          <tr>
            {columns.map((c: any) => (
              <th key={c.id}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, i: number) => (
            <tr key={rowKey ? rowKey(row) : i} data-testid="data-table-row">
              {columns.map((c: any) => {
                if (c.accessor) c.accessor(row);
                return <td key={c.id}>{c.cell ? c.cell(row) : null}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title, onConfirm, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-btn" onClick={onConfirm}>
          Confirm
        </button>
        <button
          data-testid="cancel-confirm-btn"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: any) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title, description, action }: any) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Store mutation handlers so tests can invoke callbacks
let capturedMutationOpts: Record<string, any> = {};

function setupQueryMock(overrides?: Partial<ReturnType<typeof mockUseQuery>>) {
  mockUseQuery.mockImplementation((opts: any) => {
    if (opts.queryKey[0] === "webhooks") {
      return {
        data: { items: [], total: 0 },
        isLoading: false,
        isFetching: false,
        ...overrides,
      };
    }
    // webhook-deliveries
    return {
      data: { items: [], total: 0 },
      isLoading: false,
      isFetching: false,
    };
  });
}

function setupMutationMock() {
  capturedMutationOpts = {};
  mockUseMutation.mockImplementation((opts: any) => {
    // Identify mutation by inspecting mutationFn.toString or onSuccess toast message
    const key = opts.onSuccess?.toString?.().includes("Webhook created")
      ? "create"
      : opts.onSuccess?.toString?.().includes("Webhook deleted")
        ? "delete"
        : opts.onSuccess?.toString?.().includes("Webhook enabled")
          ? "enable"
          : opts.onSuccess?.toString?.().includes("Webhook disabled")
            ? "disable"
            : opts.onSuccess?.toString?.().includes("Test succeeded")
              ? "test"
              : "other";
    capturedMutationOpts[key] = opts;
    return {
      mutate: vi.fn((values: any) => {
        opts.mutationFn?.(values);
      }),
      isPending: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhooksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupQueryMock();
    setupMutationMock();
  });

  afterEach(() => cleanup());

  async function renderPage() {
    const mod = await import("../../webhooks/page");
    const Page = mod.default;
    return render(<Page />);
  }

  // -- Basic rendering --

  it("renders the page header with title", async () => {
    await renderPage();
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
  });

  it("shows empty state when no webhooks exist", async () => {
    await renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No webhooks configured")).toBeInTheDocument();
  });

  it("shows data table when webhooks exist", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "My Hook",
            url: "https://example.com/hook",
            events: ["artifact_uploaded"],
            is_enabled: true,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        total: 1,
      },
    });
    await renderPage();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByText("My Hook")).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    setupQueryMock({ isLoading: true, data: undefined });
    await renderPage();
    expect(screen.getByTestId("data-table-loading")).toBeInTheDocument();
  });

  // -- Stats cards --

  it("displays stats cards with correct counts", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "A",
            url: "https://a.com",
            events: [],
            is_enabled: true,
            created_at: "2026-01-01",
          },
          {
            id: "w2",
            name: "B",
            url: "https://b.com",
            events: [],
            is_enabled: false,
            created_at: "2026-01-01",
          },
          {
            id: "w3",
            name: "C",
            url: "https://c.com",
            events: [],
            is_enabled: true,
            created_at: "2026-01-01",
          },
        ],
        total: 3,
      },
    });
    await renderPage();
    // Total: 3, Active: 2, Disabled: 1
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // -- Create dialog --

  it("opens create dialog on button click", async () => {
    await renderPage();
    const createBtns = screen.getAllByText("Create Webhook");
    await act(async () => {
      fireEvent.click(createBtns[0]);
    });
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Configure a new webhook to receive event notifications.")
    ).toBeInTheDocument();
  });

  it("validates that at least one event is selected", async () => {
    const { toast } = await import("sonner");
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Create Webhook")[0]);
    });
    // Fill required fields but no events
    const nameInput = screen.getByPlaceholderText("e.g., Slack Notifications");
    const urlInput = screen.getByPlaceholderText("https://example.com/webhook");
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Test" } });
      fireEvent.change(urlInput, { target: { value: "https://test.com" } });
    });
    // Submit
    const form = screen.getByTestId("dialog-content").querySelector("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(toast.error).toHaveBeenCalledWith("Select at least one event");
  });

  it("resets form on cancel", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Create Webhook")[0]);
    });

    // Type in the name field
    const nameInput = screen.getByPlaceholderText("e.g., Slack Notifications");
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "My Hook" } });
    });
    expect(nameInput).toHaveValue("My Hook");

    // Click cancel
    const cancelBtn = screen.getByText("Cancel");
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // Dialog should be closed
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("closes dialog via onOpenChange(false)", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Create Webhook")[0]);
    });
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    // Trigger the close callback
    await act(async () => {
      fireEvent.click(screen.getByTestId("dialog-close-trigger"));
    });
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  // -- Table columns --

  it("renders table columns including actions", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "Deploy Hook",
            url: "https://example.com",
            events: ["artifact_uploaded", "artifact_deleted"],
            is_enabled: true,
            last_triggered_at: "2026-04-01T12:00:00Z",
            created_at: "2026-01-01",
          },
        ],
        total: 1,
      },
    });
    await renderPage();
    expect(screen.getByText("Deploy Hook")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("artifact uploaded")).toBeInTheDocument();
    expect(screen.getByText("artifact deleted")).toBeInTheDocument();
  });

  it("shows disabled badge for disabled webhooks", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "Disabled Hook",
            url: "https://example.com",
            events: [],
            is_enabled: false,
            created_at: "2026-01-01",
          },
        ],
        total: 1,
      },
    });
    await renderPage();
    expect(screen.getByText("Disabled Hook")).toBeInTheDocument();
    expect(screen.getByText("Disabled", { selector: "[data-testid='badge']" })).toBeInTheDocument();
  });

  it("shows Never when last_triggered_at is null", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "New Hook",
            url: "https://example.com",
            events: [],
            is_enabled: true,
            last_triggered_at: null,
            created_at: "2026-01-01",
          },
        ],
        total: 1,
      },
    });
    await renderPage();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  // -- Event badge colors --

  it("applies correct event badge color classes", async () => {
    setupQueryMock({
      data: {
        items: [
          {
            id: "w1",
            name: "Hook",
            url: "https://ex.com",
            events: [
              "artifact_uploaded",
              "artifact_deleted",
              "build_started",
              "repository_created",
            ],
            is_enabled: true,
            created_at: "2026-01-01",
          },
        ],
        total: 1,
      },
    });
    await renderPage();
    // Green events
    const uploaded = screen.getByText("artifact uploaded");
    expect(uploaded.className).toContain("emerald");
    // Red events
    const deleted = screen.getByText("artifact deleted");
    expect(deleted.className).toContain("red");
    // Blue events
    const started = screen.getByText("build started");
    expect(started.className).toContain("blue");
  });
});

