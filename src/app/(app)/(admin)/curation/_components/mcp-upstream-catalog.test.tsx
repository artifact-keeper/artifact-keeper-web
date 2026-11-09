// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpCatalogItem, McpCatalogPage } from "@/types/mcp";
import { catalogItem } from "@/components/mcp/test-utils";

const api = vi.hoisted(() => ({ listCatalog: vi.fn(), requestApproval: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, MCP_SEARCH_MIN_CHARS: 3 }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { McpUpstreamCatalog } from "./mcp-upstream-catalog";

function page(items: McpCatalogItem[], nextCursor: string | null = null): McpCatalogPage {
  return { items, nextCursor, counts: { pending: items.length } };
}

function item(id: string, name: string, over: Partial<McpCatalogItem> = {}): McpCatalogItem {
  return catalogItem({ id, name, description: `${name} desc`, ...over });
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpUpstreamCatalog repoKey="mcp-proxy" />
    </QueryClientProvider>,
  );
  return { spy, user: userEvent.setup() };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("McpUpstreamCatalog", () => {
  it("hides behind a note when the backend does not serve the catalog", async () => {
    api.listCatalog.mockResolvedValue(null);
    setup();
    expect(await screen.findByText(/Upstream catalog browsing is not available on this server/)).toBeInTheDocument();
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { search: undefined, cursor: undefined });
  });

  it("lists catalog items greyed until approved and lets a reader request approval", async () => {
    api.listCatalog.mockResolvedValue(
      page([
        item("c1", "io.github.new/one", { flags: { typosquat: { similarTo: "io.github.acme/one" } } }),
        item("c2", "io.github.old/two", { status: "approved", latestVersion: "2.0.0" }),
        item("c3", "io.github.bad/three", { status: "pending", denied: true }),
        item("c4", "io.github.flag/four", { status: "review", approvalRequests: { count: 1 } }),
        item("c5", "io.github.no/five", { status: "blocked", evaluationReason: "exfiltrates" }),
      ]),
    );
    api.requestApproval.mockResolvedValue(item("c1", "io.github.new/one"));
    const { user, spy } = setup();
    expect(await screen.findByText("io.github.new/one")).toBeInTheDocument();
    expect(screen.getByText("io.github.new/one desc")).toBeInTheDocument();
    expect(screen.getByText("2.0.0")).toBeInTheDocument();
    // Every row but the approved, non-denied one says it is not served.
    expect(screen.getAllByText("Not visible to clients until approved")).toHaveLength(4);
    expect(screen.getByText("Looks like io.github.acme/one")).toBeInTheDocument();
    expect(screen.getByText(/Matches a deny glob/)).toBeInTheDocument();
    expect(screen.getByText("needs review")).toBeInTheDocument();
    expect(screen.getByText("Requested once")).toBeInTheDocument();
    expect(screen.getByText("Reason: exfiltrates")).toBeInTheDocument();
    // Only pending/review names that no deny glob refuses offer the request.
    for (const n of ["io.github.old/two", "io.github.bad/three", "io.github.no/five"]) {
      expect(screen.queryByRole("button", { name: `Request approval for ${n}` })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Request approval for io.github.flag/four" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request approval for io.github.new/one" }));
    await waitFor(() => expect(api.requestApproval).toHaveBeenCalledWith("mcp-proxy", "c1"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approval requested for io.github.new/one"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("toasts when requesting approval fails", async () => {
    api.listCatalog.mockResolvedValue(page([item("c1", "io.github.new/one")]));
    api.requestApproval.mockRejectedValue(new Error("x"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /Request approval for/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("searches the catalog and pages with Load more", async () => {
    api.listCatalog.mockImplementation((_k: string, p: { search?: string; cursor?: string }) =>
      Promise.resolve(
        p.cursor
          ? page([item("c9", "io.github.w/page2")])
          : p.search
            ? page([item("c8", "io.github.w/weather")], "c2")
            : page([]),
      ),
    );
    const { user } = setup();
    expect(await screen.findByText(/The upstream catalog is empty/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search upstream catalog"), "  wea {Enter}");
    expect(await screen.findByText("io.github.w/weather")).toBeInTheDocument();
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { search: "wea", cursor: undefined });
    await user.click(screen.getByRole("button", { name: /Load more/ }));
    expect(await screen.findByText("io.github.w/page2")).toBeInTheDocument();
    expect(api.listCatalog).toHaveBeenCalledWith("mcp-proxy", { search: "wea", cursor: "c2" });
    expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
  });

  it("refuses a search over the backend's 200-character cap", async () => {
    api.listCatalog.mockResolvedValue(page([]));
    const { user } = setup();
    await screen.findByText(/The upstream catalog is empty/);
    const box = screen.getByLabelText("Search upstream catalog");
    await user.click(box);
    await user.paste("a".repeat(201));
    expect(screen.getByText("At most 200 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search/ })).toBeDisabled();
    await user.type(box, "{Enter}");
    expect(api.listCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows an empty search result and a load error", async () => {
    api.listCatalog.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([]));
    const { user } = setup();
    await screen.findByText(/The upstream catalog is empty/);
    await user.type(screen.getByLabelText("Search upstream catalog"), "zzz{Enter}");
    expect(await screen.findByText("No upstream servers match.")).toBeInTheDocument();
    cleanup();
    api.listCatalog.mockRejectedValue(new Error("down"));
    setup();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
