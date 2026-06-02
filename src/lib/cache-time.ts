/**
 * Helpers for rendering proxy-cache freshness fields on the artifact
 * details dialog (#449). The two functions here both consume an ISO-8601
 * timestamp and an optional reference `now` Date and return a short
 * human-readable string.
 *
 * Exposing `now` as a parameter is what makes the helpers testable
 * deterministically — production callers omit it (defaulting to
 * `new Date()`); tests pass a fixed Date.
 */

/**
 * Format an ISO-8601 timestamp as relative-to-now ("in 4 hours",
 * "12 minutes ago", "expired 3 days ago"). Picks the largest unit that
 * gives a magnitude >= 1 so the output stays compact (we surface
 * "2 hours ago" not "120 minutes ago").
 *
 * Uses `Intl.RelativeTimeFormat` (universally available in modern
 * browsers and Node 14+) so the output is locale-aware without pulling
 * in a date-fns dependency.
 *
 * Returns the original string unchanged when it cannot be parsed as a
 * date — better to show a malformed timestamp than to swallow it.
 */
export function formatRelativeTimestamp(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const deltaMs = t - now.getTime();
  const deltaSec = Math.round(deltaMs / 1000);
  const abs = Math.abs(deltaSec);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === "second") {
      return fmt.format(Math.round(deltaSec / secs), unit);
    }
  }
  return iso;
}

/**
 * Like `formatRelativeTimestamp` but biased for the "expires" framing —
 * past timestamps render as "expired N units ago, will re-fetch on next
 * download" so operators reading the row know what'll happen without
 * checking docs.
 */
export function formatCacheExpiry(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  if (t <= now.getTime()) {
    return `expired ${formatRelativeTimestamp(iso, now)}, will re-fetch on next download`;
  }
  return formatRelativeTimestamp(iso, now);
}
