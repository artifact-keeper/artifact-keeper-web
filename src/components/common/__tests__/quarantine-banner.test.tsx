// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuarantineBanner } from "../quarantine-banner";

vi.mock("@/lib/quarantine", () => ({
  formatQuarantineExpiry: (val: string | null | undefined) => {
    if (!val) return null;
    if (val === "2026-04-10T00:00:00Z") return "Expired";
    return "Expires in 5 days";
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

vi.mock("@/components/ui/alert", () => ({
  Alert: ({
    children,
    className,
    ...props
  }: React.ComponentProps<"div">) => (
    <div role="alert" className={className} {...props}>
      {children}
    </div>
  ),
  AlertTitle: ({
    children,
    ...props
  }: React.ComponentProps<"div">) => (
    <div data-testid="alert-title" {...props}>
      {children}
    </div>
  ),
  AlertDescription: ({
    children,
    ...props
  }: React.ComponentProps<"div">) => (
    <div data-testid="alert-description" {...props}>
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("QuarantineBanner", () => {
  it("renders the quarantine title", () => {
    render(<QuarantineBanner />);
    expect(
      screen.getByText("This artifact is quarantined")
    ).toBeInTheDocument();
  });

  it("renders as an alert with role=alert", () => {
    render(<QuarantineBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the ShieldAlert icon", () => {
    render(<QuarantineBanner />);
    expect(screen.getByTestId("icon-ShieldAlert")).toBeInTheDocument();
  });

  it("shows reason when provided", () => {
    render(<QuarantineBanner reason="Vulnerability CVE-2026-1234 found" />);
    expect(
      screen.getByText("Vulnerability CVE-2026-1234 found")
    ).toBeInTheDocument();
  });

  it("shows expiry when quarantineUntil is provided", () => {
    render(
      <QuarantineBanner quarantineUntil="2026-04-22T12:00:00Z" />
    );
    expect(screen.getByText("Expires in 5 days")).toBeInTheDocument();
  });

  it("shows both reason and expiry", () => {
    render(
      <QuarantineBanner
        reason="Malware detected"
        quarantineUntil="2026-04-22T12:00:00Z"
      />
    );
    expect(screen.getByText("Malware detected")).toBeInTheDocument();
    expect(screen.getByText("Expires in 5 days")).toBeInTheDocument();
  });

  it("shows default message when no reason and no expiry", () => {
    render(<QuarantineBanner />);
    expect(
      screen.getByText(
        "Downloads may be restricted until the quarantine is lifted by an administrator."
      )
    ).toBeInTheDocument();
  });

  it("does not show default message when reason is provided", () => {
    render(<QuarantineBanner reason="Under review" />);
    expect(
      screen.queryByText(
        "Downloads may be restricted until the quarantine is lifted by an administrator."
      )
    ).not.toBeInTheDocument();
  });
});
