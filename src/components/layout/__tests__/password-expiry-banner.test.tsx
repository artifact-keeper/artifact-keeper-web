// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="alert-icon" />,
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { PasswordExpiryBanner } from "../password-expiry-banner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function defaultAuth(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    passwordExpiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PasswordExpiryBanner", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(defaultAuth());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when user is not authenticated", () => {
    mockUseAuth.mockReturnValue(defaultAuth({ isAuthenticated: false }));
    const { container } = render(<PasswordExpiryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when passwordExpiresAt is null", () => {
    mockUseAuth.mockReturnValue(defaultAuth({ passwordExpiresAt: null }));
    const { container } = render(<PasswordExpiryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when password expires in more than 7 days", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(10) })
    );
    const { container } = render(<PasswordExpiryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("shows warning when password expires in 5 days", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(5) })
    );
    render(<PasswordExpiryBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/expires in 5 days/)).toBeInTheDocument();
    expect(screen.getByText("Change it now")).toBeInTheDocument();
  });

  it("shows warning when password expires in 1 day", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(1) })
    );
    render(<PasswordExpiryBanner />);
    expect(screen.getByText(/expires tomorrow/)).toBeInTheDocument();
  });

  it("shows 'expires today' when password expires within the next few hours", () => {
    // Set expiry to a few hours from now (less than a full day)
    const d = new Date();
    d.setHours(d.getHours() + 2);
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: d.toISOString() })
    );
    render(<PasswordExpiryBanner />);
    // Math.ceil(2 hours) = 1 day, so this shows "expires tomorrow"
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/expires tomorrow/)).toBeInTheDocument();
  });

  it("shows 'expires today' when password has already expired", () => {
    // Expired passwords clamp to 0 days, showing the "expires today" banner.
    // The RequireAuth redirect handles blocking access separately.
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(-2) })
    );
    render(<PasswordExpiryBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/expires today/)).toBeInTheDocument();
  });

  it("renders nothing when passwordExpiresAt is a malformed date string", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: "not-a-date" })
    );
    const { container } = render(<PasswordExpiryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("links to the change-password page", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(3) })
    );
    render(<PasswordExpiryBanner />);
    const link = screen.getByText("Change it now");
    expect(link.closest("a")).toHaveAttribute("href", "/change-password");
  });

  it("shows warning at the 7-day boundary", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ passwordExpiresAt: futureDate(7) })
    );
    render(<PasswordExpiryBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/expires in 7 days/)).toBeInTheDocument();
  });
});
