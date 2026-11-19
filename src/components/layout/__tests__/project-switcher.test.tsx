// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

type Props = { children?: React.ReactNode; [k: string]: unknown };

const mockUseActiveProject = vi.hoisted(() => vi.fn());
vi.mock("@/providers/project-provider", () => ({
  useActiveProject: () => mockUseActiveProject(),
}));

const filters = vi.hoisted(() => [] as Array<(v: string, s: string) => number>);
vi.mock("@/components/ui/command", () => ({
  Command: ({ children, filter }: Props) => {
    filters.push(filter as (v: string, s: string) => number);
    return <div>{children}</div>;
  },
  CommandInput: () => <input aria-label="search" />,
  CommandList: ({ children }: Props) => <div>{children}</div>,
  CommandEmpty: ({ children }: Props) => <div>{children}</div>,
  CommandGroup: ({ children }: Props) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: Props) => (
    <div role="option" onClick={() => (onSelect as () => void)()}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children, onOpenChange }: Props) => (
    <div>
      <button onClick={() => (onOpenChange as (o: boolean) => void)(true)}>open</button>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: Props) => <>{children}</>,
  PopoverContent: ({ children }: Props) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: Props) => <div>{children}</div>,
  SidebarMenu: ({ children }: Props) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: Props) => <div>{children}</div>,
  SidebarMenuButton: ({ children, ...rest }: Props) => (
    <button aria-label={rest["aria-label"] as string}>{children}</button>
  ),
}));

import { ProjectSwitcher } from "../project-switcher";

const projects = [
  { id: "p1", key: "ALPHA", name: "Alpha" },
  { id: "p2", key: "BETA", name: "Beta" },
];
const setActiveProjectId = vi.fn();

beforeEach(() => {
  setActiveProjectId.mockClear();
  filters.length = 0;
});
afterEach(cleanup);

describe("ProjectSwitcher", () => {
  it("renders nothing without projects", () => {
    mockUseActiveProject.mockReturnValue({ projects: [], activeProject: null, setActiveProjectId });
    const { container } = render(<ProjectSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows All projects when none is active and selects a project", () => {
    mockUseActiveProject.mockReturnValue({ projects, activeProject: null, setActiveProjectId });
    render(<ProjectSwitcher />);
    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("All projects");
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("Beta"));
    expect(setActiveProjectId).toHaveBeenCalledWith("p2");
  });

  it("shows the active project and can reset to all", () => {
    mockUseActiveProject.mockReturnValue({ projects, activeProject: projects[0], setActiveProjectId });
    render(<ProjectSwitcher />);
    expect(screen.getByRole("button", { name: "Switch project" })).toHaveTextContent("Alpha");
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    expect(setActiveProjectId).toHaveBeenCalledWith(null);
  });

  it("filters case-insensitively on the row value", () => {
    mockUseActiveProject.mockReturnValue({ projects, activeProject: null, setActiveProjectId });
    render(<ProjectSwitcher />);
    const filter = filters.at(-1)!;
    expect(filter("Alpha ALPHA p1", "alp")).toBe(1);
    expect(filter("Alpha ALPHA p1", "zzz")).toBe(0);
  });
});
