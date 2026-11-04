import { describe, it, expect } from "vitest";
import type { McpCapabilitySnapshot, McpHealth, McpPackage, McpPackagePin, McpServerJson } from "@/types/mcp";
import {
  MCP_RISK_LEVEL_LABEL,
  MCP_RISK_WEIGHTS,
  assessRisk,
  riskLevel,
  riskScore,
  riskSignals,
  type McpRiskInput,
  type McpRiskSignalId,
} from "../risk";

function pkg(overrides: Partial<McpPackage> = {}): McpPackage {
  return { registryType: "npm", identifier: "@acme/x", version: "1.0.0", transport: { type: "stdio" }, ...overrides };
}

function server(overrides: Partial<McpServerJson> = {}): McpServerJson {
  return { name: "com.acme/x", description: "", version: "1.0.0", ...overrides };
}

/** A remote-only server with nothing loaded raises no signal at all. */
function quiet(overrides: Partial<McpRiskInput> = {}): McpRiskInput {
  return { server: server({ remotes: [{ type: "streamable-http", url: "https://x" }] }), ...overrides };
}

/** A package pinned exactly, but served over http so it does not run locally. */
const remotePkg = pkg({ transport: { type: "streamable-http" } });

function pin(drift?: Record<string, unknown> | null): McpPackagePin {
  return { index: 0, registryType: "npm", submitted: { identifier: "@acme/x" }, resolved: { repository: "r" }, drift };
}

function health(p: Partial<McpHealth["packages"][number]>[]): McpHealth {
  return { state: "warning", packages: p.map((x) => ({ package: "npm:@acme/x", ...x })) };
}

function caps(snapshots: McpCapabilitySnapshot[]) {
  return { snapshots };
}

const TRIGGERS: Record<McpRiskSignalId, McpRiskInput> = {
  runs_locally: quiet({ server: server({ packages: [pkg()] }) }),
  open_policy: quiet({ server: server({ packages: [remotePkg] }), policy: "open" }),
  not_mirrored: quiet({ server: server({ packages: [remotePkg, remotePkg] }), pins: [pin()] }),
  cve_critical: quiet({ health: health([{ critical: 1 }]) }),
  cve_high: quiet({ health: health([{ max_severity: "HIGH" }]) }),
  cve_medium: quiet({ health: health([{ medium: 2 }]) }),
  unpinned: quiet({ server: server({ packages: [pkg({ version: "latest", transport: { type: "sse" } })] }) }),
  deprecated: quiet({ status: "deprecated" }),
  deleted: quiet({ status: "deleted" }),
  tag_moved: quiet({ pins: [pin({ from: "sha256:a", to: "sha256:b" })] }),
  unverified_source: quiet({ source: "unverified" }),
  destructive_tools: quiet({
    capabilities: caps([{ source: "remote_probe", tools: [{ name: "rm", annotations: { destructiveHint: true } }] }]),
  }),
  tool_drift: quiet({ toolDrift: true }),
  not_observable: quiet({ capabilities: caps([{ source: "remote_probe", auth_state: "auth_required" }]) }),
  declared_only: quiet({ capabilities: caps([{ source: "publisher_declared" }]) }),
  secrets: quiet({
    server: server({ remotes: [{ type: "sse", headers: [{ name: "Authorization", isSecret: true }] }] }),
  }),
};

const ids = (input: McpRiskInput) => riskSignals(input).map((s) => s.id);

describe("riskSignals (table-driven over MCP_RISK_WEIGHTS)", () => {
  it("has a trigger for every signal in the weight table", () => {
    expect(Object.keys(TRIGGERS).sort()).toEqual(Object.keys(MCP_RISK_WEIGHTS).sort());
  });

  it("raises nothing for a quiet input", () => {
    expect(riskSignals(quiet())).toEqual([]);
  });

  it.each(Object.keys(MCP_RISK_WEIGHTS) as McpRiskSignalId[])("%s carries the table weight and tone", (id) => {
    const found = riskSignals(TRIGGERS[id]).find((s) => s.id === id);
    expect(found).toBeDefined();
    expect(found?.weight).toBe(MCP_RISK_WEIGHTS[id].weight);
    expect(found?.tone).toBe(MCP_RISK_WEIGHTS[id].tone);
    expect(found?.label.length).toBeGreaterThan(0);
    expect(found?.reason.length).toBeGreaterThan(0);
  });
});

