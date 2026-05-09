// @vitest-environment jsdom
//
// Regression test for issue #319: the Add Connection dialog must let the user
// pick a source registry type (Artifactory vs Nexus) and pass it to the
// createConnection mutation as `source_type`. Before the fix the dialog had no
// such control, so the backend silently defaulted to "artifactory" and Nexus
// migrations could not be set up from the UI.
import * as React from "react";
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
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Plus: stub("Plus"),
    RefreshCw: stub("RefreshCw"),
    Trash2: stub("Trash2"),
    Play: stub("Play"),
    Pause: stub("Pause"),
    Square: stub("Square"),
    RotateCcw: stub("RotateCcw"),
    Database: stub("Database"),
    FileText: stub("FileText"),
    CheckCircle2: stub("CheckCircle2"),
    XCircle: stub("XCircle"),
    AlertTriangle: stub("AlertTriangle"),
    Loader2: stub("Loader2"),
    Unplug: stub("Unplug"),
    ArrowRight: stub("ArrowRight"),
    Download: stub("Download"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

type MutationOpts = {
  mutationFn?: (vars: unknown) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
};
type QueryOpts = { queryKey: unknown[]; queryFn?: () => unknown };

const mockUseQuery = vi.fn<(opts: QueryOpts) => unknown>();
const mockUseMutation = vi.fn<(opts: MutationOpts) => unknown>();
const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: QueryOpts) => mockUseQuery(opts),
  useMutation: (opts: MutationOpts) => mockUseMutation(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/api/migration", () => ({
  migrationApi: {
    listConnections: vi.fn(),
    createConnection: vi.fn(),
    deleteConnection: vi.fn(),
    testConnection: vi.fn(),
    listMigrations: vi.fn(),
    listMigrationItems: vi.fn(),
    createMigration: vi.fn(),
    deleteMigration: vi.fn(),
    startMigration: vi.fn(),
    pauseMigration: vi.fn(),
    resumeMigration: vi.fn(),
    cancelMigration: vi.fn(),
    createProgressStream: vi.fn(),
  },
}));

// UI primitive mocks (mirror the patterns used in src/app/(app)/(protected)/webhooks/__tests__/page.test.tsx)

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...(props as Record<string, unknown>)}>{children as React.ReactNode}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: Record<string, unknown>) => (
    <label {...(props as Record<string, unknown>)}>{children as React.ReactNode}</label>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: () => <div data-testid="progress" />,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Tabs mock that tracks the active tab. Without this, both TabsContent panes
// render at once and tests see duplicates of every shared element (empty
// state, icons, etc.). The mock uses React state so a TabsTrigger click
// switches the active value.
vi.mock("@/components/ui/tabs", () => {
  const TabsCtx = React.createContext<{
    value: string;
    setValue: (v: string) => void;
  }>({ value: "", setValue: () => {} });
  return {
    Tabs: ({
      defaultValue,
      children,
    }: {
      defaultValue?: string;
      children?: React.ReactNode;
    }) => {
      const [value, setValue] = React.useState(defaultValue ?? "");
      return (
        <TabsCtx.Provider value={{ value, setValue }}>
          <div data-testid="tabs">{children}</div>
        </TabsCtx.Provider>
      );
    },
    TabsList: ({ children }: { children?: React.ReactNode }) => (
      <div role="tablist">{children}</div>
    ),
    TabsTrigger: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(TabsCtx);
      return (
        <button
          role="tab"
          data-testid={`tab-${value}`}
          onClick={() => ctx.setValue(value)}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(TabsCtx);
      return ctx.value === value ? (
        <div data-testid={`tab-content-${value}`}>{children}</div>
      ) : null;
    },
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Select so each SelectItem becomes a clickable button that dispatches
// the parent Select's onValueChange — that lets a test simulate the user
// picking an option and verify the submit payload reflects the choice.
vi.mock("@/components/ui/select", () => {
  const SelectCtx = React.createContext<{
    onValueChange?: (v: string) => void;
    value?: string;
  }>({});
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children?: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
    }) => (
      <SelectCtx.Provider value={{ onValueChange, value }}>
        <div data-testid="select-root" data-value={value}>
          {children}
        </div>
      </SelectCtx.Provider>
    ),
    SelectTrigger: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
      <button data-testid={id ? `select-trigger-${id}` : "select-trigger"}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span data-testid="select-value">{placeholder}</span>
    ),
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value: string }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return (
        <button
          type="button"
          data-testid={`select-item-${value}`}
          data-value={value}
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title?: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));

// DataTable mock that actually iterates columns + rows so the page's
// `cell()` accessors run. Without this the column definitions go unexercised
// and changed-line coverage stays low.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    columns,
    loading,
    emptyMessage,
    rowKey,
  }: {
    data?: ReadonlyArray<Record<string, unknown>>;
    columns: ReadonlyArray<{
      id: string;
      header?: React.ReactNode;
      cell?: (row: Record<string, unknown>) => React.ReactNode;
      accessor?: (row: Record<string, unknown>) => unknown;
    }>;
    loading?: boolean;
    emptyMessage?: string;
    rowKey?: (row: Record<string, unknown>) => string;
  }) => {
    if (loading) return <div data-testid="data-table-loading">Loading...</div>;
    if (!data || data.length === 0)
      return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <table data-testid="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id}>{c.header as React.ReactNode}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row) : i}
              data-testid="data-table-row"
            >
              {columns.map((c) => {
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
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onOpenChange,
  }: {
    open?: boolean;
    title?: string;
    onConfirm?: () => void;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-btn" onClick={() => onConfirm?.()}>
          Confirm
        </button>
        <button
          data-testid="cancel-confirm-btn"
          onClick={() => onOpenChange?.(false)}
        >
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: { status?: string }) => <span>{status}</span>,
}));

vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title, action }: { title?: string; action?: React.ReactNode }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {action}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CapturedMutation = {
  opts: MutationOpts;
  mutate: ReturnType<typeof vi.fn>;
};

let capturedMutations: Record<string, CapturedMutation> = {};

function classifyMutation(opts: MutationOpts): string {
  const src = opts.onSuccess?.toString?.() ?? "";
  if (src.includes("Connection created")) return "createConn";
  if (src.includes("Connection deleted")) return "deleteConn";
  if (src.includes("Connection verified") || src.includes("Connection failed"))
    return "testConn";
  if (src.includes("Migration job created")) return "createMig";
  if (src.includes("Migration started")) return "startMig";
  if (src.includes("Migration paused")) return "pauseMig";
  if (src.includes("Migration resumed")) return "resumeMig";
  if (src.includes("Migration cancelled")) return "cancelMig";
  if (src.includes("Migration deleted")) return "deleteMig";
  return "other";
}

function setupMocks() {
  capturedMutations = {};
  mockUseQuery.mockImplementation((opts: QueryOpts) => {
    const k = opts.queryKey;
    if (Array.isArray(k) && k[0] === "migration" && k[1] === "connections") {
      return { data: [], isLoading: false };
    }
    if (Array.isArray(k) && k[0] === "migration" && k[1] === "jobs") {
      return { data: { items: [], pagination: {} }, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  });
  mockUseMutation.mockImplementation((opts: MutationOpts) => {
    const key = classifyMutation(opts);
    const mutate = vi.fn((vars: unknown) => {
      opts.mutationFn?.(vars);
    });
    capturedMutations[key] = { opts, mutate };
    return { mutate, isPending: false };
  });
}

async function renderPage() {
  const mod = await import("../page");
  const Page = mod.default;
  return render(<Page />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MigrationPage Add Connection — source_type selector (issue #319)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => cleanup());

  async function openAddConnectionDialog() {
    await renderPage();
    // The page renders both a header button and an empty-state action button
    // labeled "Add Connection". Click the first one.
    const buttons = screen.getAllByText("Add Connection");
    await act(async () => {
      fireEvent.click(buttons[0]);
    });
  }

  // The Source Type label sits in the same `space-y-2` wrapper as its Select.
  // Scoping queries to that wrapper avoids matching the auth-type Select.
  function getSourceTypeWrapper(): HTMLElement {
    return screen.getByText("Source Type").parentElement!;
  }

  // Fill the three required text fields and submit the (only) form in the
  // dialog. Returns the captured payload of the createConnection mutation.
  async function fillAndSubmitForm(name: string): Promise<Record<string, unknown>> {
    const nameInput = screen.getByPlaceholderText(/Production Artifactory/i);
    const urlInput = screen.getByPlaceholderText(/artifactory\.example\.com/i);
    const tokenInput = screen.getByPlaceholderText(/Enter API token/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: name } });
      fireEvent.change(urlInput, { target: { value: "https://nexus.example.com" } });
      fireEvent.change(tokenInput, { target: { value: "tok" } });
    });
    const form = screen.getByTestId("dialog-content").querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form!);
    });
    const create = capturedMutations.createConn;
    expect(create).toBeDefined();
    expect(create.mutate).toHaveBeenCalledTimes(1);
    return create.mutate.mock.calls[0][0] as Record<string, unknown>;
  }

  it("renders a Source Type label and field in the Add Connection dialog", async () => {
    await openAddConnectionDialog();
    expect(screen.getByText("Source Type")).toBeInTheDocument();
  });

  it("offers Artifactory and Nexus as source-type options", async () => {
    await openAddConnectionDialog();
    expect(screen.getByTestId("select-item-artifactory")).toBeInTheDocument();
    expect(screen.getByTestId("select-item-nexus")).toBeInTheDocument();
  });

  it("defaults the source-type field to 'artifactory'", async () => {
    await openAddConnectionDialog();
    const selectRoot = getSourceTypeWrapper().querySelector(
      '[data-testid="select-root"]',
    );
    expect(selectRoot).not.toBeNull();
    expect(selectRoot!.getAttribute("data-value")).toBe("artifactory");
  });

  it("submits source_type in the createConnection mutation body", async () => {
    await openAddConnectionDialog();
    const submitted = await fillAndSubmitForm("Prod");
    expect(submitted).toHaveProperty("source_type");
    // The default selection is artifactory unless the user changes it.
    expect(submitted.source_type).toBe("artifactory");
  });

  it("propagates a Nexus selection through to the createConnection payload", async () => {
    await openAddConnectionDialog();
    const nexusItem = getSourceTypeWrapper().querySelector(
      '[data-testid="select-item-nexus"]',
    ) as HTMLElement | null;
    expect(nexusItem).not.toBeNull();
    await act(async () => {
      fireEvent.click(nexusItem!);
    });
    const submitted = await fillAndSubmitForm("Nexus Prod");
    expect(submitted.source_type).toBe("nexus");
  });
});

