// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockUseActiveProject = vi.fn();
vi.mock("@/providers/project-provider", () => ({
  useActiveProject: () => mockUseActiveProject(),
}));

import { ProjectBadge } from "../project-badge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const project = { id: "p1", key: "alpha", name: "Alpha" };

describe("ProjectBadge", () => {
  it("links to the project page by name", () => {
    mockUseActiveProject.mockReturnValue({ projects: [project] });
    render(<ProjectBadge projectId="p1" />);
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1");
  });

  it("renders nothing for a repository without a project", () => {
    mockUseActiveProject.mockReturnValue({ projects: [project] });
    const { container } = render(<ProjectBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the caller cannot see the project", () => {
    mockUseActiveProject.mockReturnValue({ projects: [] });
    const { container } = render(<ProjectBadge projectId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
