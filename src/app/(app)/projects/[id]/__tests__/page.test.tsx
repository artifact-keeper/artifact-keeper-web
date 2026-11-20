// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/providers/project-provider", () => ({
  useActiveProject: () => ({ projects: [], activeProject: null, setActiveProjectId: vi.fn() }),
}));

const mockGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/projects")>()),
  projectsApi: { get: (...args: unknown[]) => mockGet(...args) },
}));

// The tabs have their own tests; here only what the page hands them matters.
const tabProps = vi.hoisted(() => ({ repos: null as unknown, members: null as unknown }));
vi.mock("../_components/project-repos-tab", () => ({
  ProjectReposTab: (props: unknown) => {
    tabProps.repos = props;
    return <div data-testid="repos-tab" />;
  },
}));
vi.mock("../_components/project-members-tab", () => ({
  ProjectMembersTab: (props: unknown) => {
    tabProps.members = props;
    return <div data-testid="members-tab" />;
  },
}));

import ProjectDetailPage from "../page";

const PROJECT = {
  id: "p1",
  key: "alpha",
  name: "Alpha",
  description: "Team Alpha",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(PROJECT);
});
afterEach(cleanup);

describe("ProjectDetailPage - who may manage", () => {
  it("gives a global admin the edit and delete controls", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u-admin", is_admin: true } });
    renderPage();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(tabProps.repos).toMatchObject({ canManage: true });
    await userEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(tabProps.members).toMatchObject({ canManage: true, isGlobalAdmin: true });
  });

  it("gives a project admin the controls because the project loaded, however the admin right was granted (#988 review)", async () => {
    // No member row for this user is ever fetched or looked at: an admin who
    // gets the right through a group has no direct row, and the backend only
    // lets a project admin read the project at all.
    mockUseAuth.mockReturnValue({ user: { id: "u-via-group", is_admin: false } });
    renderPage();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(tabProps.repos).toMatchObject({ canManage: true });
    await userEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(tabProps.members).toMatchObject({ canManage: true, isGlobalAdmin: false });
  });

  it("keeps Delete for global admins: a project admin cannot delete the project", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u-via-group", is_admin: false } });
    renderPage();
    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("offers no controls, only a not-found page, when the project cannot be read", async () => {
    mockGet.mockRejectedValue({ code: "FORBIDDEN" });
    mockUseAuth.mockReturnValue({ user: { id: "u-member", is_admin: false } });
    renderPage();
    expect(await screen.findByText("Project not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByTestId("repos-tab")).toBeNull();
  });

  it("reads the project by id and does not fetch the member list just to decide this", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1", is_admin: false } });
    renderPage();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("p1"));
  });
});