// ---------------------------------------------------------------------------
// Coverage tests — exercise the rest of MigrationPage so changed-line coverage
// for page.tsx clears the CI gate (see issue #319 acceptance criteria).
// ---------------------------------------------------------------------------

import type {
  SourceConnection,
  MigrationJob,
  MigrationItem,
  MigrationJobStatus,
} from "@/types";
import { toast } from "sonner";

type ListConnectionsResult = readonly SourceConnection[];
type ListMigrationsResult = {
  items: readonly MigrationJob[];
  pagination: Record<string, unknown>;
};
type ListItemsResult = {
  items: readonly MigrationItem[];
  pagination: Record<string, unknown>;
};

type QueryMap = {
  connections?: { data?: ListConnectionsResult; isLoading?: boolean };
  migrations?: { data?: ListMigrationsResult; isLoading?: boolean };
  items?: { data?: ListItemsResult; isLoading?: boolean };
};

function configureQueries(map: QueryMap = {}) {
  const conn = map.connections ?? { data: [], isLoading: false };
  const migs = map.migrations ?? {
    data: { items: [], pagination: {} },
    isLoading: false,
  };
  const items = map.items ?? {
    data: { items: [], pagination: {} },
    isLoading: false,
  };
  mockUseQuery.mockImplementation((opts: QueryOpts) => {
    const k = opts.queryKey;
    if (Array.isArray(k) && k[1] === "connections") return conn;
    if (Array.isArray(k) && k[1] === "jobs") return migs;
    if (Array.isArray(k) && k[1] === "items") return items;
    return { data: undefined, isLoading: false };
  });
}

