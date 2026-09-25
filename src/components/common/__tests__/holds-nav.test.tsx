// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

const pathnameState = { value: "/quarantine" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

const summaryState: { data: unknown } = { data: undefined };
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => summaryState,
}));

import { HoldsNav } from "../holds-nav";

beforeEach(() => {
  pathnameState.value = "/quarantine";
  summaryState.data = undefined;
});
afterEach(() => cleanup());

describe("HoldsNav", () => {
  it("marks the current queue as the current page", () => {
    render(<HoldsNav />);
    expect(screen.getByRole("link", { name: /Quarantine/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Age Gate/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows summary counts when loaded", () => {
    summaryState.data = {
      ageGatePending: 2,
      quarantineActive: 3,
      quarantineRejected: 1,
      policyBlocked: 5,
    };
    render(<HoldsNav />);
    expect(screen.getByTitle("2 pending")).toHaveTextContent("2");
    expect(screen.getByTitle("4 held")).toHaveTextContent("4");
    expect(screen.getByTitle("5 blocked")).toHaveTextContent("5");
  });
});
