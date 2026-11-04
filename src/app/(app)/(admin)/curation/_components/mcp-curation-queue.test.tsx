// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpCatalogItem, McpCatalogPage, McpCatalogQuery } from "@/types/mcp";
import { catalogItem, catalogPin } from "@/components/mcp/test-utils";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const api = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  decide: vi.fn(),
  pinVersion: vi.fn(),
  bulkApprovePattern: vi.fn(),
  requestApproval: vi.fn(),
  capabilitiesDiff: vi.fn(),
}));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, MCP_SEARCH_MIN_CHARS: 3 }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { McpCurationQueue } from "./mcp-curation-queue";

const FIRST_SEEN = new Date(Date.now() - 3 * 3600_000).toISOString();
const DRIFT = { storedSha256: "aa", upstreamSha256: "bb", detectedAt: FIRST_SEEN };

/** A pending name with an ingested latest version (its tool diff shows). */
const WEATHER = catalogItem({
  id: "c1",
  name: "io.github.acme/weather",
  firstSeenAt: FIRST_SEEN,
  flags: { typosquat: { similarTo: "io.github.acme/weathr" } },
  approvalRequests: { count: 2, lastNote: "release bot" },
  ingested: [{ version: "1.2.0", artifactId: "a-1.2.0", upstreamStatus: "active", unresolved: [] }],
});
/** A flagged name with no known version (nothing to pin). */
const SQL = catalogItem({
  id: "c2",
  name: "com.other/sql",
  status: "review",
  firstSeenAt: FIRST_SEEN,
  latestVersion: null,
  versions: [],
  description: null,
  upstreamStatus: "deprecated",
});
/** An approved name in the queue only because one version drifted upstream. */
const MAPS = catalogItem({
  id: "c3",
  name: "io.github.acme/maps",
  status: "approved",
  latestVersion: "2.0.0",
  versions: ["2.0.0", "1.1.0"],
  firstSeenAt: FIRST_SEEN,
  pins: [
    catalogPin({ id: "c3@1.1.0", version: "1.1.0", status: "review", contentDrift: DRIFT }),
    catalogPin({ id: "c3@1.0.0", version: "1.0.0", status: "approved", contentDrift: DRIFT }),
  ],
});

const COUNTS = { pending: 1, review: 1, approved: 2, blocked: 0 };

let tabs: Record<"queue" | "approved" | "blocked" | "catalog", McpCatalogPage | null>;

function page(items: McpCatalogItem[], nextCursor: string | null = null): McpCatalogPage {
  return { items, nextCursor, counts: COUNTS };
}

function tabOf(q: McpCatalogQuery): keyof typeof tabs {
  if (q.queue) return "queue";
  if (q.status === "approved" || q.status === "blocked") return q.status;
  return "catalog";
}