function makeConnection(over: Partial<SourceConnection> = {}): SourceConnection {
  return {
    id: "conn-1",
    name: "Prod Artifactory",
    url: "https://artifactory.example.com",
    auth_type: "api_token",
    source_type: "artifactory",
    created_at: "2024-01-01T00:00:00Z",
    verified_at: "2024-01-02T00:00:00Z",
    ...over,
  };
}

function makeJob(over: Partial<MigrationJob> = {}): MigrationJob {
  return {
    id: "job-12345678abcdef",
    source_connection_id: "conn-1",
    status: "running",
    job_type: "full",
    config: {},
    total_items: 100,
    completed_items: 42,
    failed_items: 0,
    skipped_items: 0,
    total_bytes: 1024 * 1024,
    transferred_bytes: 512 * 1024,
    progress_percent: 42,
    started_at: "2024-01-03T00:00:00Z",
    created_at: "2024-01-03T00:00:00Z",
    ...over,
  };
}

function makeItem(over: Partial<MigrationItem> = {}): MigrationItem {
  return {
    id: "item-1",
    job_id: "job-12345678abcdef",
    item_type: "artifact",
    source_path: "libs-release-local/foo/bar.jar",
    target_path: "libs-release-local/foo/bar.jar",
    status: "completed",
    size_bytes: 2048,
    retry_count: 0,
    ...over,
  };
}

// Stub the SSE EventSource so `startStream()` doesn't blow up when the
// startMigration / resumeMigration mutations' onSuccess closures run.
function makeFakeEventSource() {
  return {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as (() => void) | null,
    close: vi.fn(),
  };
}

