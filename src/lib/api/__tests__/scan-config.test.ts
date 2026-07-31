import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const fullConfig = {
  id: "cfg-1",
  repository_id: "repo-1",
  scan_enabled: true,
  scan_on_upload: true,
  scan_on_proxy: true,
  block_on_policy_violation: true,
  severity_threshold: "critical",
  proxy_scan_action: "fail_closed",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("scanConfigApi.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a wrapped { config } response including proxy_scan_action", async () => {
    mockApiFetch.mockResolvedValue({ config: fullConfig, score: null });
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.get("maven-releases");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/maven-releases/security",
      { method: "GET" },
    );
    expect(cfg.scan_enabled).toBe(true);
    expect(cfg.scan_on_proxy).toBe(true);
    expect(cfg.block_on_policy_violation).toBe(true);
    expect(cfg.severity_threshold).toBe("critical");
    expect(cfg.proxy_scan_action).toBe("fail_closed");
  });

  it("returns documented defaults when config is null (unconfigured repo)", async () => {
    mockApiFetch.mockResolvedValue({ config: null, score: null });
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.get("npm-proxy");
    expect(cfg).toEqual(mod.DEFAULT_SCAN_CONFIG);
    expect(cfg.proxy_scan_action).toBe("fail_open");
  });

  it("defaults proxy_scan_action to fail_open when the field is absent (SDK-skew safety)", async () => {
    const withoutAction: Partial<typeof fullConfig> = { ...fullConfig };
    delete withoutAction.proxy_scan_action;
    mockApiFetch.mockResolvedValue({ config: withoutAction, score: null });
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.get("maven-releases");
    expect(cfg.proxy_scan_action).toBe("fail_open");
    // Other fields still parse through.
    expect(cfg.scan_enabled).toBe(true);
  });

  it("falls back to fail_open for an unrecognized proxy_scan_action value", async () => {
    mockApiFetch.mockResolvedValue({
      config: { ...fullConfig, proxy_scan_action: "explode" },
      score: null,
    });
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.get("maven-releases");
    expect(cfg.proxy_scan_action).toBe("fail_open");
  });

  it("accepts a bare config object (no wrapper)", async () => {
    mockApiFetch.mockResolvedValue(fullConfig);
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.get("maven-releases");
    expect(cfg.scan_on_upload).toBe(true);
    expect(cfg.proxy_scan_action).toBe("fail_closed");
  });

  it("throws when the response is not an object", async () => {
    mockApiFetch.mockResolvedValue("nope");
    const mod = await import("../scan-config");
    await expect(mod.scanConfigApi.get("x")).rejects.toThrow(
      /did not match the expected shape/,
    );
  });

  it("URL-encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue({ config: null });
    const mod = await import("../scan-config");
    await mod.scanConfigApi.get("group/with space");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/group%2Fwith%20space/security",
      { method: "GET" },
    );
  });
});

describe("scanConfigApi.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs the patch and parses the echoed config", async () => {
    mockApiFetch.mockResolvedValue(fullConfig);
    const mod = await import("../scan-config");
    const cfg = await mod.scanConfigApi.update("maven-releases", {
      scan_enabled: true,
      scan_on_proxy: true,
      proxy_scan_action: "fail_closed",
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/maven-releases/security",
      {
        method: "PUT",
        body: JSON.stringify({
          scan_enabled: true,
          scan_on_proxy: true,
          proxy_scan_action: "fail_closed",
        }),
      },
    );
    expect(cfg.proxy_scan_action).toBe("fail_closed");
    expect(cfg.scan_enabled).toBe(true);
  });

  it("supports a partial patch (single field)", async () => {
    mockApiFetch.mockResolvedValue({ ...fullConfig, scan_enabled: false });
    const mod = await import("../scan-config");
    await mod.scanConfigApi.update("maven-releases", { scan_enabled: false });
    const [, init] = mockApiFetch.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      scan_enabled: false,
    });
  });

  it("throws when the PUT response is malformed", async () => {
    mockApiFetch.mockResolvedValue(42);
    const mod = await import("../scan-config");
    await expect(
      mod.scanConfigApi.update("x", { scan_enabled: true }),
    ).rejects.toThrow(/did not match the expected shape/);
  });
});
