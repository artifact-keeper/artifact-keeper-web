// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuarantineBadge } from "../quarantine-badge";

vi.mock("@/lib/quarantine", () => ({
  formatQuarantineExpiry: (val: string | null | undefined) => {
    if (!val) return null;
    return "Expires in 3 hours";
  },
}));

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: React.ComponentProps<"span">) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    ShieldAlert: stub("ShieldAlert"),
  };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
    ...props
  }: React.ComponentProps<"span">) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
  }: { children: React.ReactNode; asChild?: boolean } & Record<string, unknown>) => <>{children}</>,
  TooltipContent: ({
    children,
    ...rest
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid="tooltip-content" {...rest}>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

afterEach(() => {
  cleanup();
});

describe("QuarantineBadge", () => {
  it("renders the Quarantined text", () => {
    render(<QuarantineBadge />);
    expect(screen.getByText("Quarantined")).toBeInTheDocument();
  });

  it("has the correct aria-label", () => {
    render(<QuarantineBadge />);
    expect(screen.getByLabelText("Quarantined")).toBeInTheDocument();
  });

  it("renders the ShieldAlert icon", () => {
    render(<QuarantineBadge />);
    expect(screen.getByTestId("icon-ShieldAlert")).toBeInTheDocument();
  });

  it("shows tooltip with reason when provided", () => {
    render(<QuarantineBadge reason="Security vulnerability detected" />);
    expect(
      screen.getByText("Security vulnerability detected")
    ).toBeInTheDocument();
  });

  it("shows tooltip with expiry when quarantineUntil is provided", () => {
    render(
      <QuarantineBadge quarantineUntil="2026-04-20T00:00:00Z" />
    );
    expect(screen.getByText("Expires in 3 hours")).toBeInTheDocument();
  });

  it("shows both reason and expiry in tooltip", () => {
    render(
      <QuarantineBadge
        reason="Malware scan pending"
        quarantineUntil="2026-04-20T00:00:00Z"
      />
    );
    expect(screen.getByText("Malware scan pending")).toBeInTheDocument();
    expect(screen.getByText("Expires in 3 hours")).toBeInTheDocument();
  });

  it("does not render tooltip content when no reason and no expiry", () => {
    render(<QuarantineBadge />);
    expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<QuarantineBadge className="my-custom-class" />);
    const badge = screen.getByLabelText("Quarantined");
    expect(badge.className).toContain("my-custom-class");
  });
});