describe("MigrationPage — connections list and actions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupMocks();
    const { migrationApi } = await import("@/lib/api/migration");
    (
      migrationApi.createProgressStream as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(makeFakeEventSource());
  });
  afterEach(() => cleanup());

  it("does not render the empty state while connections are loading", async () => {
    configureQueries({
      connections: { data: undefined, isLoading: true },
    });
    await renderPage();
    // While loading, the page picks the DataTable branch (not EmptyState)
    // because the `connections.length === 0 && !connectionsLoading` guard is
    // false. The mock DataTable shows a "Loading..." marker.
    expect(screen.getByTestId("data-table-loading")).toBeInTheDocument();
    expect(screen.queryByText("No connections")).not.toBeInTheDocument();
  });

  it("renders the EmptyState with an Add Connection CTA when there are no connections", async () => {
    configureQueries();
    await renderPage();
    // Only one EmptyState renders (the connections tab is active by default).
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent("No connections");
    // Both the header CTA and the empty-state CTA render the same label.
    expect(screen.getAllByText("Add Connection").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a row per connection with name, URL, auth type, and verified status", async () => {
    configureQueries({
      connections: {
        data: [
          makeConnection({ id: "c1", name: "Prod", auth_type: "api_token" }),
          makeConnection({
            id: "c2",
            name: "Staging",
            url: "https://staging.example.com",
            auth_type: "basic_auth",
            verified_at: undefined,
          }),
        ],
        isLoading: false,
      },
    });
    await renderPage();
    const rows = screen.getAllByTestId("data-table-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Prod")).toBeInTheDocument();
    expect(screen.getByText("Staging")).toBeInTheDocument();
    expect(screen.getByText("https://artifactory.example.com")).toBeInTheDocument();
    expect(screen.getByText("https://staging.example.com")).toBeInTheDocument();
    expect(screen.getByText("API Token")).toBeInTheDocument();
    expect(screen.getByText("Basic Auth")).toBeInTheDocument();
    // verified_at present → row 0 shows "Verified" (in a span), absent → "Unverified".
    // Scope to row to avoid matching the column header <th>Verified</th>.
    const verifiedCell = rows[0].querySelector("span");
    expect(rows[0].textContent).toContain("Verified");
    expect(verifiedCell).not.toBeNull();
    expect(rows[1].textContent).toContain("Unverified");
  });

  it("invokes the testConnection mutation when the test (Unplug) button is clicked", async () => {
    configureQueries({
      connections: { data: [makeConnection({ id: "c1" })], isLoading: false },
    });
    await renderPage();
    // The actions cell contains an Unplug icon inside a button. Find it via
    // the icon test-id and walk to the parent <button>.
    const unplug = screen.getByTestId("icon-Unplug");
    const btn = unplug.closest("button");
    expect(btn).not.toBeNull();
    await act(async () => {
      fireEvent.click(btn!);
    });
    expect(capturedMutations.testConn).toBeDefined();
    expect(capturedMutations.testConn.mutate).toHaveBeenCalledWith("c1");
  });

  it("toasts success with version when testConnection succeeds and a version is returned", () => {
    configureQueries({ connections: { data: [makeConnection()], isLoading: false } });
    return renderPage().then(() => {
      const opts = capturedMutations.testConn.opts;
      // Drive the success branch directly so we exercise the success copy.
      opts.onSuccess?.({
        success: true,
        message: "ok",
        artifactory_version: "7.55.10",
      });
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Artifactory 7.55.10"),
      );
    });
  });

  it("toasts an error when testConnection returns success: false", async () => {
    configureQueries({ connections: { data: [makeConnection()], isLoading: false } });
    await renderPage();
    capturedMutations.testConn.opts.onSuccess?.({
      success: false,
      message: "401 Unauthorized",
    });
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("401 Unauthorized"),
    );
  });

  it("toasts via toUserMessage when testConnection's mutationFn rejects", async () => {
    configureQueries({ connections: { data: [makeConnection()], isLoading: false } });
    await renderPage();
    capturedMutations.testConn.opts.onError?.(new Error("network down"));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("network down"),
    );
  });

  it("opens a delete-confirm dialog when the trash button is clicked, and the cancel button closes it", async () => {
    configureQueries({
      connections: { data: [makeConnection({ id: "c1" })], isLoading: false },
    });
    await renderPage();
    // Two trash buttons would exist if there were also migration rows; here
    // only the connection delete is visible.
    const trash = screen.getByTestId("icon-Trash2").closest("button");
    expect(trash).not.toBeNull();
    await act(async () => {
      fireEvent.click(trash!);
    });
    const confirm = screen.getByTestId("confirm-dialog");
    expect(confirm).toHaveTextContent("Delete Connection");

    // Cancel path closes the dialog and never fires deleteConn.
    await act(async () => {
      fireEvent.click(screen.getByTestId("cancel-confirm-btn"));
    });
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(capturedMutations.deleteConn?.mutate ?? vi.fn()).not.toHaveBeenCalled();
  });

  it("fires the deleteConnection mutation when the confirm button is clicked", async () => {
    configureQueries({
      connections: { data: [makeConnection({ id: "c1" })], isLoading: false },
    });
    await renderPage();
    const trash = screen.getByTestId("icon-Trash2").closest("button");
    await act(async () => {
      fireEvent.click(trash!);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-btn"));
    });
    expect(capturedMutations.deleteConn).toBeDefined();
    expect(capturedMutations.deleteConn.mutate).toHaveBeenCalledWith("c1");
  });

  it("toasts success and invalidates the connections query after createConnection succeeds", async () => {
    configureQueries();
    await renderPage();
    // Open the dialog so createConn mutation gets registered (it always is at
    // mount, but we exercise the post-success closure here).
    capturedMutations.createConn.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Connection created");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["migration", "connections"],
    });
  });

  it("toasts an error on createConnection failure", async () => {
    configureQueries();
    await renderPage();
    capturedMutations.createConn.opts.onError?.({ detail: "duplicate name" });
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("duplicate name"),
    );
  });

  it("invalidates and toasts on deleteConnection success and error branches", async () => {
    configureQueries();
    await renderPage();
    capturedMutations.deleteConn.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Connection deleted");
    capturedMutations.deleteConn.opts.onError?.(new Error("boom"));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
    );
  });

  it("invokes the refresh button to invalidate all migration queries", async () => {
    configureQueries();
    await renderPage();
    const refresh = screen.getByLabelText("Refresh migration data");
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["migration"],
    });
  });
});

