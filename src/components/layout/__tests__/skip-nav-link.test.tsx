// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { SkipNavLink } from "../skip-nav-link";

afterEach(cleanup);

describe("SkipNavLink", () => {
  it("renders a link targeting the main content landmark", () => {
    render(<SkipNavLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", "#main-content");
  });

  it("is visually hidden until focused", () => {
    render(<SkipNavLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus:not-sr-only");
  });
});
