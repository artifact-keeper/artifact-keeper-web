// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockMembers = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false, error: null }));
vi.mock("@/hooks/use-projects", () => ({
  useProjectMembers: () => mockMembers,
  projectMembersKey: (id: string) => ["projects", id, "members"],
}));

const mockListUsersPage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin", () => ({ adminApi: { listUsersPage: mockListUsersPage } }));
const mockGroupsList = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/groups", () => ({ groupsApi: { list: mockGroupsList } }));
vi.mock("@/lib/api/service-accounts", () => ({ serviceAccountsApi: { list: vi.fn().mockResolvedValue([]) } }));

import { ProjectMembersTab } from "../project-members-tab";

const user = (n: number) => ({ id: `u${n}`, username: `user${n}`, display_name: undefined });

function renderTab(isGlobalAdmin = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectMembersTab projectId="p1" canManage={true} isGlobalAdmin={isGlobalAdmin} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMembers.data = [];
  mockGroupsList.mockResolvedValue({
    items: [],
    pagination: { page: 1, per_page: 100, total: 0, total_pages: 1 },
  });
});
afterEach(cleanup);

describe("ProjectMembersTab - directory (#988 review)", () => {
  it("names a member who is past the first 100 people, not just a raw id", async () => {
    // 150 people at 100 per page: u120 only exists on page 2.
    mockListUsersPage.mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) => {
      const all = Array.from({ length: 150 }, (_, i) => user(i + 1));
      return { items: all.slice((page - 1) * perPage, page * perPage), total: 150 };
    });
    mockMembers.data = [{ principal_type: "user", principal_id: "u120", actions: ["read", "write"] }];
    renderTab();

    expect(await screen.findByText("user120")).toBeInTheDocument();
    expect(mockListUsersPage).toHaveBeenCalledWith({ page: 1, perPage: 100 });
    expect(mockListUsersPage).toHaveBeenCalledWith({ page: 2, perPage: 100 });
  });

  it("names a group member past the first 100 groups", async () => {
    mockListUsersPage.mockResolvedValue({ items: [], total: 0 });
    mockGroupsList.mockImplementation(async ({ page }: { page: number }) => ({
      items: page === 1 ? [{ id: "g1", name: "first" }] : [{ id: "g200", name: "Release Managers" }],
      pagination: { page, per_page: 100, total: 101, total_pages: 2 },
    }));
    mockMembers.data = [{ principal_type: "group", principal_id: "g200", actions: ["read"] }];
    renderTab();

    expect(await screen.findByText("Release Managers")).toBeInTheDocument();
    expect(mockGroupsList).toHaveBeenCalledWith({ page: 2, per_page: 100 });
  });

  it("never asks for a page larger than the backend returns", async () => {
    mockListUsersPage.mockResolvedValue({ items: [], total: 0 });
    renderTab();
    await waitFor(() => expect(mockGroupsList).toHaveBeenCalled());
    for (const [args] of mockGroupsList.mock.calls) expect(args.per_page).toBeLessThanOrEqual(100);
    for (const [args] of mockListUsersPage.mock.calls) expect(args.perPage).toBeLessThanOrEqual(100);
  });

  it("falls back to the id, without breaking, for someone the directory cannot see", async () => {
    mockListUsersPage.mockResolvedValue({ items: [], total: 0 });
    mockMembers.data = [{ principal_type: "user", principal_id: "ghost-id", actions: ["read"] }];
    renderTab();
    expect(await screen.findByText("ghost-id")).toBeInTheDocument();
  });

  it("does not list users at all for someone who is not a global admin", async () => {
    mockMembers.data = [{ principal_type: "user", principal_id: "u1", actions: ["read"] }];
    renderTab(false);
    await waitFor(() => expect(mockGroupsList).toHaveBeenCalled());
    expect(mockListUsersPage).not.toHaveBeenCalled();
    expect(screen.getByText("u1")).toBeInTheDocument();
  });
});
