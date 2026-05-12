// @vitest-environment jsdom
//
// Regression test for #378 — "Webhook payload_template form field has no
// backend support".
//
// The backend SDK's CreateWebhookRequest never accepted `payload_template`,
// and the frontend `adaptCreateRequest` adapter drops it before sending —
// so the textarea on the webhooks-create form has been a placebo: typing
// into it has zero effect on what reaches the server. The issue picks
// Option 1: REMOVE the form field (and the local `payload_template`
// type). This test pins that outcome so it can't regress.
//
// What this test asserts:
//   (a) The create-webhook form does NOT render any element labelled or
//       identified as "payload_template" / "Payload Template" /
//       "Template Body".
//   (b) The create mutation, when submitted, is called with values that
//       do NOT contain a `payload_template` key.
//
// Currently FAILS on main: both the <Select id="wh-template-preset"> and
// <Textarea id="wh-payload-template"> elements render, and the form's
// `createMutation.mutate({ ..., payload_template: ... })` always includes
// the key (even when empty/undefined).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks (mirrors the patterns in ./page.test.tsx; kept compact here)
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  // Each icon imported by page.tsx must be enumerated here — vi.mock requires
  // a static record, not a Proxy.
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
    Search: stub("Search"),
    Filter: stub("Filter"),
    X: stub("X"),
    AlertCircle: stub("AlertCircle"),
    CheckCircle: stub("CheckCircle"),
    Clock: stub("Clock"),
    Loader2: stub("Loader2"),
    Copy: stub("Copy"),
    ExternalLink: stub("ExternalLink"),
    MoreHorizontal: stub("MoreHorizontal"),
    Eye: stub("Eye"),
    EyeOff: stub("EyeOff"),
    Settings: stub("Settings"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useMutation: (opts: Record<string, unknown>) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockWebhooksApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
  listDeliveries: vi.fn(),
  redeliver: vi.fn(),
};
vi.mock("@/lib/api/webhooks", () => ({
  webhooksApi: mockWebhooksApi,
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (e: unknown) => String(e),
  mutationErrorToast: () => () => {},
}));

// UI primitive mocks
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: { checked?: boolean; onCheckedChange?: (v: boolean) => void } & Record<string, unknown>) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      onChange={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea data-testid="textarea" {...props} />,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {typeof children === "function"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (children as any)({ value, onValueChange })
        : children}
    </div>
  ),
  SelectTrigger: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button data-testid="select-trigger" {...props}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    children,
    value,
    ...props
  }: { children: React.ReactNode; value: string } & Record<string, unknown>) => (
    <div role="option" data-value={value} {...props}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog-content">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-header">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: Record<string, unknown>) => <div data-testid="skeleton" {...props} />,
}));
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ emptyMessage }: { emptyMessage?: string }) => (
    <div data-testid="data-table-empty">{emptyMessage}</div>
  ),
}));
vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="confirm-dialog" /> : null,
}));
vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ action }: { action?: React.ReactNode }) => (
    <div data-testid="empty-state">{action}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Mutation capture
// ---------------------------------------------------------------------------

interface MutationCapture {
  mutate: ReturnType<typeof vi.fn>;
}
let createMutationCapture: MutationCapture | null = null;

function setupMutationMock() {
  createMutationCapture = null;
  mockUseMutation.mockImplementation(
    (opts: { onSuccess?: () => void; mutationFn?: (v: unknown) => unknown }) => {
      const isCreate = opts.onSuccess?.toString?.().includes("Webhook created");
      const mutate = vi.fn((values: unknown) => {
        opts.mutationFn?.(values);
      });
      const result = { mutate, isPending: false };
      if (isCreate) createMutationCapture = result;
      return result;
    },
  );
}

function setupQueryMock() {
  mockUseQuery.mockImplementation(() => ({
    data: { items: [], total: 0 },
    isLoading: false,
    isFetching: false,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Webhooks create form — payload_template removed (regression #378)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupQueryMock();
    setupMutationMock();
  });

  afterEach(() => cleanup());

  async function renderPage() {
    const mod = await import("../page");
    const Page = mod.default;
    return render(<Page />);
  }

  async function openCreateDialog() {
    // The "Create Webhook" button on the page header opens the dialog.
    const buttons = screen.getAllByText(/Create Webhook/i);
    await act(async () => {
      fireEvent.click(buttons[0]);
    });
  }

  it("does not render a payload_template form control", async () => {
    await renderPage();
    await openCreateDialog();

    // (a) No element with id `wh-payload-template` (the existing textarea).
    expect(document.getElementById("wh-payload-template")).toBeNull();

    // (a, cont.) No element with id `wh-template-preset` (the preset select).
    expect(document.getElementById("wh-template-preset")).toBeNull();

    // (a, cont.) No label containing "Payload Template" or "Template Body".
    expect(screen.queryByText(/Payload Template/i)).toBeNull();
    expect(screen.queryByText(/Template Body/i)).toBeNull();
  });

  it("submits the create form without a payload_template key", async () => {
    await renderPage();
    await openCreateDialog();

    // Fill minimum required fields: name, url, at least one event.
    const nameInput = screen.getByPlaceholderText("e.g., Slack Notifications");
    const urlInput = screen.getByPlaceholderText("https://example.com/webhook");
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Hook" } });
      fireEvent.change(urlInput, { target: { value: "https://example.test/wh" } });
    });
    const dialog = screen.getByTestId("dialog-content");
    const checkboxes = dialog.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });

    const form = dialog.querySelector("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });

    // The create mutation must have been invoked.
    expect(createMutationCapture).not.toBeNull();
    const mutate = createMutationCapture!.mutate;
    expect(mutate).toHaveBeenCalledTimes(1);

    const submitted = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted).toBeDefined();

    // (b) The submitted values must not contain `payload_template` at all —
    // not even as `undefined`. Today the form spreads it as a literal key.
    expect("payload_template" in submitted).toBe(false);
  });
});
