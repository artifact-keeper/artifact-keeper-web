/**
 * The one definition of the severity counts the console shows (#4338).
 *
 * The backend computes every count from the same definition
 * (`backend/src/services/open_findings.rs`): for each artifact, the latest
 * completed scan of each scanner type; one vulnerability per (artifact,
 * advisory), the advisory being the CVE id or, without one, the finding
 * title; its highest reported severity; and only OPEN ones in the severity
 * counts (acknowledged ones are counted on their own). The Overview
 * dashboard, the security dashboard tiles, its per-repository table and the
 * artifact view all show numbers produced that way, so they agree on the
 * same data and say so in the same words.
 */

/** Short label for the definition, shown next to the counts. */
export const OPEN_SEVERITY_COUNTS_HINT =
  "Open vulnerabilities from each artifact's latest scans, one per advisory at its highest reported severity. Acknowledged ones are counted separately.";

export type CountedSeverity = "critical" | "high" | "medium" | "low";

export type SeverityBreakdown = Record<CountedSeverity, number>;

interface CveEntryLike {
  severity: string | null;
  status: string;
}

/**
 * Open CVEs by severity for one artifact, from its CVE history.
 *
 * The backend marks a CVE its latest scans no longer report as `fixed` and
 * takes severity and acknowledgement from those scans, so the `open` entries
 * are the artifact's share of the dashboards' counts. Fixed, acknowledged and
 * false-positive entries stay in the history table but are not counted here
 * (before #4338 the artifact view counted every entry ever recorded).
 */
export function openSeverityBreakdown(entries: readonly CveEntryLike[]): SeverityBreakdown {
  const out: SeverityBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const entry of entries) {
    if (entry.status !== "open") continue;
    const sev = entry.severity?.toLowerCase();
    if (sev === "critical" || sev === "high" || sev === "medium" || sev === "low") {
      out[sev]++;
    }
  }
  return out;
}
