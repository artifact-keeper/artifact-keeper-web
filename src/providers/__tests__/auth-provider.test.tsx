// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks (must be before component import)
// ---------------------------------------------------------------------------

vi.mock("@/lib/sdk-client", () => ({}));

const mockSdkLogin = vi.fn();
const mockSdkLogout = vi.fn();
const mockSdkGetCurrentUser = vi.fn();
const mockSdkVerifyTotp = vi.fn();
const mockSdkChangePassword = vi.fn();
const mockSdkSetupStatus = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  login: (...args: any[]) => mockSdkLogin(...args),
  logout: (...args: any[]) => mockSdkLogout(...args),
  getCurrentUser: (...args: any[]) => mockSdkGetCurrentUser(...args),
  verifyTotp: (...args: any[]) => mockSdkVerifyTotp(...args),
  changePassword: (...args: any[]) => mockSdkChangePassword(...args),
  setupStatus: (...args: any[]) => mockSdkSetupStatus(...args),
}));

// Mock fetch for demo auto-login health check
const originalFetch = globalThis.fetch;

// Provide localStorage stub for jsdom (the auth-provider calls localStorage.removeItem)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { AuthProvider, useAuth } from "../auth-provider";

// ---------------------------------------------------------------------------
// Test consumer component
// ---------------------------------------------------------------------------

const capturedAuthRef = { current: null as ReturnType<typeof useAuth> | null };

function TestConsumer() {
  const auth = useAuth();
  React.useEffect(() => {
    capturedAuthRef.current = auth;
  });
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="must-change">{String(auth.mustChangePassword)}</span>
      <span data-testid="expires-at">{auth.passwordExpiresAt ?? "null"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthProvider", () => {
  beforeEach(() => {
    mockSdkLogin.mockReset();
    mockSdkLogout.mockReset();
    mockSdkGetCurrentUser.mockReset();
    mockSdkVerifyTotp.mockReset();
    mockSdkChangePassword.mockReset();
    mockSdkSetupStatus.mockReset();
    capturedAuthRef.current = null;

    // Default: setup not required, not authenticated
    mockSdkSetupStatus.mockResolvedValue({ data: { setup_required: false } });
    mockSdkGetCurrentUser.mockResolvedValue({ data: null, error: "not_authenticated" });

    // Mock fetch for health check (non-demo)
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ demo_mode: false }),
    }) as any;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("starts in loading state and then resolves", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("sets passwordExpiresAt from user data on init when authenticated", async () => {
    const expiresAt = "2026-05-01T00:00:00Z";
    mockSdkGetCurrentUser.mockResolvedValue({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        password_expires_at: expiresAt,
        must_change_password: false,
      },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("expires-at").textContent).toBe(expiresAt);
  });

  it("sets passwordExpiresAt to null when user has no expiry", async () => {
    mockSdkGetCurrentUser.mockResolvedValue({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        must_change_password: false,
      },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("expires-at").textContent).toBe("null");
  });

  it("sets mustChangePassword from user data on init", async () => {
    mockSdkGetCurrentUser.mockResolvedValue({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        must_change_password: true,
        password_expires_at: null,
      },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("must-change").textContent).toBe("true");
  });

  it("clears passwordExpiresAt on refreshUser error", async () => {
    // Start authenticated
    const expiresAt = "2026-05-01T00:00:00Z";
    mockSdkGetCurrentUser.mockResolvedValueOnce({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        password_expires_at: expiresAt,
        must_change_password: false,
      },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("expires-at").textContent).toBe(expiresAt);
    });

    // Now refreshUser fails
    mockSdkGetCurrentUser.mockResolvedValueOnce({
      data: null,
      error: "session_expired",
    });

    await act(async () => {
      await capturedAuthRef.current!.refreshUser();
    });

    expect(screen.getByTestId("expires-at").textContent).toBe("null");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("clears passwordExpiresAt on logout", async () => {
    const expiresAt = "2026-06-15T00:00:00Z";
    mockSdkGetCurrentUser.mockResolvedValue({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        password_expires_at: expiresAt,
        must_change_password: false,
      },
      error: null,
    });
    mockSdkLogout.mockResolvedValue({});

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("expires-at").textContent).toBe(expiresAt);
    });

    await act(async () => {
      await capturedAuthRef.current!.logout();
    });

    expect(screen.getByTestId("expires-at").textContent).toBe("null");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("clears passwordExpiresAt after changing password", async () => {
    const expiresAt = "2026-04-20T00:00:00Z";
    mockSdkGetCurrentUser.mockResolvedValue({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        password_expires_at: expiresAt,
        must_change_password: true,
      },
      error: null,
    });
    mockSdkChangePassword.mockResolvedValue({ error: null });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("expires-at").textContent).toBe(expiresAt);
      expect(screen.getByTestId("must-change").textContent).toBe("true");
    });

    await act(async () => {
      await capturedAuthRef.current!.changePassword("oldpass", "newpass");
    });

    expect(screen.getByTestId("expires-at").textContent).toBe("null");
    expect(screen.getByTestId("must-change").textContent).toBe("false");
  });

  it("sets passwordExpiresAt after login via refreshUser", async () => {
    const expiresAt = "2026-07-01T00:00:00Z";

    // First call during init: not authenticated
    mockSdkGetCurrentUser.mockResolvedValueOnce({
      data: null,
      error: "not_authenticated",
    });

    mockSdkLogin.mockResolvedValueOnce({
      data: {
        access_token: "tok",
        refresh_token: "rtok",
        expires_in: 3600,
        token_type: "bearer",
        must_change_password: false,
      },
      error: null,
    });

    // After login, refreshUser is called
    mockSdkGetCurrentUser.mockResolvedValueOnce({
      data: {
        id: "u1",
        username: "admin",
        email: "admin@test.com",
        is_admin: true,
        password_expires_at: expiresAt,
        must_change_password: false,
      },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await act(async () => {
      await capturedAuthRef.current!.login("admin", "password");
    });

    expect(screen.getByTestId("expires-at").textContent).toBe(expiresAt);
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });

  it("throws error when useAuth is used outside AuthProvider", () => {
    function BareConsumer() {
      useAuth();
      return null;
    }

    expect(() => render(<BareConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider"
    );
  });
});
