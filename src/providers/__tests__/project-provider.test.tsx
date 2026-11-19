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

  it("hydrates the active project from localStorage", () => {
    window.localStorage.setItem("ak-active-project", "p2");
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("active").textContent).toBe("Beta");
  });

  it("resolves a stale stored id to null", () => {
    window.localStorage.setItem("ak-active-project", "gone");
    render(<ProjectProvider><Probe /></ProjectProvider>);
    expect(screen.getByTestId("active").textContent).toBe("none");
  });

  it("persists and clears the selection", () => {
    render(<ProjectProvider><Probe /></ProjectProvider>);
    act(() => screen.getByText("pick").click());
    expect(screen.getByTestId("active").textContent).toBe("Alpha");
    expect(window.localStorage.getItem("ak-active-project")).toBe("p1");
    act(() => screen.getByText("clear").click());
    expect(screen.getByTestId("active").textContent).toBe("none");
    expect(window.localStorage.getItem("ak-active-project")).toBeNull();
  });

  it("provides inert defaults outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(() => act(() => screen.getByText("pick").click())).not.toThrow();
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
