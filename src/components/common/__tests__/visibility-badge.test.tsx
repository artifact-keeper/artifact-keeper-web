// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { VisibilityBadge } from "../visibility-badge";

afterEach(cleanup);

describe("VisibilityBadge", () => {
  it("renders the shared label for each state without an icon by default", () => {
    const { container, rerender } = render(<VisibilityBadge visibility="internal" />);
    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    rerender(<VisibilityBadge visibility="private" />);
    expect(screen.getByText("Private")).toBeInTheDocument();
    rerender(<VisibilityBadge visibility="public" />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("uses the outline variant only for public unless one is given", () => {
    const { container, rerender } = render(<VisibilityBadge visibility="public" />);
    expect(container.firstElementChild).toHaveAttribute("data-variant", "outline");
    rerender(<VisibilityBadge visibility="internal" />);
    expect(container.firstElementChild).toHaveAttribute("data-variant", "secondary");
    rerender(<VisibilityBadge visibility="internal" variant="outline" />);
    expect(container.firstElementChild).toHaveAttribute("data-variant", "outline");
  });

  it("renders a decorative icon when asked", () => {
    const { container } = render(<VisibilityBadge visibility="internal" showIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
