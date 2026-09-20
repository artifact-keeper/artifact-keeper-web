// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// COVERAGE LIMITS — read before trusting a green run.
//
// The Radix `Tooltip` is replaced by a stub that renders its content
// unconditionally. So WHAT the tooltip says (files ratio, reason) and
// WHETHER one is attached at all are asserted, but hover/focus behaviour
// and the portal are NOT exercised. Nothing here renders through Radix.
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: React.ComponentProps<"span">) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    AlertTriangle: stub("AlertTriangle"),
    CheckCircle2: stub("CheckCircle2"),
    FileQuestion: stub("FileQuestion"),
  };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...props }: React.ComponentProps<"span">) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

import { ScanCompletenessBadge, completenessLabel } from "../scan-completeness-badge";

describe("ScanCompletenessBadge", () => {
  afterEach(() => cleanup());

  it("complete → emerald, check icon, 'Contents inspected'", () => {
    render(<ScanCompletenessBadge status="complete" />);
    const el = screen.getByTestId("scan-completeness");
    expect(el.getAttribute("data-status")).toBe("complete");
    expect(el.textContent).toContain("Contents inspected");
    expect(el.className).toMatch(/emerald/);
    expect(screen.getByTestId("icon-CheckCircle2")).toBeDefined();
    expect(screen.queryByTestId("tooltip-content")).toBeNull();
  });

  it("partial → amber, warning icon, files ratio + reason in tooltip", () => {
    render(
      <ScanCompletenessBadge
        status="partial"
        filesRead={3}
        filesTotal={10}
        reason="archive truncated"
      />
    );
    const el = screen.getByTestId("scan-completeness");
    expect(el.getAttribute("data-status")).toBe("partial");
    expect(el.textContent).toContain("Partially inspected");
    expect(el.className).toMatch(/amber/);
    expect(el.className).not.toMatch(/emerald/);
    expect(screen.getByTestId("icon-AlertTriangle")).toBeDefined();
    const tip = screen.getByTestId("tooltip-content");
    expect(tip.textContent).toContain("3 of 10 files read");
    expect(tip.textContent).toContain("archive truncated");
  });

  it("not_read → neutral (never green, never red), 'Contents not inspected', reason in tooltip", () => {
    render(<ScanCompletenessBadge status="not_read" reason="analyzer disabled" />);
    const el = screen.getByTestId("scan-completeness");
    expect(el.getAttribute("data-status")).toBe("not_read");
    expect(el.textContent).toContain("Contents not inspected");
    expect(el.className).toMatch(/bg-muted/);
    expect(el.className).toMatch(/text-muted-foreground/);
    expect(el.className).not.toMatch(/emerald|red|amber/);
    expect(screen.getByTestId("icon-FileQuestion")).toBeDefined();
    expect(screen.getByTestId("tooltip-content").textContent).toContain("analyzer disabled");
  });

  it("unsupported → neutral, 'Inspection not supported'", () => {
    render(<ScanCompletenessBadge status="unsupported" />);
    const el = screen.getByTestId("scan-completeness");
    expect(el.getAttribute("data-status")).toBe("unsupported");
    expect(el.textContent).toContain("Inspection not supported");
    expect(el.className).toMatch(/bg-muted/);
    expect(el.className).not.toMatch(/emerald|red|amber/);
  });

  it("unknown status → neutral with the raw value rendered verbatim", () => {
    render(<ScanCompletenessBadge status="timed_out" />);
    const el = screen.getByTestId("scan-completeness");
    expect(el.getAttribute("data-status")).toBe("timed_out");
    expect(el.textContent).toContain("timed_out");
    expect(el.className).toMatch(/bg-muted/);
    expect(el.className).not.toMatch(/emerald|red|amber/);
  });

  it("does not show the files ratio for non-partial statuses", () => {
    render(<ScanCompletenessBadge status="complete" filesRead={40} filesTotal={40} />);
    expect(screen.queryByTestId("tooltip-content")).toBeNull();
  });

  it("completenessLabel returns known labels and unknown values verbatim", () => {
    expect(completenessLabel("complete")).toBe("Contents inspected");
    expect(completenessLabel("not_read")).toBe("Contents not inspected");
    expect(completenessLabel("banana")).toBe("banana");
  });
});
