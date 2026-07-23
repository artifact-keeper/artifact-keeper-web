import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const VALID = {
  max_upload_size_bytes: 10_737_418_240,
  demo_mode: false,
  guest_access_enabled: true,
  scanners: {
    trivy_enabled: true,
    openscap_enabled: false,
    dependency_track_enabled: false,
  },
  search_engine: "opensearch",
  storage_backend: "s3",
  auth: { oidc_enabled: true, ldap_enabled: false, sso_enabled: true },
  oidc_issuer: "https://auth.example.com",
  permissions: { rules_exist: true, enforcement_enabled: true },
};

describe("systemConfigApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a full config response", async () => {
    mockApiFetch.mockResolvedValue(VALID);
    const mod = await import("../system-config");
    const config = await mod.systemConfigApi.getConfig();
    expect(config.max_upload_size_bytes).toBe(10_737_418_240);
    expect(config.scanners.trivy_enabled).toBe(true);
    expect(config.auth.sso_enabled).toBe(true);
    expect(config.oidc_issuer).toBe("https://auth.example.com");
  });

  it("calls the public system config endpoint with GET", async () => {
    mockApiFetch.mockResolvedValue(VALID);
    const mod = await import("../system-config");
    await mod.systemConfigApi.getConfig();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/system/config", {
      method: "GET",
    });
  });

  it("accepts a response without the optional oidc_issuer", async () => {
    const { oidc_issuer: _omit, ...withoutIssuer } = VALID;
    void _omit;
    mockApiFetch.mockResolvedValue(withoutIssuer);
    const mod = await import("../system-config");
    const config = await mod.systemConfigApi.getConfig();
    expect(config.oidc_issuer).toBeUndefined();
  });

  it("ignores unknown forward-compatible fields", async () => {
    mockApiFetch.mockResolvedValue({ ...VALID, future_flag: true });
    const mod = await import("../system-config");
    const config = await mod.systemConfigApi.getConfig();
    expect(config.storage_backend).toBe("s3");
  });

  it("throws when required fields are missing or wrong type", async () => {
    mockApiFetch.mockResolvedValue({ demo_mode: "nope" });
    const mod = await import("../system-config");
    await expect(mod.systemConfigApi.getConfig()).rejects.toThrow(
      /did not match/
    );
  });

  it("anyScannerEnabled reflects the scanner flags", async () => {
    const mod = await import("../system-config");
    expect(mod.anyScannerEnabled(mod.parseSystemConfig(VALID))).toBe(true);
    expect(
      mod.anyScannerEnabled(
        mod.parseSystemConfig({
          ...VALID,
          scanners: {
            trivy_enabled: false,
            openscap_enabled: false,
            dependency_track_enabled: false,
          },
        })
      )
    ).toBe(false);
  });

  it("exposes permissive defaults", async () => {
    const mod = await import("../system-config");
    expect(mod.DEFAULT_SYSTEM_CONFIG.guest_access_enabled).toBe(true);
    expect(mod.anyScannerEnabled(mod.DEFAULT_SYSTEM_CONFIG)).toBe(false);
  });
});
