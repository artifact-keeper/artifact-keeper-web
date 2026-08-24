// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import type { SsoProvider } from "@/types/sso";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefreshUser = vi.fn();
let mockAuth: {
  user: unknown;
  isLoading: boolean;
  setupRequired: boolean;
  refreshUser: typeof mockRefreshUser;
};

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

let mockSystemConfig: {
  config: { auth: { silent_sso_enabled: boolean } };
  isLoading: boolean;
};

vi.mock("@/providers/system-config-provider", () => ({
  useSystemConfig: () => mockSystemConfig,
}));

const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockListProviders = vi.fn();
vi.mock("@/lib/api/sso", () => ({
  ssoApi: { listProviders: (...a: unknown[]) => mockListProviders(...a) },
}));

const mockRunSilentSso = vi.fn();
const mockHasAttempted = vi.fn();
const mockMarkAttempted = vi.fn();
const mockIsExcludedPath = vi.fn();
const mockIsInIframe = vi.fn();

vi.mock("@/lib/silent-sso", () => ({
  runSilentSso: (...a: unknown[]) => mockRunSilentSso(...a),
  hasAttemptedSilentSso: () => mockHasAttempted(),
  markSilentSsoAttempted: () => mockMarkAttempted(),
  isSilentSsoExcludedPath: (p: string) => mockIsExcludedPath(p),
  isInIframe: () => mockIsInIframe(),
}));

import { SilentSsoBootstrap } from "../silent-sso-bootstrap";

const OIDC_PROVIDER: SsoProvider = {
  id: "p1",
  name: "Keycloak",
  provider_type: "oidc",
  login_url: "/api/v1/auth/sso/oidc/p1/login",
};

const SAML_PROVIDER: SsoProvider = {
  id: "p2",
  name: "Okta",
  provider_type: "saml",
  login_url: "/api/v1/auth/sso/saml/p2/login",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = {
    user: null,
    isLoading: false,
    setupRequired: false,
    refreshUser: mockRefreshUser,
  };
  mockSystemConfig = {
    config: { auth: { silent_sso_enabled: true } },
    isLoading: false,
  };
  mockListProviders.mockResolvedValue([OIDC_PROVIDER]);
  mockRunSilentSso.mockResolvedValue("denied");
  mockHasAttempted.mockReturnValue(false);
  mockIsExcludedPath.mockReturnValue(false);
  mockIsInIframe.mockReturnValue(false);
});

afterEach(() => cleanup());

describe("SilentSsoBootstrap", () => {
  it("probes once with the OIDC provider's login URL and records the attempt first", async () => {
    render(<SilentSsoBootstrap />);
    await waitFor(() =>
      expect(mockRunSilentSso).toHaveBeenCalledWith(OIDC_PROVIDER.login_url),
    );
    expect(mockMarkAttempted).toHaveBeenCalledTimes(1);
    // The guard is written before the async work starts, so a crash
    // mid-probe can never loop.
    expect(mockMarkAttempted.mock.invocationCallOrder[0]).toBeLessThan(
      mockListProviders.mock.invocationCallOrder[0],
    );
  });

  it("adopts the identity on success (refresh + query invalidation)", async () => {
    mockRunSilentSso.mockResolvedValue("success");
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalledTimes(1));
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it.each(["denied", "error", "timeout"] as const)(
    "stays anonymous on %s (no refresh, no error surface)",
    async (outcome) => {
      mockRunSilentSso.mockResolvedValue(outcome);
      render(<SilentSsoBootstrap />);
      await waitFor(() => expect(mockRunSilentSso).toHaveBeenCalled());
      // Give the promise chain a beat to (not) call refreshUser.
      await Promise.resolve();
      expect(mockRefreshUser).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    },
  );

  it("does nothing while auth or config are still loading", async () => {
    mockAuth.isLoading = true;
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockMarkAttempted).not.toHaveBeenCalled();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("does nothing when a user is already signed in", async () => {
    mockAuth.user = { id: "u1" };
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("does nothing during first-boot setup", async () => {
    mockAuth.setupRequired = true;
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("honors the operator kill switch (auth.silent_sso_enabled=false)", async () => {
    mockSystemConfig.config.auth.silent_sso_enabled = false;
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockMarkAttempted).not.toHaveBeenCalled();
    expect(mockListProviders).not.toHaveBeenCalled();
    expect(mockRunSilentSso).not.toHaveBeenCalled();
  });

  it("honors the once-per-session guard", async () => {
    mockHasAttempted.mockReturnValue(true);
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockRunSilentSso).not.toHaveBeenCalled();
  });

  it("does not probe on excluded (auth-flow) paths", async () => {
    mockIsExcludedPath.mockReturnValue(true);
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("never probes from inside an iframe (no recursive probes)", async () => {
    mockIsInIframe.mockReturnValue(true);
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("skips the probe when no OIDC provider exists (SAML-only stays explicit)", async () => {
    mockListProviders.mockResolvedValue([SAML_PROVIDER]);
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockRunSilentSso).not.toHaveBeenCalled();
  });

  it("ignores an OIDC provider with a non-relative login URL", async () => {
    mockListProviders.mockResolvedValue([
      { ...OIDC_PROVIDER, login_url: "https://evil.example/login" },
    ]);
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockRunSilentSso).not.toHaveBeenCalled();
  });

  it("fails open when the providers list cannot be fetched", async () => {
    mockListProviders.mockRejectedValue(new Error("backend down"));
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockRunSilentSso).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<SilentSsoBootstrap />);
    expect(container).toBeEmptyDOMElement();
  });
});
