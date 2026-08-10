import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Admin-tier payload: every security-posture field is present.
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

// Anonymous-tier payload, byte-for-byte what the Rust handler builds for a
// non-admin caller: backend #1960 made `scanners` / `search_engine` /
// `storage_backend` / `permissions` (and `plugin_signing`) admin-only
// `Option<T>` with `skip_serializing_if = "Option::is_none"`, so they are
// absent from the JSON entirely. The login page is always an anonymous caller,
// so this is the shape it actually receives.
const ANONYMOUS = {
  max_upload_size_bytes: 10_737_418_240,
  demo_mode: false,
  guest_access_enabled: true,
  auth: {
    oidc_enabled: true,
    ldap_enabled: false,
    sso_enabled: true,
    local_login_enabled: false,
  },
  oidc_issuer: "https://auth.example.com",
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
      signal: expect.any(AbortSignal),
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
    expect(mod.DEFAULT_SYSTEM_CONFIG.auth.local_login_enabled).toBe(true);
  });

  it("reads auth.local_login_enabled from the response", async () => {
    const mod = await import("../system-config");
    const config = mod.parseSystemConfig({
      ...VALID,
      auth: { ...VALID.auth, local_login_enabled: false },
    });
    expect(config.auth.local_login_enabled).toBe(false);
  });

  it("parses the anonymous payload that omits every admin-only field", async () => {
    // Regression: requiring these four fields made the parser throw for every
    // unauthenticated caller, which is the only kind the login page ever is.
    const mod = await import("../system-config");
    const config = mod.parseSystemConfig(ANONYMOUS);
    expect(config.auth.local_login_enabled).toBe(false);
    expect(config.max_upload_size_bytes).toBe(10_737_418_240);
  });

  it("falls back to the documented defaults for omitted admin-only fields", async () => {
    const mod = await import("../system-config");
    const config = mod.parseSystemConfig(ANONYMOUS);
    expect(config.scanners).toEqual(mod.DEFAULT_SYSTEM_CONFIG.scanners);
    expect(config.search_engine).toBe(mod.DEFAULT_SYSTEM_CONFIG.search_engine);
    expect(config.storage_backend).toBe(
      mod.DEFAULT_SYSTEM_CONFIG.storage_backend
    );
    expect(config.permissions).toEqual(mod.DEFAULT_SYSTEM_CONFIG.permissions);
  });

  it("does not alias the defaults object across parses", async () => {
    // A shared reference would let one consumer's mutation leak into every
    // later parse and into DEFAULT_SYSTEM_CONFIG itself.
    const mod = await import("../system-config");
    const first = mod.parseSystemConfig(ANONYMOUS);
    const second = mod.parseSystemConfig(ANONYMOUS);
    expect(first.scanners).not.toBe(second.scanners);
    expect(first.scanners).not.toBe(mod.DEFAULT_SYSTEM_CONFIG.scanners);
  });

  it("bounds the request with an abort signal so a hung fetch cannot hang the login page", async () => {
    mockApiFetch.mockResolvedValue(ANONYMOUS);
    const mod = await import("../system-config");
    await mod.systemConfigApi.getConfig();
    const init = mockApiFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("defaults local_login_enabled to true when the backend omits it", async () => {
    // Backends older than the one that added the flag (artifact-keeper#2729)
    // send an auth object without it. Assume local login works rather than
    // hiding the only form those deployments have.
    const mod = await import("../system-config");
    const config = mod.parseSystemConfig(VALID);
    expect(VALID.auth).not.toHaveProperty("local_login_enabled");
    expect(config.auth.local_login_enabled).toBe(true);
  });
});
