// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));
vi.mock("@/components/ui/select", async () =>
  (await import("@/components/mcp/__tests__/mcp-fixtures")).selectMock(),
);
const mockListServers = vi.fn();
const mockListVersions = vi.fn();
vi.mock("@/lib/api/mcp", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/mcp")>()),
  mcpApi: {
    listServers: (...a: unknown[]) => mockListServers(...a),
    listVersions: (...a: unknown[]) => mockListVersions(...a),
  },
}));
const mockPackages = vi.fn();
vi.mock("@/lib/api/packages", () => ({ packagesApi: { list: (...a: unknown[]) => mockPackages(...a) } }));
const mockRepos = vi.fn();
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { list: (...a: unknown[]) => mockRepos(...a) } }));

import McpCatalogPage from "./page";
import { LEGACY, REMOTE_ONLY, SQL, WEATHER } from "@/components/mcp/__tests__/mcp-fixtures";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  mockRepos.mockReset().mockResolvedValue({ items: [{ key: "mcp-a" }, { key: "mcp-b" }], pagination: { total: 2 } });
  mockListServers.mockReset().mockImplementation(async (key: string) =>
    key === "mcp-a"
      ? { servers: [WEATHER, LEGACY], count: 2, dropped: 0 }
      : { servers: [SQL, REMOTE_ONLY], nextCursor: "more", count: 2, dropped: 0 },
  );
  mockPackages.mockReset().mockResolvedValue({
    items: [{ id: "p1", name: "com.acme/weather", repository_key: "mcp-a" }],
    pagination: { total: 1 },
  });
  mockListVersions.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <McpCatalogPage />
    </QueryClientProvider>,
  );
}

const cards = () => screen.queryAllByTestId("mcp-server-card");

describe("MCP catalog page", () => {
  it("lists servers from every MCP repository with a repository chip", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(mockRepos).toHaveBeenCalledWith({ format: "mcp", per_page: 100 });
    expect(mockListServers).toHaveBeenCalledWith("mcp-a", { version: "latest", search: undefined, limit: 100 });
    expect(mockPackages).toHaveBeenCalledWith({ format: "mcp", per_page: 100 });
    expect(screen.getByRole("heading", { name: "MCP Servers" })).toBeInTheDocument();
    expect(screen.getAllByText("mcp-b", { selector: "[data-slot=badge]" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "com.acme/weather" })).toHaveAttribute("href", "/packages/p1");
    expect(screen.getByRole("link", { name: "browse mcp-b" })).toHaveAttribute("href", "/repositories/mcp-b?tab=packages");
  });

  it("filters by repository and by the shared filters, and clears", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "mcp-a" } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "sse" } });
    expect(screen.getByText("No servers match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cards()).toHaveLength(3);
  });

  it("searches every repository from 3 characters", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Search servers"), { target: { value: "sql" } });
    await waitFor(() =>
      expect(mockListServers).toHaveBeenCalledWith("mcp-b", { version: "latest", search: "sql", limit: 100 }),
    );
  });

  it("names a repository it could not read", async () => {
    mockListServers.mockImplementation(async (key: string) => {
      if (key === "mcp-b") throw new Error("403");
      return { servers: [WEATHER], count: 1, dropped: 0 };
    });
    renderPage();
    expect(await screen.findByText("Could not read mcp-b.")).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
  });

  it("opens the install sheet for a card", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Install com.acme/sql" }));
    expect(await screen.findByText("Install com.acme/sql v2.0.0")).toBeInTheDocument();
    await waitFor(() => expect(mockListVersions).toHaveBeenCalledWith("mcp-b", "com.acme/sql"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains when there are no MCP repositories", async () => {
    mockRepos.mockResolvedValue({ items: [], pagination: { total: 0 } });
    renderPage();
    expect(await screen.findByText("No MCP registries")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to repositories" })).toHaveAttribute("href", "/repositories");
    expect(mockPackages).not.toHaveBeenCalled();
  });

  it("shows an error when the repository list fails", async () => {
    mockRepos.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText("Could not load MCP repositories")).toBeInTheDocument();
  });
});
