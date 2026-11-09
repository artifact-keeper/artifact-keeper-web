import type {
  McpCapabilities,
  McpHealth,
  McpPackagePin,
  McpPackagePolicy,
  McpServerJson,
  McpServerStatus,
} from "@/types/mcp";
import { isPinnedVersion, isUnverifiedSource, secretsOf, type McpSourceKind } from "@/lib/mcp/server-json";

/**
 * Deterministic, explainable risk signals for an MCP server version
 * (artifact-keeper#5253, lens-ui 4.3 / decision 10). Computed client-side
 * from the served document plus whatever AK state the page has loaded
 * (pins, health roll-up, capability snapshots). Each signal carries its
 * reason, so every badge has a tooltip and the Security tab can list them
 * as a checklist. The score is a reading aid, never an approval: no
 * combination of signals marks a server safe.
 *
 * Keep the weights in this one table; `risk.test.ts` is table-driven over it.
 */

export type McpRiskTone = "neutral" | "amber" | "red";

export type McpRiskSignalId =
  | "runs_locally"
  | "open_policy"
  | "not_mirrored"
  | "cve_critical"
  | "cve_high"
  | "cve_medium"
  | "unpinned"
  | "deprecated"
  | "deleted"
  | "tag_moved"
  | "unverified_source"
  | "destructive_tools"
  | "tool_drift"
  | "not_observable"
  | "declared_only"
  | "secrets";

export interface McpRiskSignal {
  id: McpRiskSignalId;
  label: string;
  reason: string;
  tone: McpRiskTone;
  weight: number;
}

export const MCP_RISK_WEIGHTS: Record<McpRiskSignalId, { weight: number; tone: McpRiskTone }> = {
  runs_locally: { weight: 1, tone: "neutral" },
  open_policy: { weight: 2, tone: "amber" },
  not_mirrored: { weight: 2, tone: "amber" },
  cve_critical: { weight: 4, tone: "red" },
  cve_high: { weight: 3, tone: "red" },
  cve_medium: { weight: 1, tone: "amber" },
  unpinned: { weight: 2, tone: "amber" },
  deprecated: { weight: 3, tone: "red" },
  deleted: { weight: 3, tone: "red" },
  tag_moved: { weight: 2, tone: "amber" },
  unverified_source: { weight: 2, tone: "amber" },
  destructive_tools: { weight: 2, tone: "red" },
  tool_drift: { weight: 3, tone: "red" },
  not_observable: { weight: 0, tone: "neutral" },
  declared_only: { weight: 0, tone: "neutral" },
  secrets: { weight: 0, tone: "neutral" },
};

export type McpRiskLevel = "low" | "medium" | "high" | "critical";

export interface McpRiskInput {
  server: McpServerJson;
  status?: McpServerStatus;
  source?: McpSourceKind;
  policy?: McpPackagePolicy;
  /** Stored pins (`artifact_metadata.packages`), when loaded. */
  pins?: McpPackagePin[];
  /** Health roll-up, when loaded. */
  health?: McpHealth | null;
  /** Capability snapshots, when loaded. */
  capabilities?: McpCapabilities | null;
  /** Phase 2: the version's tool set changed under the same version. */
  toolDrift?: boolean;
}

function signal(id: McpRiskSignalId, label: string, reason: string): McpRiskSignal {
  return { id, label, reason, ...MCP_RISK_WEIGHTS[id] };
}

function worstSeverity(health: McpHealth | null | undefined): "critical" | "high" | "medium" | null {
  let worst: "critical" | "high" | "medium" | null = null;
  for (const p of health?.packages ?? []) {
    if ((p.critical ?? 0) > 0) return "critical";
    if ((p.high ?? 0) > 0) worst = "high";
    else if ((p.medium ?? 0) > 0 && worst === null) worst = "medium";
  }
  return worst;
}

