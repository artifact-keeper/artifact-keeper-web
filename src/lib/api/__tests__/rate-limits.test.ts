import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe("rateLimitsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses an array exemptions response", async () => {
    mockApiFetch.mockResolvedValue([
      { id: "1", type: "username", value: "ci-bot", source_env: true },
      { id: "2", type: "cidr", value: "10.0.0.0/8", note: "in-cluster" },
    ]);
    const mod = await import("../rate-limits");
    const rows = await mod.rateLimitsApi.listExemptions();
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("username");
    expect(rows[0].source_env).toBe(true);
    expect(rows[1].note).toBe("in-cluster");
  });

  it("parses an object-wrapped exemptions response", async () => {
    mockApiFetch.mockResolvedValue({
      exemptions: [{ id: "3", type: "service_account", value: "deploy-sa" }],
    });
    const mod = await import("../rate-limits");
    const rows = await mod.rateLimitsApi.listExemptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("deploy-sa");
  });

  it("parses the rate-limit config", async () => {
    mockApiFetch.mockResolvedValue({
      auth: { limit: 10, window_secs: 60 },
      api: { limit: 300, window_secs: 60 },
      search: { limit: 100, window_secs: 60 },
      exempt_service_accounts: true,
    });
    const mod = await import("../rate-limits");
    const config = await mod.rateLimitsApi.getConfig();
    expect(config.api.limit).toBe(300);
    expect(config.exempt_service_accounts).toBe(true);
  });

  it("posts a trimmed create payload and parses the echoed row", async () => {
    mockApiFetch.mockResolvedValue({
      id: "9",
      type: "username",
      value: "ci-bot",
      note: "build agent",
    });
    const mod = await import("../rate-limits");
    const row = await mod.rateLimitsApi.addExemption({
      type: "username",
      value: "  ci-bot  ",
      note: "  build agent  ",
    });
    expect(row.id).toBe("9");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/rate-limits/exemptions",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.value).toBe("ci-bot");
    expect(body.note).toBe("build agent");
  });

  it("url-encodes the id when removing an exemption", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const mod = await import("../rate-limits");
    await mod.rateLimitsApi.removeExemption("a/b id");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/rate-limits/exemptions/a%2Fb%20id",
      { method: "DELETE" }
    );
  });

  it("throws on an unparseable config response", async () => {
    mockApiFetch.mockResolvedValue({ auth: "bad" });
    const mod = await import("../rate-limits");
    await expect(mod.rateLimitsApi.getConfig()).rejects.toThrow(/did not match/);
  });
});

describe("rate-limit validation helpers", () => {
  it("validates IPv4 CIDR", async () => {
    const mod = await import("../rate-limits");
    expect(mod.isValidCidr("10.0.0.0/8")).toBe(true);
    expect(mod.isValidCidr("192.168.1.0/24")).toBe(true);
    expect(mod.isValidCidr("10.0.0.0/33")).toBe(false);
    expect(mod.isValidCidr("10.0.0.256/8")).toBe(false);
    expect(mod.isValidCidr("10.0.0.0")).toBe(false);
  });

  it("validates IPv6 CIDR", async () => {
    const mod = await import("../rate-limits");
    expect(mod.isValidCidr("2001:db8::/32")).toBe(true);
    expect(mod.isValidCidr("2001:db8::/129")).toBe(false);
  });

  it("rejects empty values and bad CIDR in validateExemption", async () => {
    const mod = await import("../rate-limits");
    expect(mod.validateExemption({ type: "username", value: "" })).toMatch(
      /required/
    );
    expect(mod.validateExemption({ type: "cidr", value: "not-a-cidr" })).toMatch(
      /valid CIDR/
    );
    expect(
      mod.validateExemption({ type: "username", value: "ci-bot" })
    ).toBeNull();
  });
});

describe("rate-limit exemption parsing error paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listExemptions throws when the response shape is unrecognized", async () => {
    mockApiFetch.mockResolvedValue({ unexpected: "shape" });
    const mod = await import("../rate-limits");
    await expect(mod.rateLimitsApi.listExemptions()).rejects.toThrow(
      /Rate-limit exemptions response did not match the expected shape/
    );
  });

  it("listExemptions accepts a wrapped { exemptions: [] } response", async () => {
    mockApiFetch.mockResolvedValue({
      exemptions: [
        { id: "e1", type: "cidr", value: "10.0.0.0/8", note: "internal", created_at: "2025-01-01" },
      ],
    });
    const mod = await import("../rate-limits");
    const out = await mod.rateLimitsApi.listExemptions();
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("10.0.0.0/8");
  });

  it("addExemption throws when the create response shape is unrecognized", async () => {
    mockApiFetch.mockResolvedValue({ garbage: true });
    const mod = await import("../rate-limits");
    await expect(
      mod.rateLimitsApi.addExemption({ type: "username", value: "ci-bot" })
    ).rejects.toThrow(/Create exemption response did not match the expected shape/);
  });
});
