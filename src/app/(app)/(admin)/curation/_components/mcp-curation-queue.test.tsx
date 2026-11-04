// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpReview, McpServerJson, McpUpstreamPage } from "@/types/mcp";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const api = vi.hoisted(() => ({
  listReviews: vi.fn(),
  approveReview: vi.fn(),
  blockReview: vi.fn(),
  bulkApprove: vi.fn(),
  bulkBlock: vi.fn(),
  bulkApproveNamespace: vi.fn(),
  upstreamCatalog: vi.fn(),
  requestApproval: vi.fn(),
}));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, MCP_SEARCH_MIN_CHARS: 3 }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { McpCurationQueue } from "./mcp-curation-queue";

const SERVER: McpServerJson = {
  name: "io.github.acme/weather",
  version: "1.4.2",
  description: "Weather",
  packages: [
    {
      registryType: "npm",
      identifier: "@acme/weather-mcp",
      version: "1.4.2",
      transport: { type: "stdio" },
      environmentVariables: [{ name: "ACME_API_KEY", isSecret: true }],
    },
  ],
  remotes: [{ type: "streamable-http", url: "https://mcp.acme.dev" }],
} as McpServerJson;

function review(over: Partial<McpReview> = {}): McpReview {
  return {
    id: "rv1",
    name: "io.github.acme/weather",
    status: "pending",
    first_seen_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    server: SERVER,
    findings: [
      { rule: "secret_literal", action: "block" },
      { rule: "injection_phrase", action: "review" },
    ],
    tool_diff: { added: ["a", "b", "c"], removed: [], changed: [{ name: "d", fields: ["annotations"] }] },
    ...over,
  };
}

let reviews: Record<string, McpReview[] | null>;

function renderQueue() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpCurationQueue repoKey="mcp-proxy" />
    </QueryClientProvider>,
  );
  return { spy };
}

beforeEach(() => {
  vi.clearAllMocks();
  reviews = {
    pending: [review(), review({ id: "rv2", name: "com.other/sql", server: null, findings: [], tool_diff: null })],
    approved: [review({ id: "rv3", name: "io.github.acme/maps", status: "approved", version: "2.0.0" })],
    blocked: [],
  };
  api.listReviews.mockImplementation((_k: string, { status }: { status: string }) => Promise.resolve(reviews[status]));
  api.upstreamCatalog.mockResolvedValue({ servers: [] } satisfies McpUpstreamPage);
});
afterEach(() => cleanup());

describe("McpCurationQueue", () => {
  it("says the queue is not available when the backend does not serve it", async () => {
    reviews.pending = null;
    renderQueue();
    expect(await screen.findByText(/MCP approval queue is not available on this server/i)).toBeInTheDocument();
  });

  it("shows tab counts and MCP row details", async () => {
    renderQueue();
    expect(await screen.findByText("io.github.acme/weather")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pending\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Approved\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Blocked\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Catalog" })).toBeInTheDocument();
    expect(api.listReviews).toHaveBeenCalledWith("mcp-proxy", { status: "pending" });
    expect(screen.getByText("stdio·npm")).toBeInTheDocument();
    expect(screen.getByText("http")).toBeInTheDocument();
    expect(screen.getByLabelText("1 secret")).toBeInTheDocument();
    expect(screen.getByText("Lint: 1 blocking, 1 to review")).toBeInTheDocument();
    expect(screen.getByText("Tools: +3 added, 1 changed")).toBeInTheDocument();
    expect(screen.getByText(/latest 1\.4\.2/)).toBeInTheDocument();
    expect(screen.getByText(/^Risk /)).toBeInTheDocument();
    expect(screen.getAllByText(/3 hours ago/)).toHaveLength(2);
    // The row without a document still renders.
    expect(screen.getByText("com.other/sql")).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("bulk-approves the selected servers with a reason", async () => {
    api.bulkApprove.mockResolvedValue(2);
    const user = userEvent.setup();
    const { spy } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve selected/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "reviewed");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.bulkApprove).toHaveBeenCalledWith(["rv1", "rv2"], "reviewed"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 servers approved"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("bulk-blocks one selected server", async () => {
    api.bulkBlock.mockResolvedValue(1);
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole("checkbox", { name: "Select com.other/sql" }));
    await user.click(screen.getByRole("button", { name: /Block selected/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "unknown publisher");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.bulkBlock).toHaveBeenCalledWith(["rv2"], "unknown publisher"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("1 server blocked"));
  });

  it("approves one version only when pinned", async () => {
    api.approveReview.mockResolvedValue(review({ status: "approved" }));
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole("button", { name: "Approve io.github.acme/weather" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /Pin this version only \(1\.4\.2\)/ }));
    // Approving a single row needs no reason.
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api.approveReview).toHaveBeenCalledWith("rv1", { reason: undefined, version: "1.4.2" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved version 1.4.2 only"));
  });

  it("approves the name without a pin by default", async () => {
    api.approveReview.mockResolvedValue(review({ status: "approved" }));
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole("button", { name: "Approve io.github.acme/weather" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "ok");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.approveReview).toHaveBeenCalledWith("rv1", { reason: "ok", version: undefined }));
    expect(toast.success).toHaveBeenCalledWith("Server approved");
  });

  it("blocks a row with a required reason", async () => {
    api.blockReview.mockResolvedValue(review({ status: "blocked" }));
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole("button", { name: "Block io.github.acme/weather" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "exfiltrates");
    await user.click(confirm);
    await waitFor(() => expect(api.blockReview).toHaveBeenCalledWith("rv1", { reason: "exfiltrates" }));
    expect(toast.success).toHaveBeenCalledWith("Server blocked");
  });

  it("only offers Block on the approved tab", async () => {
    const user = userEvent.setup();
    renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: /Approved/ }));
    expect(await screen.findByText("io.github.acme/maps")).toBeInTheDocument();
    expect(screen.getByText("pinned 2.0.0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve io.github.acme/maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block io.github.acme/maps" })).toBeInTheDocument();
  });

  it("shows the empty blocked tab", async () => {
    const user = userEvent.setup();
    renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: /Blocked/ }));
    expect(await screen.findByText("No blocked MCP servers.")).toBeInTheDocument();
  });

  it("shows an error with retry when a status list fails", async () => {
    api.listReviews.mockImplementation((_k: string, { status }: { status: string }) =>
      status === "pending" ? Promise.reject(new Error("boom")) : Promise.resolve([]),
    );
    renderQueue();
    expect(await screen.findByText(/Couldn't load the approval queue/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("opens the namespace dialog from the toolbar", async () => {
    api.bulkApproveNamespace.mockResolvedValue({ approved: 1 });
    const user = userEvent.setup();
    renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("button", { name: /Approve namespace/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Namespace glob"), "io.github.acme/*");
    expect(within(dialog).getByText(/Matches 1 pending server of 2/)).toBeInTheDocument();
  });

  it("shows the upstream catalog on the Catalog tab", async () => {
    api.upstreamCatalog.mockResolvedValue({
      servers: [{ server: { ...SERVER, name: "io.github.new/thing" }, review_status: null }],
    });
    const user = userEvent.setup();
    renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: "Catalog" }));
    expect(await screen.findByText("io.github.new/thing")).toBeInTheDocument();
    expect(api.upstreamCatalog).toHaveBeenCalledWith("mcp-proxy", { search: undefined, cursor: undefined });
  });
});
