// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...props }: React.ComponentProps<"span">) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

import {
  SeverityBadge,
  severityBadgeClass,
  severityRank,
  maxSeverity,
} from "../severity-badge";

describe("severity-badge helpers", () => {
  it("maps every known severity to a distinct class and includes info", () => {
    const classes = ["critical", "high", "medium", "low", "info"].map(severityBadgeClass);
    expect(new Set(classes).size).toBe(5);
    expect(severityBadgeClass("critical")).toMatch(/red/);
    expect(severityBadgeClass("high")).toMatch(/orange/);
    expect(severityBadgeClass("medium")).toMatch(/amber/);
    expect(severityBadgeClass("low")).toMatch(/blue/);
    expect(severityBadgeClass("info")).toMatch(/bg-secondary/);
  });

  it("is case-insensitive", () => {
    expect(severityBadgeClass("CRITICAL")).toBe(severityBadgeClass("critical"));
  });

  it("falls back to neutral for unknown severities (never a colour that implies a verdict)", () => {
    const cls = severityBadgeClass("blocker");
    expect(cls).toMatch(/bg-secondary/);
    expect(cls).not.toMatch(/red|orange|amber|emerald/);
  });

  it("ranks critical first and unknown last", () => {
    expect(severityRank("critical")).toBeLessThan(severityRank("high"));
    expect(severityRank("info")).toBeLessThan(severityRank("whatever"));
  });

  it("maxSeverity picks the most severe known value and null for empty", () => {
    expect(maxSeverity([])).toBeNull();
    expect(maxSeverity(["low", "critical", "medium"])).toBe("critical");
    expect(maxSeverity(["info", "weird"])).toBe("info");
    expect(maxSeverity(["weird"])).toBe("weird");
  });
});

describe("SeverityBadge", () => {
  afterEach(() => cleanup());

  it("renders the severity verbatim with its data attributes", () => {
    render(<SeverityBadge severity="high" />);
    const el = screen.getByTestId("severity-badge");
    expect(el.textContent).toBe("high");
    expect(el.getAttribute("data-severity")).toBe("high");
    expect(el.className).toMatch(/orange/);
  });

  it("renders an unknown severity verbatim in neutral styling", () => {
    render(<SeverityBadge severity="blocker" />);
    const el = screen.getByTestId("severity-badge");
    expect(el.textContent).toBe("blocker");
    expect(el.className).toMatch(/bg-secondary/);
  });
});
