import type { DtProjectMetrics } from "@/types/dependency-track";

export interface AggregatedPoint {
  date: string; // formatted label e.g. "Jan 15"
  dateMs: number; // epoch ms for sorting
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Aggregate per-project metric histories into a single time series,
 * grouping by day and summing severity counts across all projects.
 */
export function aggregateHistories(
  histories:
    | Map<string, DtProjectMetrics[]>
    | Record<string, DtProjectMetrics[]>
): AggregatedPoint[] {
  const entries =
    histories instanceof Map
      ? Array.from(histories.entries())
      : Object.entries(histories);

  // Bucket by start-of-day (midnight UTC)
  const buckets = new Map<
    number,
    { critical: number; high: number; medium: number; low: number }
  >();

  for (const [, metrics] of entries) {
    for (const m of metrics) {
      if (m.lastOccurrence == null) continue;
      // Normalize to start of day (UTC)
      const d = new Date(m.lastOccurrence);
      const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

      const existing = buckets.get(dayMs);
      if (existing) {
        existing.critical += m.critical;
        existing.high += m.high;
        existing.medium += m.medium;
        existing.low += m.low;
      } else {
        buckets.set(dayMs, {
          critical: m.critical,
          high: m.high,
          medium: m.medium,
          low: m.low,
        });
      }
    }
  }

  // Sort by date ascending and format labels
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return sorted.map(([dayMs, counts]) => {
    const d = new Date(dayMs);
    const label = `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
    return {
      date: label,
      dateMs: dayMs,
      ...counts,
    };
  });
}

export function riskScoreColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 40) return "text-orange-500";
  if (score >= 10) return "text-amber-500";
  return "text-green-500";
}

export function riskScoreBgColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-orange-500";
  if (score >= 10) return "bg-amber-500";
  return "bg-green-500";
}

export const SEVERITY_COLORS = {
  critical: { text: "text-red-500", bg: "bg-red-500", hex: "#ef4444" },
  high: { text: "text-orange-500", bg: "bg-orange-500", hex: "#f97316" },
  medium: { text: "text-amber-500", bg: "bg-amber-400", hex: "#f59e0b" },
  low: { text: "text-blue-500", bg: "bg-blue-500", hex: "#3b82f6" },
};
