// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom is missing APIs that Radix Dialog relies on.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

// -- react-query mock: distinguish the plugins list from the plugin-config query --
interface MutationConfig {
  mutationFn: (...a: unknown[]) => unknown;
  onSuccess?: (...a: unknown[]) => void;
  onError?: (...a: unknown[]) => void;
}
const mutationConfigs: MutationConfig[] = [];
const mockInvalidate = vi.fn();
let pluginsResp: {
  data: unknown;
  isLoading?: boolean;
  isFetching?: boolean;
} = { data: { items: [], total: 0 }, isLoading: false };
let configResp: { data: unknown; isError?: boolean; error?: unknown } = {
  data: [],
  isError: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: {
    queryKey: unknown[];
    queryFn: () => unknown;
    enabled?: boolean;
  }) => {
    const key = (opts.queryKey as string[])[0];
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return key === "plugin-config" ? configResp : pluginsResp;
  },
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    return { mutate: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

// SDK is imported for its side effect + named functions.
vi.mock("@/lib/sdk-client", () => ({}));
const sdk = vi.hoisted(() => ({
  listPlugins: vi.fn(async () => ({ data: { items: [] }, error: null })),
  getPluginConfig: vi.fn(async () => ({ data: { items: [] }, error: null })),
  enablePlugin: vi.fn(async () => ({ error: null })),
  disablePlugin: vi.fn(async () => ({ error: null })),
  uninstallPlugin: vi.fn(async () => ({ error: null })),
  updatePluginConfig: vi.fn(async () => ({ error: null })),
  installFromGit: vi.fn(async () => ({ data: { name: "p" }, error: null })),
  installFromZip: vi.fn(async () => ({ data: { name: "p" }, error: null })),
}));
vi.mock("@artifact-keeper/sdk", () => sdk);

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_admin: isAdmin } }),
}));

// -- lightweight UI mocks so Radix-heavy primitives render deterministically --
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ id: string; cell?: (row: unknown) => React.ReactNode }>;
    data: unknown[];
  }) => (
    <table>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.id}>{c.cell ? c.cell(row) : null}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const passthrough = vi.hoisted(
  () =>
    ({ children }: { children?: React.ReactNode }) =>
      children,
);
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: passthrough,
  TooltipTrigger: passthrough,
  // Wrap content in its own element so each tooltip label is individually
  // queryable by text (bare-string children would merge into one node).
  TooltipContent: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: passthrough,
  TabsList: passthrough,
  TabsTrigger: passthrough,
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: passthrough,
  SelectTrigger: passthrough,
  SelectValue: passthrough,
  SelectContent: passthrough,
  SelectItem: passthrough,
}));
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));
vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title }: { title?: string }) => <div>{title}</div>,
}));
vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: { status?: string }) => <span>{status}</span>,
}));

import PluginsPage from "./page";

const PLUGIN = {
  id: "p1",
  name: "acme-handler",
  version: "1.0.0",
  plugin_type: "format_handler" as const,
  status: "active" as const,
  installed_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  mutationConfigs.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  pluginsResp = { data: { items: [PLUGIN], total: 1 }, isLoading: false };
  configResp = { data: [], isError: false };
});
afterEach(() => cleanup());

describe("PluginsPage — Configure gating (#2512)", () => {
  it("shows the Configure affordance to admins", () => {
    render(<PluginsPage />);
    expect(
      screen.getByRole("button", { name: /configure acme-handler/i }),
    ).toBeInTheDocument();
  });

  it("hides the Configure affordance from non-admins", () => {
    isAdmin = false;
    render(<PluginsPage />);
    expect(
      screen.queryByRole("button", { name: /configure acme-handler/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps other plugin actions available to non-admins", () => {
    isAdmin = false;
    render(<PluginsPage />);
    // enable/disable + uninstall tooltips still render their content text
    expect(screen.getByText("Disable")).toBeInTheDocument();
    expect(screen.getByText("Uninstall")).toBeInTheDocument();
  });

  it("does not fetch plugin config for non-admins (query disabled)", () => {
    isAdmin = false;
    render(<PluginsPage />);
    expect(sdk.getPluginConfig).not.toHaveBeenCalled();
  });
});

describe("PluginsPage — config 403 handling", () => {
  it("shows a not-authorized state when the config fetch is forbidden", async () => {
    const user = userEvent.setup();
    configResp = { data: undefined, isError: true, error: { status: 403 } };
    render(<PluginsPage />);
    await user.click(
      screen.getByRole("button", { name: /configure acme-handler/i }),
    );
    expect(
      await screen.findByText(/don't have permission to view or edit/i),
    ).toBeInTheDocument();
  });

  it("shows a generic error state for a non-403 config failure", async () => {
    const user = userEvent.setup();
    configResp = { data: undefined, isError: true, error: new Error("boom") };
    render(<PluginsPage />);
    await user.click(
      screen.getByRole("button", { name: /configure acme-handler/i }),
    );
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("renders the config form when the fetch succeeds", async () => {
    const user = userEvent.setup();
    configResp = {
      data: [{ key: "webhook_url", value: "https://x", description: "hook" }],
      isError: false,
    };
    render(<PluginsPage />);
    await user.click(
      screen.getByRole("button", { name: /configure acme-handler/i }),
    );
    expect(await screen.findByLabelText("webhook_url")).toBeInTheDocument();
  });

  it("save-config mutation reports a 403 via an error toast (graceful)", () => {
    render(<PluginsPage />);
    // order: enable, disable, uninstall, saveConfig, installGit, installZip
    const saveConfig = mutationConfigs[3];
    saveConfig.onError?.({ status: 403 });
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });
});
