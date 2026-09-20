import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared severity → badge-class map for finding severities.
 *
 * Several surfaces (scan detail, artifact scans, security tab, SBOM tab)
 * still carry their own copies of this map; this is the single source going
 * forward, based on the most complete existing copy (scan detail: it has
 * `info` and border classes). Migrating the existing call sites is a
 * separate change.
 *
 * Unknown severities intentionally have no entry: callers fall back to the
 * neutral `bg-secondary` style so a value the web doesn't model renders
 * readably rather than as a false "info".
 */
export const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  critical:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  medium:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  info: "bg-secondary text-secondary-foreground border-border",
};

const NEUTRAL_SEVERITY_CLASS = "bg-secondary text-secondary-foreground border-border";

/** Rank for sorting / max-severity; lower is more severe. Unknown → after `info`. */
export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Badge classes for a severity string; neutral for unrecognized values. */
export function severityBadgeClass(severity: string): string {
  return SEVERITY_BADGE_CLASSES[severity.toLowerCase()] ?? NEUTRAL_SEVERITY_CLASS;
}

/** Sort rank for a severity string; unknown values sort after every known one. */
export function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity.toLowerCase()] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The most severe value in a list, or `null` for an empty list. Unknown
 * severities never win over known ones, so a backend-only level can't
 * silently outrank `critical` (or hide behind it).
 */
export function maxSeverity(severities: readonly string[]): string | null {
  let best: string | null = null;
  for (const s of severities) {
    if (best === null || severityRank(s) < severityRank(best)) best = s;
  }
  return best;
}

interface SeverityBadgeProps {
  /** Raw severity string from the API; rendered verbatim (uppercased by CSS). */
  severity: string;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("border text-xs uppercase", severityBadgeClass(severity), className)}
      data-testid="severity-badge"
      data-severity={severity}
    >
      {severity}
    </Badge>
  );
}