function renderQueue() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpCurationQueue repoKey="mcp-proxy" />
    </QueryClientProvider>,
  );
  return { spy, user: userEvent.setup() };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, button: string) {
  await user.click(await screen.findByRole("button", { name: button }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  tabs = {
    queue: page([WEATHER, SQL, MAPS]),
    approved: page([MAPS, catalogItem({ id: "c4", name: "io.github.acme/geo", status: "approved", firstSeenAt: FIRST_SEEN })]),
    blocked: page([]),
    catalog: page([catalogItem({ id: "c9", name: "io.github.new/thing" })]),
  };
  api.listCatalog.mockImplementation((_k: string, q: McpCatalogQuery) => Promise.resolve(tabs[tabOf(q)]));
  api.capabilitiesDiff.mockResolvedValue({
    summary: { text: "Tools: +3 added, 1 changed", identical: false, destructiveAdded: [] },
  });
  api.decide.mockImplementation((_k: string, id: string) => Promise.resolve({ item: { ...WEATHER, id }, ingestError: null }));
  api.pinVersion.mockResolvedValue({ item: WEATHER, ingestError: null });
});
afterEach(() => cleanup());

describe("McpCurationQueue", () => {
  it("says the queue is not available when the backend does not serve it", async () => {
    tabs.queue = null;
    renderQueue();
    expect(await screen.findByText(/MCP approval queue is not available on this server/i)).toBeInTheDocument();
  });

  it("reads each tab from the catalog and shows the repository-wide counts", async () => {
    renderQueue();
    expect(await screen.findByText("io.github.acme/weather")).toBeInTheDocument();
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { queue: true, limit: 200 });
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { status: "approved", limit: 200 });
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { status: "blocked", limit: 200 });
    expect(screen.getByRole("tab", { name: /Awaiting decision\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Approved\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Blocked\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Catalog" })).toBeInTheDocument();
  });

  it("shows the server-side signals and the tool diff of a row", async () => {
    renderQueue();
    expect(await screen.findByText("Tools: +3 added, 1 changed")).toBeInTheDocument();
    expect(api.capabilitiesDiff).toHaveBeenCalledWith("mcp-proxy", "io.github.acme/weather", "1.2.0");
    // Nothing was ingested for the other names: no diff read.
    expect(api.capabilitiesDiff).toHaveBeenCalledTimes(1);
    expect(screen.getByText("latest 1.2.0")).toBeInTheDocument();
    expect(screen.getByText("Looks like io.github.acme/weathr")).toBeInTheDocument();
    expect(screen.getByText("Requested 2 times: release bot")).toBeInTheDocument();
    expect(screen.getByText("needs review")).toBeInTheDocument();
    expect(screen.getByText("upstream deprecated")).toBeInTheDocument();
    expect(screen.getAllByText(/3 hours ago/).length).toBeGreaterThanOrEqual(3);
  });

  it("colours a diff that adds a destructive tool and hides an identical one", async () => {
    api.capabilitiesDiff.mockResolvedValueOnce({
      summary: { text: "Tools: +1 added (rm now destructiveHint: true)", identical: false, destructiveAdded: ["rm"] },
    });
    renderQueue();
    expect(await screen.findByText(/rm now destructiveHint/)).toHaveClass("text-destructive");
    cleanup();
    api.capabilitiesDiff.mockResolvedValueOnce({ summary: { text: "No changes", identical: true, destructiveAdded: [] } });
    renderQueue();
    await screen.findByText("io.github.acme/weather");
    await waitFor(() => expect(api.capabilitiesDiff).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("No changes")).not.toBeInTheDocument();
  });

  it("shows a drifted version of an approved name as its own row", async () => {
    renderQueue();
    expect(await screen.findByText("io.github.acme/maps 1.1.0")).toBeInTheDocument();
    expect(screen.getByText(/Upstream content changed after approval; held until decided again/)).toBeInTheDocument();
    // The already re-approved drifted pin is not a row.
    expect(screen.queryByText("io.github.acme/maps 1.0.0")).not.toBeInTheDocument();
    // The approved name itself needs no decision: no name buttons, not selectable.
    expect(screen.queryByRole("button", { name: "Approve io.github.acme/maps" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select io.github.acme/maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve io.github.acme/maps 1.1.0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block io.github.acme/maps 1.1.0" })).toBeInTheDocument();
  });

  it("re-approves a drifted version through its name@version row", async () => {
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Approve io.github.acme/maps 1.1.0");
    expect(within(dialog).getByText("Approve io.github.acme/maps 1.1.0")).toBeInTheDocument();
    expect(within(dialog).getByText(/Serves the stored document of this version again/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c3@1.1.0", "approve", undefined));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved version 1.1.0"));
  });

  it("blocks a drifted version with a reason", async () => {
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Block io.github.acme/maps 1.1.0");
    expect(within(dialog).getByText(/This version is never served; the rest of the server is unaffected/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "changed under us");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c3@1.1.0", "block", "changed under us"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Blocked version 1.1.0"));
  });

  it("bulk-approves the selected names one decision at a time", async () => {
    const { user, spy } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    // The drifted-only name is not part of a bulk decision.
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve selected/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Approve 2 servers")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Reason"), "reviewed");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 servers approved"));
    expect(api.decide).toHaveBeenCalledTimes(2);
    expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c1", "approve", "reviewed");
    expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c2", "approve", "reviewed");
    expect(toast.error).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("bulk-blocks and reports the decisions that failed", async () => {
    api.decide.mockImplementation((_k: string, id: string) =>
      id === "c2" ? Promise.reject(new Error("403")) : Promise.resolve({ item: WEATHER, ingestError: null }),
    );
    const { user } = renderQueue();
    await user.click(await screen.findByRole("checkbox", { name: "Select io.github.acme/weather" }));
    await user.click(screen.getByRole("checkbox", { name: "Select com.other/sql" }));
    await user.click(screen.getByRole("button", { name: /Block selected/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "unknown publisher");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("1 server blocked"));
    expect(toast.error).toHaveBeenCalledWith("1 server could not be changed");
    expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c1", "block", "unknown publisher");
    expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c2", "block", "unknown publisher");
  });

  it("toggles a row and select-all off again", async () => {
    const { user } = renderQueue();
    const row = await screen.findByRole("checkbox", { name: "Select io.github.acme/weather" });
    await user.click(row);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(row);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("pins one version only when asked, through /catalog/pins", async () => {
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Approve io.github.acme/weather");
    expect(within(dialog).getByText(/Approving the name lets later versions flow/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: /Pin this version only \(1\.2\.0\)/ }));
    // Approving a single row needs no reason.
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api.pinVersion).toHaveBeenCalledWith("mcp-proxy", "io.github.acme/weather", "1.2.0", undefined),
    );
    expect(api.decide).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved version 1.2.0 only"));
  });

  it("approves the name by default and warns when the ingest failed", async () => {
    api.decide.mockResolvedValueOnce({ item: { ...WEATHER, status: "approved" }, ingestError: "upstream timed out" });
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Approve io.github.acme/weather");
    await user.type(within(dialog).getByLabelText("Reason"), "ok");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c1", "approve", "ok"));
    expect(api.pinVersion).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved server"));
    expect(toast.warning).toHaveBeenCalledWith("Approved, but not ingested yet: upstream timed out");
  });

  it("offers no pin for a name without a known version", async () => {
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Approve com.other/sql");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("blocks a row with a required reason", async () => {
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Block io.github.acme/weather");
    expect(within(dialog).getByText(/Blocked names are never served/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "exfiltrates");
    await user.click(confirm);
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("mcp-proxy", "c1", "block", "exfiltrates"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Blocked server"));
  });

  it("toasts a refused decision", async () => {
    api.decide.mockRejectedValueOnce(new Error("forbidden"));
    const { user } = renderQueue();
    const dialog = await openDialog(user, "Approve io.github.acme/weather");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("only offers Block on the approved tab, without drifted rows", async () => {
    const { user } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: /Approved/ }));
    expect(await screen.findByText("io.github.acme/geo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve io.github.acme/maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block io.github.acme/maps" })).toBeInTheDocument();
    expect(screen.queryByText("io.github.acme/maps 1.1.0")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve selected/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Block selected/ })).toBeInTheDocument();
  });

  it("shows the empty blocked tab", async () => {
    const { user } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: /Blocked/ }));
    expect(await screen.findByText("No blocked MCP servers.")).toBeInTheDocument();
  });

  it("shows the empty queue and says when only the first page is shown", async () => {
    tabs.queue = page([]);
    tabs.approved = page([MAPS], "next");
    const { user } = renderQueue();
    expect(await screen.findByText("No MCP servers await a decision.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Approved/ }));
    expect(await screen.findByText(/Showing the first 1\./)).toBeInTheDocument();
  });

  it("shows an error with retry when a tab fails", async () => {
    api.listCatalog.mockImplementation((_k: string, q: McpCatalogQuery) =>
      q.queue ? Promise.reject(new Error("boom")) : Promise.resolve(page([])),
    );
    const { user } = renderQueue();
    expect(await screen.findByText(/Couldn't load the approval queue/)).toBeInTheDocument();
    const calls = api.listCatalog.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(api.listCatalog.mock.calls.length).toBeGreaterThan(calls));
  });

  it("previews the namespace dialog over the pending names", async () => {
    const { user } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("button", { name: /Approve namespace/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Namespace glob"), "io.github.acme/*");
    // Only `pending` names are previewed: weather (maps is approved, sql is flagged).
    expect(within(dialog).getByText(/Matches 1 pending server of 1/)).toBeInTheDocument();
  });

  it("browses the catalog on the Catalog tab", async () => {
    const { user } = renderQueue();
    await screen.findByText("io.github.acme/weather");
    await user.click(screen.getByRole("tab", { name: "Catalog" }));
    expect(await screen.findByText("io.github.new/thing")).toBeInTheDocument();
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { search: undefined, cursor: undefined });
    expect(screen.queryByRole("button", { name: /Approve namespace/ })).not.toBeInTheDocument();
  });
});
