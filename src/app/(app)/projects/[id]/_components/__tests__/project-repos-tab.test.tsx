// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUseRepositories = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: (...args: unknown[]) => mockUseRepositories(...args),
}));
const mockUpdate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { update: (...args: unknown[]) => mockUpdate(...args) },
}));

import { ProjectReposTab } from "../project-repos-tab";

const repo = (key: string, project_id?: string) => ({
  id: key,
  key,
  format: "npm",
  repo_type: "local",
  storage_used_bytes: 0,
  project_id,
});

function page(items: ReturnType<typeof repo>[], total = items.length) {
  return {
    data: { items, pagination: { page: 1, per_page: 50, total, total_pages: Math.ceil(total / 50) || 1 } },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  };
}

function renderTab(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectReposTab projectId="p1" projectKey="alpha" canManage={canManage} />
    </QueryClientProvider>,
  );
}

/** The tab's own listing (the closed picker also calls the hook, without a project). */
const lastListing = () =>
  [...mockUseRepositories.mock.calls].reverse().find(([p]) => p.project)![0];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRepositories.mockReturnValue(page([repo("alpha-a", "p1"), repo("alpha-b", "p1")]));
});
afterEach(cleanup);

describe("ProjectReposTab - listing", () => {
  it("lists the project's repositories, asking for one page of 50", () => {
    renderTab();
    expect(screen.getByText("alpha-a")).toBeInTheDocument();
    expect(screen.getByText("alpha-b")).toBeInTheDocument();
    expect(mockUseRepositories.mock.calls[0][0]).toMatchObject({ project: "p1", page: 1, per_page: 50 });
  });

  it("never asks for more than the backend returns (no per_page 1000)", () => {
    renderTab();
    for (const [params] of mockUseRepositories.mock.calls) {
      expect(params.per_page).toBeLessThanOrEqual(100);
    }
  });

  it("pages a project with more repositories than one page holds", () => {
    mockUseRepositories.mockReturnValue(
      page(Array.from({ length: 50 }, (_, i) => repo(`alpha-${i}`, "p1")), 120),
    );
    renderTab();
    expect(screen.getByText(/120/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(lastListing()).toMatchObject({ project: "p1", page: 2, per_page: 50 });
  });

  it("keeps the previous page on screen while the next one loads", () => {
    renderTab();
    expect(mockUseRepositories.mock.calls[0][1]).toMatchObject({ keepPreviousData: true });
  });

  it("explains an empty project", () => {
    mockUseRepositories.mockReturnValue(page([]));
    renderTab();
    expect(screen.getByText("No repositories")).toBeInTheDocument();
  });

  it("shows the error, not an empty list, when the request fails", () => {
    mockUseRepositories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("boom"),
    });
    renderTab();
    expect(screen.getByText("Could not load repositories")).toBeInTheDocument();
    expect(screen.queryByText("No repositories")).toBeNull();
  });

  it("offers no management controls to someone who cannot manage", () => {
    renderTab(false);
    expect(screen.queryByRole("button", { name: /add existing/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /new repository/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove alpha-a from project/i })).toBeNull();
  });

  it("links a new repository to this project", () => {
    renderTab();
    expect(screen.getByRole("link", { name: /new repository/i })).toHaveAttribute(
      "href",
      "/repositories?new=1&project=p1",
    );
  });
});

describe("ProjectReposTab - remove", () => {
  it("takes a repository out of the project with an explicit null", async () => {
    mockUpdate.mockResolvedValue({});
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha-a from project" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("alpha-a", { project_id: null }));
  });
});

describe("ProjectReposTab - add existing", () => {
  beforeEach(() => {
    mockUseRepositories.mockImplementation((params: { q?: string; project?: string }) => {
      if (params.project) return page([repo("alpha-a", "p1")]);
      // The picker: everything, filtered like the server's `q` search.
      const all = [repo("alpha-a", "p1"), repo("loose-1"), repo("loose-2"), repo("other-x", "p9")];
      return page(all.filter((r) => !params.q || r.key.includes(params.q)));
    });
  });

  async function openPicker() {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /add existing/i }));
    return screen.findByRole("dialog");
  }

  it("searches on the server instead of loading every repository", async () => {
    const dialog = await openPicker();
    fireEvent.change(within(dialog).getByLabelText("Find a repository"), { target: { value: "loose" } });
    await waitFor(() =>
      expect(mockUseRepositories.mock.calls.some(([p]) => p.q === "loose")).toBe(true),
    );
    // Capped, never the 1000 the backend would silently clamp.
    expect(mockUseRepositories.mock.calls.every(([p]) => (p.per_page ?? 0) <= 100)).toBe(true);
  });

  it("lists matches but not repositories already in this project", async () => {
    const dialog = await openPicker();
    const list = within(dialog).getByRole("list", { name: "Repositories" });
    expect(within(list).queryByText("alpha-a")).toBeNull();
    expect(within(list).getByText("loose-1")).toBeInTheDocument();
    // A repository in another project can be picked: adding it moves it.
    expect(within(list).getByText("other-x")).toBeInTheDocument();
  });

  it("adds the chosen repository to the project", async () => {
    mockUpdate.mockResolvedValue({});
    const dialog = await openPicker();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "loose-2" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("loose-2", { project_id: "p1" }));
  });

  it("says when there are more matches than it shows", async () => {
    mockUseRepositories.mockImplementation((params: { project?: string }) =>
      params.project ? page([]) : page([repo("loose-1")], 240),
    );
    const dialog = await openPicker();
    expect(within(dialog).getByText(/first 50 of 240/)).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    mockUseRepositories.mockImplementation((params: { project?: string }) =>
      params.project ? page([]) : page([]),
    );
    const dialog = await openPicker();
    expect(within(dialog).getByText("No repositories match.")).toBeInTheDocument();
  });
});
