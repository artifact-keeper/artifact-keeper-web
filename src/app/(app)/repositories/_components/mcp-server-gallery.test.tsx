// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
vi.mock("@/components/ui/select", async () =>
  (await import("@/components/mcp/__tests__/mcp-fixtures")).selectMock(),
);
const mockUser = { current: { is_admin: false } as { is_admin: boolean } | null };
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ user: mockUser.current }) }));
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

import { McpServerGallery, heldServerNames } from "./mcp-server-gallery";
import { LEGACY, REMOTE_ONLY, SQL, WEATHER } from "@/components/mcp/__tests__/mcp-fixtures";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function pkg(id: string, name: string) {
  return { id, name, repository_key: "mcp-local", version: "1.0.0" };
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockUser.current = { is_admin: false };
  mockListServers.mockReset().mockResolvedValue({ servers: [WEATHER, SQL, REMOTE_ONLY, LEGACY], count: 4, dropped: 0 });
  mockPackages.mockReset().mockResolvedValue({ items: [pkg("p-weather", "com.acme/weather")], pagination: { total: 1 } });
  mockListVersions.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

function renderGallery(props: Partial<React.ComponentProps<typeof McpServerGallery>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <McpServerGallery repositoryKey="mcp-local" repositoryType="local" {...props} />
    </QueryClientProvider>,
  );
}

const cards = () => screen.queryAllByTestId("mcp-server-card");

describe("McpServerGallery", () => {
  it("lists active latest servers and links each to its package page when known", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(mockListServers).toHaveBeenCalledWith("mcp-local", { version: "latest", search: undefined, cursor: undefined });
    expect(mockPackages).toHaveBeenCalledWith({ repository_key: "mcp-local", per_page: 100 });
    expect(screen.getByRole("link", { name: "com.acme/weather" })).toHaveAttribute("href", "/packages/p-weather");
    expect(screen.getByRole("link", { name: "com.acme/sql" })).toHaveAttribute(
      "href",
      "/repositories/mcp-local?tab=packages&server=com.acme%2Fsql",
    );
    expect(screen.queryByText("com.acme/legacy")).toBeNull();
  });

  it("sends a search only from 3 characters and shows a hint before that", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    const box = screen.getByLabelText("Search servers");
    fireEvent.change(box, { target: { value: "we" } });
    expect(screen.getByText("Type at least 3 characters to search.")).toBeInTheDocument();
    expect(mockListServers).toHaveBeenCalledTimes(1);
    fireEvent.change(box, { target: { value: "wea" } });
    await waitFor(() =>
      expect(mockListServers).toHaveBeenLastCalledWith("mcp-local", { version: "latest", search: "wea", cursor: undefined }),
    );
    expect(screen.queryByText("Type at least 3 characters to search.")).toBeNull();
  });

  it("starts searching for the server named in the URL", async () => {
    searchParams = new URLSearchParams("server=com.acme/sql");
    renderGallery();
    await waitFor(() =>
      expect(mockListServers).toHaveBeenCalledWith("mcp-local", { version: "latest", search: "com.acme/sql", cursor: undefined }),
    );
  });

  it("filters by transport, package type and status", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "sse" } });
    expect(cards()).toHaveLength(1);
    expect(screen.getByText("io.github.acme/")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Package type"), { target: { value: "oci" } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Package type"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "deprecated" } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
    expect(cards()).toHaveLength(4);
  });

  it("shows No servers match and clears the filters", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Package type"), { target: { value: "cargo" } });
    expect(screen.getByText("No servers match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cards()).toHaveLength(3);
  });

  it("clearing when only deprecated servers exist shows every status", async () => {
    mockListServers.mockResolvedValue({ servers: [LEGACY], count: 1, dropped: 0 });
    renderGallery();
    expect(await screen.findByText("No servers match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cards()).toHaveLength(1);
  });

  it("pages with Load more", async () => {
    mockListServers
      .mockResolvedValueOnce({ servers: [WEATHER], nextCursor: "c2", count: 1, dropped: 0 })
      .mockResolvedValueOnce({ servers: [SQL], count: 1, dropped: 0 });
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(mockListServers).toHaveBeenLastCalledWith("mcp-local", { version: "latest", search: undefined, cursor: "c2" });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("toggles list and grid view", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.getByTestId("mcp-server-grid")).toHaveAttribute("data-view", "grid");
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByTestId("mcp-server-grid")).toHaveAttribute("data-view", "list");
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByTestId("mcp-server-grid")).toHaveAttribute("data-view", "grid");
  });

  it("hosted empty: points at the Setup tab", async () => {
    mockListServers.mockResolvedValue({ servers: [], count: 0, dropped: 0 });
    renderGallery();
    expect(await screen.findByText("Publish your first server.json")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Setup" })).toHaveAttribute("href", "/repositories/mcp-local?tab=setup");
  });

  it("remote empty: points at the approval queue", async () => {
    mockListServers.mockResolvedValue({ servers: [], count: 0, dropped: 0 });
    renderGallery({ repositoryKey: "mcp-remote", repositoryType: "remote" });
    expect(await screen.findByText("No servers approved yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the approval queue" })).toHaveAttribute("href", "/curation?repo=mcp-remote");
  });

  it("shows an error state", async () => {
    mockListServers.mockRejectedValue(new Error("boom"));
    renderGallery();
    expect(await screen.findByText("Could not load servers")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("tells an admin which servers have no visible version", async () => {
    mockUser.current = { is_admin: true };
    mockPackages.mockResolvedValue({
      items: [pkg("p-weather", "com.acme/weather"), pkg("p-held", "com.acme/held"), pkg("p-held2", "com.acme/held2")],
      pagination: { total: 3 },
    });
    renderGallery();
    expect(await screen.findByText("2 servers have no version clients can see.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "com.acme/held" })).toHaveAttribute("href", "/packages/p-held");
  });

  it("does not show the held footer to a reader, or while pages remain", async () => {
    mockPackages.mockResolvedValue({ items: [pkg("p-held", "com.acme/held")], pagination: { total: 1 } });
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryByText(/no version clients can see/)).toBeNull();
    cleanup();
    mockUser.current = { is_admin: true };
    mockListServers.mockResolvedValue({ servers: [WEATHER], nextCursor: "c2", count: 1, dropped: 0 });
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.queryByText(/no version clients can see/)).toBeNull();
  });

  it("opens the install sheet from a card", async () => {
    renderGallery();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Install com.acme/sql" }));
    expect(await screen.findByText("Install com.acme/sql v2.0.0")).toBeInTheDocument();
    await waitFor(() => expect(mockListVersions).toHaveBeenCalledWith("mcp-local", "com.acme/sql"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("heldServerNames", () => {
  it("returns catalog names with no served entry, once each, sorted", () => {
    expect(
      heldServerNames([{ name: "b" }, { name: "a" }, { name: "b" }, { name: "com.acme/weather" }], [WEATHER]),
    ).toEqual(["a", "b"]);
  });
});