describe("individual signal rules", () => {
  it("open_policy wins over not_mirrored", () => {
    const both = quiet({ server: server({ packages: [remotePkg, remotePkg] }), policy: "open", pins: [] });
    expect(ids(both)).toContain("open_policy");
    expect(ids(both)).not.toContain("not_mirrored");
  });

  it("open policy without packages raises neither", () => {
    expect(ids(quiet({ policy: "open", pins: [] }))).toEqual([]);
  });

  it("not_mirrored needs pins loaded and fewer pins than packages", () => {
    expect(ids(quiet({ server: server({ packages: [remotePkg] }) }))).not.toContain("not_mirrored");
    expect(ids(quiet({ server: server({ packages: [remotePkg] }), pins: [pin()] }))).not.toContain("not_mirrored");
  });

  it("treats a package without a transport as stdio", () => {
    const p = pkg({ transport: undefined as unknown as McpPackage["transport"] });
    expect(ids(quiet({ server: server({ packages: [p] }) }))).toContain("runs_locally");
  });

  it("does not flag oci or mcpb packages as unpinned", () => {
    const s = server({
      packages: [
        pkg({ registryType: "oci", version: undefined, transport: { type: "sse" } }),
        pkg({ registryType: "mcpb", version: "latest", transport: { type: "sse" } }),
      ],
    });
    expect(ids(quiet({ server: s }))).toEqual([]);
  });

  it("does not raise tag_moved for pins without drift", () => {
    expect(ids(quiet({ pins: [pin(null), pin()] }))).toEqual([]);
  });

  it("needs every snapshot to be auth gated or declared", () => {
    const mixed = caps([
      { source: "publisher_declared", auth_state: "caller_specific" },
      { source: "remote_probe", auth_state: "none" },
    ]);
    expect(ids(quiet({ capabilities: mixed }))).toEqual([]);
    expect(ids(quiet({ capabilities: caps([]) }))).toEqual([]);
    expect(ids(quiet({ capabilities: null }))).toEqual([]);
  });

  it("labels the secrets count", () => {
    const s = server({
      remotes: [{ type: "sse", headers: [{ name: "A", isSecret: true }, { name: "B", isSecret: true }] }],
    });
    const one = riskSignals(TRIGGERS.secrets).find((x) => x.id === "secrets");
    const two = riskSignals(quiet({ server: s })).find((x) => x.id === "secrets");
    expect(one?.label).toBe("1 secret");
    expect(two?.label).toBe("2 secrets");
    expect(two?.reason).toContain("A, B");
  });
});

describe("worstSeverity paths", () => {
  const cve = (packages: Partial<McpHealth["packages"][number]>[]) =>
    ids(quiet({ health: health(packages) })).filter((i) => i.startsWith("cve_"));

  it.each([
    ["critical by count", [{ critical: 2 }], ["cve_critical"]],
    ["critical by max_severity", [{ max_severity: "Critical" }], ["cve_critical"]],
    ["critical after a high", [{ high: 1 }, { critical: 1 }], ["cve_critical"]],
    ["high by count", [{ high: 1 }], ["cve_high"]],
    ["high beats medium in any order", [{ medium: 1 }, { high: 1 }], ["cve_high"]],
    ["high kept after a later medium", [{ high: 1 }, { medium: 1 }], ["cve_high"]],
    ["medium by max_severity", [{ max_severity: "medium" }], ["cve_medium"]],
    ["low only", [{ low: 5, max_severity: "low" }], []],
    ["no packages", [], []],
  ])("%s", (_label, packages, expected) => {
    expect(cve(packages)).toEqual(expected);
  });

  it("ignores missing health", () => {
    expect(ids(quiet({ health: null }))).toEqual([]);
  });
});

describe("riskScore / riskLevel / assessRisk", () => {
  it("sums weights", () => {
    const signals = riskSignals(quiet({ status: "deprecated", toolDrift: true, source: "unverified" }));
    expect(riskScore(signals)).toBe(3 + 3 + 2);
    expect(riskScore([])).toBe(0);
  });

  it.each([
    [0, "low"],
    [2, "low"],
    [3, "medium"],
    [4, "medium"],
    [5, "high"],
    [7, "high"],
    [8, "critical"],
    [20, "critical"],
  ])("score %i -> %s", (score, level) => {
    expect(riskLevel(score)).toBe(level);
  });

  it("returns signals, score and level together", () => {
    const r = assessRisk(quiet({ health: health([{ critical: 1 }]), status: "deleted", toolDrift: true }));
    expect(r.signals.map((s) => s.id)).toEqual(["cve_critical", "deleted", "tool_drift"]);
    expect(r.score).toBe(10);
    expect(r.level).toBe("critical");
    expect(assessRisk(quiet())).toEqual({ signals: [], score: 0, level: "low" });
  });

  it("labels every level", () => {
    expect(MCP_RISK_LEVEL_LABEL).toEqual({ low: "Low", medium: "Medium", high: "High", critical: "Critical" });
  });
});
