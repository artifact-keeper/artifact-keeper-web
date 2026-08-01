import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/fetch")>(
    "@/lib/api/fetch",
  );
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

describe("curationRulesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses an array list response and defaults missing fields", async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: "1",
        rule_type: "pattern",
        action: "block",
        scope: "repository",
        package_pattern: "left-*",
        priority: 50,
      },
      // sparse row: defaults kick in
      { id: "2", action: "flag" },
    ]);
    const mod = await import("../curation-rules");
    const rows = await mod.curationRulesApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/curation/rules", {
      method: "GET",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].package_pattern).toBe("left-*");
    // sparse defaults
    expect(rows[1].rule_type).toBe("pattern");
    expect(rows[1].scope).toBe("repository");
    expect(rows[1].package_pattern).toBe("*");
    expect(rows[1].version_constraint).toBe("*");
    expect(rows[1].architecture).toBe("*");
    expect(rows[1].priority).toBe(100);
    expect(rows[1].enabled).toBe(true);
  });

  it("parses an object-wrapped list response", async () => {
    mockApiFetch.mockResolvedValue({
      rules: [{ id: "9", rule_type: "popularity", action: "flag" }],
    });
    const mod = await import("../curation-rules");
    const rows = await mod.curationRulesApi.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].rule_type).toBe("popularity");
  });

  it("narrows an unknown rule_type / scope to safe fallbacks", async () => {
    mockApiFetch.mockResolvedValue([
      { id: "1", rule_type: "quantum", scope: "galaxy", action: "flag" },
    ]);
    const mod = await import("../curation-rules");
    const rows = await mod.curationRulesApi.list();
    expect(rows[0].rule_type).toBe("pattern");
    expect(rows[0].scope).toBe("repository");
  });

  it("keeps engine config on the row", async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: "1",
        rule_type: "publisher_trust",
        action: "block",
        config: {
          trusted_publishers: ["github.com/acme"],
          match: "attestation",
          action: "block",
        },
      },
    ]);
    const mod = await import("../curation-rules");
    const rows = await mod.curationRulesApi.list();
    expect(rows[0].config.trusted_publishers).toEqual(["github.com/acme"]);
  });

  it("throws on a malformed list response", async () => {
    mockApiFetch.mockResolvedValue({ nope: true });
    const mod = await import("../curation-rules");
    await expect(mod.curationRulesApi.list()).rejects.toThrow(
      /did not match the expected shape/i,
    );
  });

  it("POSTs the create body and parses the echoed row", async () => {
    mockApiFetch.mockResolvedValue({
      id: "new",
      rule_type: "popularity",
      action: "flag",
      scope: "global",
    });
    const mod = await import("../curation-rules");
    const created = await mod.curationRulesApi.create({
      rule_type: "popularity",
      action: "flag",
      scope: "global",
      config: { typosquat_check: true },
    });
    expect(created.id).toBe("new");
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/curation/rules");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.rule_type).toBe("popularity");
    expect(body.config.typosquat_check).toBe(true);
  });

  it("PUTs the update body to the id-scoped path", async () => {
    mockApiFetch.mockResolvedValue({ id: "r1", action: "block" });
    const mod = await import("../curation-rules");
    await mod.curationRulesApi.update("r1", { action: "block" });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/v1/curation/rules/r1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).action).toBe("block");
  });

  it("url-encodes the id on delete", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const mod = await import("../curation-rules");
    await mod.curationRulesApi.remove("a/b id");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/curation/rules/a%2Fb%20id",
      { method: "DELETE" },
    );
  });

  describe("parseList", () => {
    it("splits on commas and newlines, trims, and de-dupes", async () => {
      const { parseList } = await import("../curation-rules");
      expect(parseList("react, lodash\nreact\n  express  ")).toEqual([
        "react",
        "lodash",
        "express",
      ]);
      expect(parseList("   ")).toEqual([]);
    });
  });

  describe("clampDistance", () => {
    it("clamps to the 1–2 range and defaults undefined to 2", async () => {
      const { clampDistance } = await import("../curation-rules");
      expect(clampDistance(undefined)).toBe(2);
      expect(clampDistance(0)).toBe(1);
      expect(clampDistance(1)).toBe(1);
      expect(clampDistance(2)).toBe(2);
      expect(clampDistance(9)).toBe(2);
      expect(clampDistance(Number.NaN)).toBe(2);
    });
  });
});
