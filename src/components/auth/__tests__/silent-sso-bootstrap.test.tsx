// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import type { SsoProvider } from "@/types/sso";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAuth: {
  user: unknown;
  isLoading: boolean;
  setupRequired: boolean;
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

const mockListProviders = vi.fn();
vi.mock("@/lib/api/sso", () => ({
  ssoApi: { listProviders: (...a: unknown[]) => mockListProviders(...a) },
}));

const mockStartSilentSignIn = vi.fn();
const mockHasAttempted = vi.fn();
const mockMarkAttempted = vi.fn();
const mockIsExcludedPath = vi.fn();

vi.mock("@/lib/silent-sso", () => ({
  startSilentSignIn: (...a: unknown[]) => mockStartSilentSignIn(...a),
  hasAttemptedSilentSso: () => mockHasAttempted(),
  markSilentSsoAttempted: () => mockMarkAttempted(),
  isSilentSsoExcludedPath: (p: string) => mockIsExcludedPath(p),
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
  mockAuth = { user: null, isLoading: false, setupRequired: false };
  mockSystemConfig = {
    config: { auth: { silent_sso_enabled: true } },
    isLoading: false,
  };
  mockListProviders.mockResolvedValue([OIDC_PROVIDER]);
  mockStartSilentSignIn.mockResolvedValue(true);
  mockHasAttempted.mockReturnValue(false);
  mockIsExcludedPath.mockReturnValue(false);
});

afterEach(() => cleanup());

describe("SilentSsoBootstrap", () => {
  it("starts one silent sign-in with the OIDC provider's login URL, recording the attempt first", async () => {
    render(<SilentSsoBootstrap />);
    await waitFor(() =>
      expect(mockStartSilentSignIn).toHaveBeenCalledWith(OIDC_PROVIDER.login_url),
    );
    expect(mockStartSilentSignIn).toHaveBeenCalledTimes(1);
    expect(mockMarkAttempted).toHaveBeenCalledTimes(1);
    // The guard is written before the async work starts, so an interrupted
    // round trip can never loop.
    expect(mockMarkAttempted.mock.invocationCallOrder[0]).toBeLessThan(
      mockListProviders.mock.invocationCallOrder[0],
    );
  });

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
    expect(mockStartSilentSignIn).not.toHaveBeenCalled();
  });

  it("honors the once-per-session guard", async () => {
    mockHasAttempted.mockReturnValue(true);
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockStartSilentSignIn).not.toHaveBeenCalled();
  });

  it("does not probe on excluded (auth-flow) paths", async () => {
    mockIsExcludedPath.mockReturnValue(true);
    render(<SilentSsoBootstrap />);
    await Promise.resolve();
    expect(mockListProviders).not.toHaveBeenCalled();
  });

  it("skips the probe when no OIDC provider exists (SAML-only stays explicit)", async () => {
    mockListProviders.mockResolvedValue([SAML_PROVIDER]);
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockStartSilentSignIn).not.toHaveBeenCalled();
  });

  it("ignores an OIDC provider with a non-relative login URL", async () => {
    mockListProviders.mockResolvedValue([
      { ...OIDC_PROVIDER, login_url: "https://evil.example/login" },
    ]);
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockStartSilentSignIn).not.toHaveBeenCalled();
  });

  it("fails open when the providers list cannot be fetched", async () => {
    mockListProviders.mockRejectedValue(new Error("backend down"));
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockListProviders).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockStartSilentSignIn).not.toHaveBeenCalled();
  });

  it("tolerates a failed preflight (startSilentSignIn=false) without any error surface", async () => {
    mockStartSilentSignIn.mockResolvedValue(false);
    render(<SilentSsoBootstrap />);
    await waitFor(() => expect(mockStartSilentSignIn).toHaveBeenCalled());
    // Nothing to assert beyond "no throw, renders nothing": the visitor
    // simply stays anonymous.
  });

  it("renders nothing", () => {
    const { container } = render(<SilentSsoBootstrap />);
    expect(container).toBeEmptyDOMElement();
  });
});
