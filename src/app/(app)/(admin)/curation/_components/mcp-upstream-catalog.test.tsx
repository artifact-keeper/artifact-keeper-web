// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpServerJson, McpUpstreamEntry } from "@/types/mcp";

const api = vi.hoisted(() => ({ upstreamCatalog: vi.fn(), requestApproval: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, MCP_SEARCH_MIN_CHARS: 3 }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { McpUpstreamCatalog } from "./mcp-upstream-catalog";

function entry(name: string, over: Partial<McpUpstreamEntry> = {}): McpUpstreamEntry {
  return {
    server: { name, version: "1.0.0", description: `${name} desc`, remotes: [{ type: "sse", url: "https://x" }] } as McpServerJson,
    review_status: null,
    ...over,
  };
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
    api.upstreamCatalog.mockResolvedValue(null);
    setup();
    expect(await screen.findByText(/Upstream catalog browsing is not available on this server/)).toBeInTheDocument();
  });

  it("lists entries greyed with their review state and requests approval", async () => {
    api.upstreamCatalog.mockResolvedValue({
      servers: [entry("io.github.new/one"), entry("io.github.old/two", { review_status: "pending", review_id: "rv" })],
    });
    api.requestApproval.mockResolvedValue({ id: "rv9", name: "io.github.new/one", status: "pending" });
    const { user, spy } = setup();
    expect(await screen.findByText("io.github.new/one")).toBeInTheDocument();
    expect(screen.getAllByText("Not visible to clients until approved").length).toBeGreaterThan(0);
    expect(screen.getByText("Not requested")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getAllByText("sse")).toHaveLength(2);
    // Only the never-requested entry offers the button.
    expect(screen.queryByRole("button", { name: "Request approval for io.github.old/two" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request approval for io.github.new/one" }));
    await waitFor(() => expect(api.requestApproval).toHaveBeenCalledWith("mcp-proxy", "io.github.new/one"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approval requested for io.github.new/one"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("toasts when requesting approval fails", async () => {
    api.upstreamCatalog.mockResolvedValue({ servers: [entry("io.github.new/one")] });
    api.requestApproval.mockRejectedValue(new Error("x"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /Request approval for/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("alerts that nothing is served when the upstream is unreachable", async () => {
    api.upstreamCatalog.mockResolvedValue({ servers: [], upstream_error: "timeout" });
    setup();
    expect(await screen.findByText(/could not be reached; nothing is served until it can be evaluated \(fail closed\)/)).toBeInTheDocument();
    expect(screen.queryByText("The upstream catalog is empty.")).not.toBeInTheDocument();
  });

  it("searches with at least three characters and pages with Load more", async () => {
    api.upstreamCatalog.mockImplementation((_k: string, p: { search?: string; cursor?: string }) =>
      Promise.resolve(
        p.cursor
          ? { servers: [entry("io.github.w/page2")] }
          : p.search
            ? { servers: [entry("io.github.w/weather")], next_cursor: "c2" }
            : { servers: [] },
      ),
    );
    const { user } = setup();
    expect(await screen.findByText("The upstream catalog is empty.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search upstream catalog"), "we");
    expect(screen.getByText("Enter at least 3 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search/ })).toBeDisabled();
    await user.type(screen.getByLabelText("Search upstream catalog"), "a{Enter}");
    expect(await screen.findByText("io.github.w/weather")).toBeInTheDocument();
    expect(api.upstreamCatalog).toHaveBeenCalledWith("mcp-proxy", { search: "wea", cursor: undefined });
    await user.click(screen.getByRole("button", { name: /Load more/ }));
    expect(await screen.findByText("io.github.w/page2")).toBeInTheDocument();
    expect(api.upstreamCatalog).toHaveBeenCalledWith("mcp-proxy", { search: "wea", cursor: "c2" });
    expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
  });

  it("shows an empty search result and a load error", async () => {
    api.upstreamCatalog.mockResolvedValueOnce({ servers: [] }).mockResolvedValueOnce({ servers: [] });
    const { user } = setup();
    await screen.findByText("The upstream catalog is empty.");
    await user.type(screen.getByLabelText("Search upstream catalog"), "zzz{Enter}");
    expect(await screen.findByText("No upstream servers match.")).toBeInTheDocument();
    cleanup();
    api.upstreamCatalog.mockRejectedValue(new Error("down"));
    setup();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
