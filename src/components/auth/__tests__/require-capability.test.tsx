// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  RequireCapability,
  hasCapability,
  CAP_SECURITY_REVIEW,
} from "../require-capability";
import type { User } from "@/types";

function user(over: Partial<User> = {}): User {
  return {
    id: "u1",
    username: "dev",
    email: "dev@test.local",
    is_admin: false,
    ...over,
  };
}

function authState(over: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: user(),
    ...over,
  };
}

beforeEach(() => {
  mockReplace.mockClear();
  mockUseAuth.mockReset();
});

afterEach(cleanup);

describe("hasCapability", () => {
  it("is false without a user", () => {
    expect(hasCapability(null, CAP_SECURITY_REVIEW)).toBe(false);
    expect(hasCapability(undefined, CAP_SECURITY_REVIEW)).toBe(false);
  });

  it("is true for an admin even with no capabilities list", () => {
    // The backend's require_security_review short-circuits on is_admin, so a
    // UI that disagreed would hide a page the API would serve.
    expect(hasCapability(user({ is_admin: true }), CAP_SECURITY_REVIEW)).toBe(
      true,
    );
  });

  it("is true when the capability is granted", () => {
    expect(
      hasCapability(
        user({ capabilities: [CAP_SECURITY_REVIEW] }),
        CAP_SECURITY_REVIEW,
      ),
    ).toBe(true);
  });

  it("is false for an absent list or a different capability", () => {
    // An older backend sends no list at all; that must read as "no", never
    // as "unknown, allow it".
    expect(hasCapability(user(), CAP_SECURITY_REVIEW)).toBe(false);
    expect(
      hasCapability(user({ capabilities: ["something_else"] }), CAP_SECURITY_REVIEW),
    ).toBe(false);
  });
});

describe("RequireCapability", () => {
  it("renders children for a holder", () => {
    mockUseAuth.mockReturnValue(
      authState({ user: user({ capabilities: [CAP_SECURITY_REVIEW] }) }),
    );
    render(
      <RequireCapability capability={CAP_SECURITY_REVIEW}>
        <div>queue</div>
      </RequireCapability>,
    );
    expect(screen.getByText("queue")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends an authenticated non-holder to 403, not to login", () => {
    mockUseAuth.mockReturnValue(authState());
    render(
      <RequireCapability capability={CAP_SECURITY_REVIEW}>
        <div>queue</div>
      </RequireCapability>,
    );
    expect(screen.queryByText("queue")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/error/403");
  });

  it("sends an anonymous visitor to login", () => {
    mockUseAuth.mockReturnValue(
      authState({ isAuthenticated: false, user: null }),
    );
    render(
      <RequireCapability capability={CAP_SECURITY_REVIEW}>
        <div>queue</div>
      </RequireCapability>,
    );
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("redirects nobody while auth is still loading", () => {
    mockUseAuth.mockReturnValue(authState({ isLoading: true, user: null }));
    render(
      <RequireCapability capability={CAP_SECURITY_REVIEW}>
        <div>queue</div>
      </RequireCapability>,
    );
    expect(screen.queryByText("queue")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
