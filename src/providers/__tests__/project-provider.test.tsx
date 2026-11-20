// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => mockUseAuth() }));

const mockUseProjects = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-projects", () => ({
  useProjects: (opts: unknown) => mockUseProjects(opts),
}));

import { ProjectProvider, useActiveProject } from "../project-provider";

const projects = [
  { id: "p1", key: "ALPHA", name: "Alpha" },
  { id: "p2", key: "BETA", name: "Beta" },
];

function Probe() {
  const ctx = useActiveProject();
  return (
    <div>
      <span data-testid="active">{ctx.activeProject?.name ?? "none"}</span>
      <span data-testid="count">{ctx.projects.length}</span>
      <button onClick={() => ctx.setActiveProjectId("p1")}>pick</button>
      <button onClick={() => ctx.setActiveProjectId(null)}>clear</button>
    </div>
  );
}

afterEach(cleanup);

describe("ProjectProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseProjects.mockReturnValue({ data: projects });
  });

  it("gates the projects query on authentication", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(mockUseProjects).toHaveBeenCalledWith({ enabled: false });
  });

  it("defaults to no projects while data is loading", () => {
    mockUseProjects.mockReturnValue({ data: undefined });
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("hydrates the active project from the session", () => {
    window.sessionStorage.setItem("ak-active-project", "p2");
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("active").textContent).toBe("Beta");
  });

  it("does not carry a scope over from an earlier browser session (#988 review)", () => {
    // A scope kept in localStorage outlived the browser and kept filtering the
    // Repositories list on later visits without the user noticing.
    window.localStorage.setItem("ak-active-project", "p2");
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("resolves a stale stored id to null", () => {
    window.sessionStorage.setItem("ak-active-project", "gone");
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("persists and clears the selection", () => {
    render(<ProjectProvider><Probe /></ProjectProvider>);
    act(() => screen.getByText("pick").click());
    expect(screen.getByTestId("active").textContent).toBe("Alpha");
    expect(window.sessionStorage.getItem("ak-active-project")).toBe("p1");
    expect(window.localStorage.getItem("ak-active-project")).toBeNull();
    act(() => screen.getByText("clear").click());
    expect(screen.getByTestId("active").textContent).toBe("none");
    expect(window.sessionStorage.getItem("ak-active-project")).toBeNull();
  });

  it("still works for this page when storage is unavailable", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      render(<ProjectProvider><Probe /></ProjectProvider>);
      expect(screen.getByTestId("active").textContent).toBe("none");
      act(() => screen.getByText("pick").click());
      expect(screen.getByTestId("active").textContent).toBe("Alpha");
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("skips the global-admin-only project list for a user who is not a global admin", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: false } });
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(mockUseProjects).toHaveBeenCalledWith({ enabled: true, isGlobalAdmin: false });
  });

  it("lists every project for a global admin", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: true } });
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(mockUseProjects).toHaveBeenCalledWith({ enabled: true, isGlobalAdmin: true });
  });

  it("provides inert defaults outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(() => act(() => screen.getByText("pick").click())).not.toThrow();
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
