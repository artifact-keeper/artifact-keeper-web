import type { McpCatalogItem, McpCatalogPin, McpCatalogVersion } from "@/types/mcp";

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
  const count = item.approvalRequests?.count ?? 0;
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
