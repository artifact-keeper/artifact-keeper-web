// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();
const mockPathname = vi.fn(() => "/dashboard");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { RequireAuth } from "../require-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultAuth(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    mustChangePassword: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequireAuth", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPathname.mockReturnValue("/dashboard");
    mockUseAuth.mockReturnValue(defaultAuth());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when authenticated", () => {
    render(
      <RequireAuth>
        <div data-testid="content">Protected content</div>
      </RequireAuth>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ isAuthenticated: false })
    );
    render(
      <RequireAuth>
        <div>Protected</div>
      </RequireAuth>
    );
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("shows loading state while auth is loading", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ isLoading: true, isAuthenticated: false })
    );
    render(
      <RequireAuth>
        <div>Protected</div>
      </RequireAuth>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("redirects to /change-password when mustChangePassword is true", () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ mustChangePassword: true })
    );
    render(
      <RequireAuth>
        <div>Protected</div>
      </RequireAuth>
    );
    expect(mockReplace).toHaveBeenCalledWith("/change-password");
  });

  it("does not redirect when on /change-password and mustChangePassword is true", () => {
    mockPathname.mockReturnValue("/change-password");
    mockUseAuth.mockReturnValue(
      defaultAuth({ mustChangePassword: true })
    );
    render(
      <RequireAuth>
        <div data-testid="content">Change password form</div>
      </RequireAuth>
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/change-password");
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("does not redirect when on /profile and mustChangePassword is true", () => {
    mockPathname.mockReturnValue("/profile");
    mockUseAuth.mockReturnValue(
      defaultAuth({ mustChangePassword: true })
    );
    render(
      <RequireAuth>
        <div data-testid="content">Profile page</div>
      </RequireAuth>
    );
    expect(mockReplace).not.toHaveBeenCalledWith("/change-password");
  });
});