describe("MigrationPage — migrations tab and status mutations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupMocks();
    const { migrationApi } = await import("@/lib/api/migration");
    (
      migrationApi.createProgressStream as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(makeFakeEventSource());
  });
  afterEach(() => cleanup());

  // The page mounts with the connections tab active. Click the jobs tab so
  // the migrations TabsContent renders.
  async function switchToJobsTab() {
    const jobsTab = screen.getByTestId("tab-jobs");
    await act(async () => {
      fireEvent.click(jobsTab);
    });
  }

  it("renders an EmptyState for migrations when no jobs exist and the CTA is disabled while there are no connections", async () => {
    configureQueries();
    await renderPage();
    await switchToJobsTab();
    expect(screen.getByText("No migration jobs")).toBeInTheDocument();
    // The header "Create Migration" button is disabled when connections is empty.
    const createBtns = screen.getAllByText("Create Migration");
    // At least one is the header CTA; both should be disabled.
    expect(createBtns.length).toBeGreaterThan(0);
    for (const b of createBtns) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("renders a row per migration job with id slice, source name, type, and items", async () => {
    const conn = makeConnection({ id: "conn-1", name: "Prod" });
    const job = makeJob({
      id: "abcd1234-5678-90ef-abcd-1234567890ef",
      source_connection_id: "conn-1",
      job_type: "full",
      status: "running",
      completed_items: 5,
      total_items: 10,
      failed_items: 2,
      progress_percent: 50,
      started_at: "2024-02-01T12:00:00Z",
    });
    configureQueries({
      connections: { data: [conn], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const rows = screen.getAllByTestId("data-table-row");
    expect(rows).toHaveLength(1);
    // id.slice(0,8) + "..."
    expect(screen.getByText("abcd1234...")).toBeInTheDocument();
    // Source resolved by name
    expect(screen.getByText("Prod")).toBeInTheDocument();
    // Type badge text
    expect(screen.getByText("full")).toBeInTheDocument();
    // Items "5/10"
    expect(screen.getByText(/5\/10/)).toBeInTheDocument();
    // failed_items annotation
    expect(screen.getByText(/\(2 failed\)/)).toBeInTheDocument();
    // 50% progress label rendered in cell
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("falls back to the source-id slice when the connection is unknown", async () => {
    const job = makeJob({
      id: "unkjob123456",
      source_connection_id: "ghost-1234abcd",
    });
    configureQueries({
      connections: { data: [], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    // Slice of the connection id, first 8 chars.
    expect(screen.getByText("ghost-12")).toBeInTheDocument();
  });

  it("renders the appropriate action buttons per job status (running → pause + cancel)", async () => {
    const job = makeJob({ status: "running" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    expect(screen.getByTestId("icon-Pause")).toBeInTheDocument();
    expect(screen.getByTestId("icon-Square")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-Play")).not.toBeInTheDocument();
    expect(screen.queryByTestId("icon-RotateCcw")).not.toBeInTheDocument();
  });

  it("renders Play for ready/pending and Resume for paused", async () => {
    const ready = makeJob({ id: "j1", status: "ready" });
    const paused = makeJob({ id: "j2", status: "paused" });
    const pending = makeJob({ id: "j3", status: "pending" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: {
        data: { items: [ready, paused, pending], pagination: {} },
        isLoading: false,
      },
    });
    await renderPage();
    await switchToJobsTab();
    // Play renders for ready + pending → 2 occurrences.
    expect(screen.getAllByTestId("icon-Play")).toHaveLength(2);
    // Resume (RotateCcw) renders only for the paused job.
    expect(screen.getAllByTestId("icon-RotateCcw")).toHaveLength(1);
  });

  it("clicking Play fires startMigration with the job id", async () => {
    const job = makeJob({ id: "ready-1", status: "ready" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const play = screen.getByTestId("icon-Play").closest("button");
    await act(async () => fireEvent.click(play!));
    expect(capturedMutations.startMig.mutate).toHaveBeenCalledWith("ready-1");
  });

  it("clicking Pause fires pauseMigration", async () => {
    const job = makeJob({ id: "run-1", status: "running" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const pause = screen.getByTestId("icon-Pause").closest("button");
    await act(async () => fireEvent.click(pause!));
    expect(capturedMutations.pauseMig.mutate).toHaveBeenCalledWith("run-1");
  });

  it("clicking Resume (paused) fires resumeMigration", async () => {
    const job = makeJob({ id: "p-1", status: "paused" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const resume = screen.getByTestId("icon-RotateCcw").closest("button");
    await act(async () => fireEvent.click(resume!));
    expect(capturedMutations.resumeMig.mutate).toHaveBeenCalledWith("p-1");
  });

  it("clicking Cancel (running) fires cancelMigration", async () => {
    const job = makeJob({ id: "run-2", status: "running" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const cancel = screen.getByTestId("icon-Square").closest("button");
    await act(async () => fireEvent.click(cancel!));
    expect(capturedMutations.cancelMig.mutate).toHaveBeenCalledWith("run-2");
  });

  it("clicking the trash on a finished job opens the delete migration confirm dialog", async () => {
    const job = makeJob({ id: "done-1", status: "completed" });
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    const trash = screen.getByTestId("icon-Trash2").closest("button");
    await act(async () => fireEvent.click(trash!));
    expect(screen.getByText("Delete Migration Job")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-btn"));
    });
    expect(capturedMutations.deleteMig.mutate).toHaveBeenCalledWith("done-1");
  });

  it("toasts on each migration mutation success/error branch", async () => {
    configureQueries();
    await renderPage();
    capturedMutations.createMig.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Migration job created");
    capturedMutations.createMig.opts.onError?.(new Error("bad"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("bad"));

    capturedMutations.startMig.opts.onSuccess?.({ id: "x" });
    expect(toast.success).toHaveBeenCalledWith("Migration started");
    capturedMutations.startMig.opts.onError?.(new Error("nope"));

    capturedMutations.pauseMig.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Migration paused");
    capturedMutations.pauseMig.opts.onError?.(new Error("p"));

    capturedMutations.resumeMig.opts.onSuccess?.({ id: "y" });
    expect(toast.success).toHaveBeenCalledWith("Migration resumed");
    capturedMutations.resumeMig.opts.onError?.(new Error("r"));

    capturedMutations.cancelMig.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Migration cancelled");
    capturedMutations.cancelMig.opts.onError?.(new Error("c"));

    capturedMutations.deleteMig.opts.onSuccess?.();
    expect(toast.success).toHaveBeenCalledWith("Migration deleted");
    capturedMutations.deleteMig.opts.onError?.(new Error("d"));
  });

  it("opens the Create Migration dialog and submits createMigration with the chosen connection + job type", async () => {
    const conn = makeConnection({ id: "conn-A", name: "AlphaConn" });
    configureQueries({
      connections: { data: [conn], isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    // Header "Create Migration" CTA is enabled now since connections exist.
    const createBtns = screen.getAllByText("Create Migration");
    // The first button is the header trigger. The empty-state action also
    // renders. Click the header one.
    await act(async () => fireEvent.click(createBtns[0]));
    // Dialog should now be open with placeholder "Select a connection".
    expect(screen.getByText("Create Migration Job")).toBeInTheDocument();
    // "AlphaConn" appears as the connection's SelectItem label inside the
    // dialog. (No conflict with a connections-tab row because we're on the
    // jobs tab now.)
    expect(screen.getByText("AlphaConn")).toBeInTheDocument();

    // Select the connection by clicking its SelectItem.
    const connItem = screen.getByTestId("select-item-conn-A");
    await act(async () => fireEvent.click(connItem));

    // Pick a non-default job type so we exercise the setMigForm branch.
    const incrementalItem = screen.getByTestId("select-item-incremental");
    await act(async () => fireEvent.click(incrementalItem));

    // Toggle the dry-run checkbox.
    const dryRun = screen.getByText(/Dry run/).querySelector("input");
    expect(dryRun).not.toBeNull();
    await act(async () => {
      fireEvent.click(dryRun!);
    });

    // Submit the form (find the form inside the migration dialog — there are
    // two open dialogs only when both create + detail are open; here only
    // one form is mounted because the connection dialog is closed).
    const forms = document.querySelectorAll("form");
    // Pick the form whose first SelectItem is "select-item-conn-A".
    let migForm: HTMLFormElement | null = null;
    forms.forEach((f) => {
      if (f.querySelector('[data-testid="select-item-conn-A"]')) {
        migForm = f as HTMLFormElement;
      }
    });
    expect(migForm).not.toBeNull();
    await act(async () => {
      fireEvent.submit(migForm!);
    });

    expect(capturedMutations.createMig.mutate).toHaveBeenCalledTimes(1);
    const payload = capturedMutations.createMig.mutate.mock.calls[0][0] as {
      source_connection_id: string;
      job_type: string;
      config: { dry_run: boolean };
    };
    expect(payload.source_connection_id).toBe("conn-A");
    expect(payload.job_type).toBe("incremental");
    expect(payload.config.dry_run).toBe(true);
  });

  it("opens the migration detail dialog and renders item rows when a job id is clicked", async () => {
    const job = makeJob({
      id: "detailjob-abcdef0123",
      status: "running",
      total_bytes: 4096,
      transferred_bytes: 2048,
      error_summary: "some warnings",
    });
    const items: MigrationItem[] = [
      makeItem({ id: "i1", status: "completed", size_bytes: 1024 }),
      makeItem({
        id: "i2",
        status: "failed",
        item_type: "repository",
        target_path: undefined,
        error_message: "checksum mismatch",
      }),
      makeItem({ id: "i3", status: "in_progress" }),
      makeItem({ id: "i4", status: "skipped" }),
      makeItem({ id: "i5", status: "pending" }),
    ];
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: [job], pagination: {} }, isLoading: false },
      items: { data: { items, pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    // The id-link renders as a button labeled "{id.slice(0,8)}...".
    const idBtn = screen.getByText("detailjo...");
    await act(async () => fireEvent.click(idBtn));
    // Detail dialog opens — the title interpolates the same id slice.
    expect(
      screen.getByText(/Migration Job: detailjo/),
    ).toBeInTheDocument();
    // error_summary banner renders when truthy.
    expect(screen.getByText("some warnings")).toBeInTheDocument();
    // The migration table contributes 1 row + the items table contributes 5.
    const rows = screen.getAllByTestId("data-table-row");
    expect(rows).toHaveLength(6);
    // Source path code element.
    expect(
      screen.getAllByText("libs-release-local/foo/bar.jar").length,
    ).toBeGreaterThan(0);
    // checksum mismatch error appears for the failed item.
    expect(screen.getByText("checksum mismatch")).toBeInTheDocument();
    // Skipped/pending/in_progress statuses each render a StatusBadge.
    expect(screen.getByText("in_progress")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("statusColor maps every job status to a color via rendered StatusBadge", async () => {
    const statuses: MigrationJobStatus[] = [
      "completed",
      "running",
      "assessing",
      "paused",
      "ready",
      "failed",
      "cancelled",
      "pending",
    ];
    const jobs = statuses.map((s, i) =>
      makeJob({ id: `job-${i}-aaaaaaa`, status: s }),
    );
    configureQueries({
      connections: { data: [makeConnection()], isLoading: false },
      migrations: { data: { items: jobs, pagination: {} }, isLoading: false },
    });
    await renderPage();
    await switchToJobsTab();
    // Every status string appears in a StatusBadge cell.
    for (const s of statuses) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }
  });
});
