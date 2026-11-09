import { riskLevel, type McpRiskLevel } from "@/lib/mcp/risk";
import type { McpCatalogItem, McpCatalogPin, McpCatalogSummary, McpCatalogVersion } from "@/types/mcp";

/**
 * Pure formatting for MCP approval-queue rows (artifact-keeper#5253, lens-ui
 * 4.2), over the Remote management API's `CatalogItem`. Kept out of the
 * component so the summaries are unit-tested on their own and the row stays
 * a flat render.
 */

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `name@version` rows re-queued because the upstream bytes changed, not yet re-approved. */
export function driftedPins(item: McpCatalogItem): McpCatalogPin[] {
  return item.pins.filter((p) => !!p.contentDrift && p.status !== "approved" && p.status !== "blocked");
}

/** Whether the row needs a decision on the name itself (not only on a drifted version). */
export function needsNameDecision(item: McpCatalogItem): boolean {
  return item.status === "pending" || item.status === "review";
}

/**
 * The version the "pin this version only" option pins: the upstream's latest
 * version, else the newest known one.
 */
export function reviewVersion(item: McpCatalogItem): string | null {
  return item.latestVersion ?? item.versions[0] ?? null;
}

/**
 * The ingested version whose capabilities diff the row shows: the latest
 * version when it was ingested, else the first ingested one. `null` for a
 * name nothing was ingested for yet (a pending name under
 * `approval_required`).
 */
export function diffVersion(item: McpCatalogItem): McpCatalogVersion | null {
  return item.ingested.find((v) => v.version === item.latestVersion) ?? item.ingested[0] ?? null;
}

/** "Looks like io.github.acme/widget", from the ingest flags, or null. */
export function typosquatNote(item: McpCatalogItem): string | null {
  const similar = item.flags?.typosquat?.similarTo;
  return similar ? `Looks like ${similar}` : null;
}

/** "Requested 3 times: needed for the release bot", or null when nobody asked. */
export function requestNote(item: McpCatalogItem): string | null {
  const count = item.approvalRequests.count;
  if (count <= 0) return null;
  const base = `Requested ${count === 1 ? "once" : `${count} times`}`;
  const note = item.approvalRequests.lastNote?.trim();
  return note ? `${base}: ${note}` : base;
}

/** Ingested versions the sync could not pin (hidden until it can), as one line. */
export function unresolvedNote(item: McpCatalogItem): string | null {
  const stuck = item.ingested.filter((v) => v.unresolved.length > 0);
  if (stuck.length === 0) return null;
  return `${plural(stuck.length, "version")} with unresolved packages (${stuck.map((v) => v.version).join(", ")})`;
}

/** "1 blocking, 2 to review, 1 warning", or null when the lint found nothing (or is not shown). */
export function lintSummary(lint: McpCatalogSummary["lint"]): string | null {
  if (!lint) return null;
  const parts: string[] = [];
  if (lint.block > 0) parts.push(`${lint.block} blocking`);
  if (lint.review > 0) parts.push(`${lint.review} to review`);
  if (lint.warn > 0) parts.push(plural(lint.warn, "warning"));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Transport chips of a catalog row: `stdio·npm`, `http`, ... from the cached summary. */
export function summaryTransports(summary: McpCatalogSummary): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const local = summary.transports.includes("stdio");
  if (local) {
    for (const t of summary.registryTypes) out.push({ key: `stdio:${t}`, label: `stdio·${t}` });
    if (summary.registryTypes.length === 0) out.push({ key: "stdio", label: "stdio" });
  }
  for (const t of summary.transports) {
    if (t === "stdio") continue;
    out.push({ key: `remote:${t}`, label: t === "streamable-http" ? "http" : t });
  }
  return out;
}

/**
 * Risk of a queued name from what the catalog knows before approval: the
 * cached summary of its latest upstream document (local execution, lint
 * verdict), a lookalike flag and the upstream status. Same weights and
 * levels as the server detail's risk reading; `null` before the first sync
 * saw a document.
 */
export function catalogRisk(item: McpCatalogItem): { level: McpRiskLevel; score: number } | null {
  const s = item.summary;
  if (!s) return null;
  let score = 0;
  if (s.transports.includes("stdio")) score += 1;
  if (s.lint && s.lint.block > 0) score += 4;
  else if (s.lint && s.lint.review > 0) score += 2;
  if (item.flags?.typosquat) score += 3;
  if (item.upstreamStatus === "deprecated" || item.upstreamStatus === "deleted") score += 3;
  return { level: riskLevel(score), score };
}
