// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * #844: `/api/v1/system/config` answers anonymous callers with its public tier
 * and admins with extra fields. It is fetched once by SystemConfigProvider,
 * which sits ABOVE AuthProvider (src/providers/index.tsx), so signing in or out
 * without a reload must refetch it through the shared query cache, on every
 * sign-in path.
 */

vi.mock("@/lib/sdk-client", () => ({}));

const mockSdkLogin = vi.fn();
const mockSdkLogout = vi.fn();
const mockSdkGetCurrentUser = vi.fn();
const mockSdkSetupStatus = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  login: (...args: unknown[]) => mockSdkLogin(...args),
  logout: (...args: unknown[]) => mockSdkLogout(...args),
  getCurrentUser: (...args: unknown[]) => mockSdkGetCurrentUser(...args),
  verifyTotp: vi.fn(),
  changePassword: vi.fn(),
  setupStatus: (...args: unknown[]) => mockSdkSetupStatus(...args),
}));

// The backend's answer depends on who is asking: "signedIn" stands in for the
// session cookie.
let signedIn = false;
const mockGetConfig = vi.fn();

vi.mock("@/lib/api/system-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/system-config")>();
  return { ...actual, systemConfigApi: { getConfig: () => mockGetConfig() } };
});

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

import { AuthProvider, useAuth } from "../auth-provider";
import { SystemConfigProvider, useSystemConfig } from "../system-config-provider";
import { DEFAULT_SYSTEM_CONFIG, type SystemConfig } from "@/lib/api/system-config";

const ANONYMOUS: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG, search_engine: "database" };
// `search_engine` is one of the admin-only fields (backend #1960).
const ADMIN: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG, search_engine: "meilisearch" };

const ADMIN_USER = { id: "u-admin", username: "admin", is_admin: true };

const authRef = { current: null as ReturnType<typeof useAuth> | null };

function Consumer() {
  const auth = useAuth();
  const { config } = useSystemConfig();
  React.useEffect(() => {
    authRef.current = auth;
  });
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="search-engine">{config.search_engine}</span>
    </div>
  );
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SystemConfigProvider>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </SystemConfigProvider>
    </QueryClientProvider>
  );
  return queryClient;
}

async function renderAnonymous() {
  const client = renderApp();
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  await waitFor(() => expect(screen.getByTestId("search-engine").textContent).toBe("database"));
  expect(mockGetConfig).toHaveBeenCalledTimes(1);
  return client;
}

function signInOnBackend() {
  signedIn = true;
  mockSdkGetCurrentUser.mockResolvedValue({ data: ADMIN_USER, error: undefined });
}

describe("system-config follows the signed-in principal (#844)", () => {
  beforeEach(() => {
    signedIn = false;
    authRef.current = null;
    mockSdkLogin.mockReset();
    mockSdkLogout.mockReset().mockResolvedValue({});
    mockSdkGetCurrentUser.mockReset().mockResolvedValue({ data: null, error: "unauthorized" });
    mockSdkSetupStatus.mockReset().mockResolvedValue({ data: { setup_required: false } });
    mockGetConfig.mockReset().mockImplementation(async () => (signedIn ? ADMIN : ANONYMOUS));
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ demo_mode: false }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("refetches after a password login", async () => {
    await renderAnonymous();
    mockSdkLogin.mockImplementation(async () => {
      signInOnBackend();
      return { data: { must_change_password: false } };
    });

    await act(async () => {
      await authRef.current!.login("admin", "pw");
    });

    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("meilisearch")
    );
  });

  it("refetches after an SSO callback or LDAP login, which only call refreshUser", async () => {
    await renderAnonymous();
    signInOnBackend();

    await act(async () => {
      await authRef.current!.refreshUser();
    });

    expect(mockGetConfig).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("meilisearch")
    );
  });

  it("does not refetch when refreshUser finds the same user (profile refresh)", async () => {
    await renderAnonymous();
    signInOnBackend();
    await act(async () => {
      await authRef.current!.refreshUser();
    });
    expect(mockGetConfig).toHaveBeenCalledTimes(2);

    await act(async () => {
      await authRef.current!.refreshUser();
    });

    expect(mockGetConfig).toHaveBeenCalledTimes(2);
  });

  it("drops the admin payload on logout, and refetches it on the next login", async () => {
    await renderAnonymous();
    signInOnBackend();
    await act(async () => {
      await authRef.current!.refreshUser();
    });
    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("meilisearch")
    );

    mockSdkLogout.mockImplementation(async () => {
      signedIn = false;
      return {};
    });
    await act(async () => {
      await authRef.current!.logout();
    });
    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("database")
    );
    expect(mockGetConfig).toHaveBeenCalledTimes(3);

    signInOnBackend();
    await act(async () => {
      await authRef.current!.refreshUser();
    });
    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("meilisearch")
    );
    expect(mockGetConfig).toHaveBeenCalledTimes(4);
  });

  it("still drops every other cached query on logout (#487)", async () => {
    const client = await renderAnonymous();
    signInOnBackend();
    await act(async () => {
      await authRef.current!.refreshUser();
    });
    client.setQueryData(["repositories", "private"], ["secret-repo"]);

    await act(async () => {
      await authRef.current!.logout();
    });

    expect(client.getQueryData(["repositories", "private"])).toBeUndefined();
  });

  it("does not refetch on load when a cookie session is restored", async () => {
    signInOnBackend();
    renderApp();
    await waitFor(() => expect(screen.getByTestId("authenticated").textContent).toBe("true"));
    await waitFor(() =>
      expect(screen.getByTestId("search-engine").textContent).toBe("meilisearch")
    );
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
  });
});
