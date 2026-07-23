// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetConfig = vi.fn();
vi.mock("@/lib/api/system-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/system-config")>(
    "@/lib/api/system-config"
  );
  return {
    ...actual,
    systemConfigApi: { getConfig: () => mockGetConfig() },
  };
});

import {
  SystemConfigProvider,
  useFeatureFlags,
  useSystemConfig,
} from "../system-config-provider";

function Consumer() {
  const flags = useFeatureFlags();
  const { isError } = useSystemConfig();
  return (
    <div>
      <span data-testid="scanning">{String(flags.scanningEnabled)}</span>
      <span data-testid="dt">{String(flags.dependencyTrackEnabled)}</span>
      <span data-testid="sso">{String(flags.ssoEnabled)}</span>
      <span data-testid="guest">{String(flags.guestAccessEnabled)}</span>
      <span data-testid="error">{String(isError)}</span>
    </div>
  );
}

function renderWithProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SystemConfigProvider>
        <Consumer />
      </SystemConfigProvider>
    </QueryClientProvider>
  );
}

describe("SystemConfigProvider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("derives feature flags from a fetched config", async () => {
    mockGetConfig.mockResolvedValue({
      max_upload_size_bytes: 100,
      demo_mode: false,
      guest_access_enabled: false,
      scanners: {
        trivy_enabled: true,
        openscap_enabled: false,
        dependency_track_enabled: true,
      },
      search_engine: "opensearch",
      storage_backend: "s3",
      auth: { oidc_enabled: true, ldap_enabled: false, sso_enabled: false },
      permissions: { rules_exist: false, enforcement_enabled: true },
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("scanning")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("dt")).toHaveTextContent("true");
    // sso flag is true when either sso_enabled or oidc_enabled is set.
    expect(screen.getByTestId("sso")).toHaveTextContent("true");
    expect(screen.getByTestId("guest")).toHaveTextContent("false");
  });

  it("falls back to permissive defaults on fetch error", async () => {
    mockGetConfig.mockRejectedValue(new Error("network down"));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("true");
    });
    // Defaults: scanners off, guest access on.
    expect(screen.getByTestId("scanning")).toHaveTextContent("false");
    expect(screen.getByTestId("guest")).toHaveTextContent("true");
  });

  it("throws if useSystemConfig is used outside the provider", () => {
    function Bare() {
      useSystemConfig();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/within a SystemConfigProvider/);
    spy.mockRestore();
  });
});