/** Every signal that applies, in table order. */
export function riskSignals(input: McpRiskInput): McpRiskSignal[] {
  const { server } = input;
  const out: McpRiskSignal[] = [];
  const packages = server.packages ?? [];

  if (packages.some((p) => (p.transport?.type ?? "stdio") === "stdio")) {
    out.push(signal("runs_locally", "runs locally", "A package runs on the user's machine with the user's permissions."));
  }
  if (input.policy === "open" && packages.length > 0) {
    out.push(
      signal(
        "open_policy",
        "packages not gated",
        "This repository is an open catalog: package references are served as published and are not resolved, scanned or held by Artifact Keeper.",
      ),
    );
  } else if (input.pins && packages.length > input.pins.length) {
    out.push(
      signal(
        "not_mirrored",
        "not mirrored",
        "At least one package is not pinned to an artifact in this instance, so clients fetch it from its own registry.",
      ),
    );
  }
  const worst = worstSeverity(input.health);
  if (worst === "critical") out.push(signal("cve_critical", "critical CVE", "A pinned package has a critical vulnerability."));
  else if (worst === "high") out.push(signal("cve_high", "high CVE", "A pinned package has a high-severity vulnerability."));
  else if (worst === "medium") out.push(signal("cve_medium", "medium CVE", "A pinned package has a medium-severity vulnerability."));

  if (packages.some((p) => p.registryType !== "oci" && p.registryType !== "mcpb" && !isPinnedVersion(p.version))) {
    out.push(signal("unpinned", "unpinned", "A package has no exact version, so what runs can change without a new server version."));
  }
  if (input.status === "deprecated") {
    out.push(signal("deprecated", "deprecated", "The publisher marked this version deprecated."));
  } else if (input.status === "deleted") {
    out.push(signal("deleted", "deleted", "This version is deleted and is not served to clients."));
  }
  if ((input.pins ?? []).some((p) => p.drift)) {
    out.push(
      signal(
        "tag_moved",
        "tag moved",
        "A pinned image tag now points elsewhere. This version still serves the pinned digest; a new image needs a new server version.",
      ),
    );
  }
  if (isUnverifiedSource(input.source)) {
    out.push(
      signal(
        "unverified_source",
        "unverified source",
        "The entry was ingested from an upstream registry whose bytes Artifact Keeper cannot vouch for (not the official registry or another Artifact Keeper, or the content changed upstream).",
      ),
    );
  }
  const current = input.capabilities?.current ?? null;
  if ((current?.tools ?? []).some((t) => t.annotations?.destructiveHint === true)) {
    out.push(
      signal(
        "destructive_tools",
        "destructive tools",
        "A tool declares destructiveHint. Annotations are server-asserted and untrusted unless the server is trusted.",
      ),
    );
  }
  if (input.toolDrift) {
    out.push(signal("tool_drift", "tool drift", "The tool list changed under the same server version."));
  }
  if (current && (current.authState === "auth_required" || current.authState === "caller_specific")) {
    out.push(signal("not_observable", "not observable", "The tools were listed without credentials; signed-in users may see different tools."));
  }
  const successful = (input.capabilities?.snapshots ?? []).filter((s) => s.outcome === "ok");
  if (current && current.source === "publisher_declared" && !successful.some((s) => s.observed)) {
    out.push(signal("declared_only", "declared only", "The tool list is what the publisher declared, not what was observed."));
  }
  const secrets = secretsOf(server);
  if (secrets.length > 0) {
    out.push(signal("secrets", `${secrets.length} secret${secrets.length === 1 ? "" : "s"}`, `Needs ${secrets.join(", ")}. Secrets are never stored by the registry.`));
  }
  return out;
}

export function riskScore(signals: McpRiskSignal[]): number {
  return signals.reduce((n, s) => n + s.weight, 0);
}

export function riskLevel(score: number): McpRiskLevel {
  if (score >= 8) return "critical";
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export function assessRisk(input: McpRiskInput): { signals: McpRiskSignal[]; score: number; level: McpRiskLevel } {
  const signals = riskSignals(input);
  const score = riskScore(signals);
  return { signals, score, level: riskLevel(score) };
}

export const MCP_RISK_LEVEL_LABEL: Record<McpRiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
