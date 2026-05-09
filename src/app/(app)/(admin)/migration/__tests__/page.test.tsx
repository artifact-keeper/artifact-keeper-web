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

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

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
  PageHeader: ({ title }: { title?: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: () => <div data-testid="data-table" />,
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title }: { open?: boolean; title?: string }) =>
    open ? <div data-testid="confirm-dialog">{title}</div> : null,
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
    // Find the Select root paired with the Source Type label by inspecting the
    // surrounding DOM. The label text is unique on the page.
    const label = screen.getByText("Source Type");
    // The label sits inside the same `space-y-2` div as its Select. The Select
    // root is the descendant with data-testid="select-root".
    const wrapper = label.parentElement!;
    const selectRoot = wrapper.querySelector('[data-testid="select-root"]');
    expect(selectRoot).not.toBeNull();
    expect(selectRoot!.getAttribute("data-value")).toBe("artifactory");
  });

  it("submits source_type in the createConnection mutation body", async () => {
    await openAddConnectionDialog();

    // Fill the required text fields.
    const nameInput = screen.getByPlaceholderText(/Production Artifactory/i);
    const urlInput = screen.getByPlaceholderText(/artifactory\.example\.com/i);
    const tokenInput = screen.getByPlaceholderText(/Enter API token/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Prod" } });
      fireEvent.change(urlInput, { target: { value: "https://nexus.example.com" } });
      fireEvent.change(tokenInput, { target: { value: "tok" } });
    });

    // Submit the form. The form is the only <form> in the dialog.
    const form = screen.getByTestId("dialog-content").querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form!);
    });

    // The createConnection mutation should have been invoked with source_type.
    const create = capturedMutations.createConn;
    expect(create).toBeDefined();
    expect(create.mutate).toHaveBeenCalledTimes(1);
    const submitted = create.mutate.mock.calls[0][0] as Record<string, unknown>;
    expect(submitted).toHaveProperty("source_type");
    // The default selection is artifactory unless the user changes it.
    expect(submitted.source_type).toBe("artifactory");
  });

  it("propagates a Nexus selection through to the createConnection payload", async () => {
    await openAddConnectionDialog();

    // Locate the Source Type Select. The label sits in the same `space-y-2`
    // wrapper as the Select; scope the query to that wrapper so we hit the
    // source-type Select, not the auth-type Select.
    const label = screen.getByText("Source Type");
    const wrapper = label.parentElement!;
    const nexusItem = wrapper.querySelector(
      '[data-testid="select-item-nexus"]',
    ) as HTMLElement | null;
    expect(nexusItem).not.toBeNull();
    await act(async () => {
      fireEvent.click(nexusItem!);
    });

    // Fill the rest of the form and submit.
    const nameInput = screen.getByPlaceholderText(/Production Artifactory/i);
    const urlInput = screen.getByPlaceholderText(/artifactory\.example\.com/i);
    const tokenInput = screen.getByPlaceholderText(/Enter API token/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Nexus Prod" } });
      fireEvent.change(urlInput, { target: { value: "https://nexus.example.com" } });
      fireEvent.change(tokenInput, { target: { value: "tok" } });
    });
    const form = screen.getByTestId("dialog-content").querySelector("form");
    await act(async () => {
      fireEvent.submit(form!);
    });

    const create = capturedMutations.createConn;
    expect(create).toBeDefined();
    expect(create.mutate).toHaveBeenCalledTimes(1);
    const submitted = create.mutate.mock.calls[0][0] as Record<string, unknown>;
    expect(submitted.source_type).toBe("nexus");
  });
});
