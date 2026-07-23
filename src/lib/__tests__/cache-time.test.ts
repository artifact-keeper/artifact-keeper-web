import { describe, it, expect } from "vitest";
import { formatRelativeTimestamp, formatCacheExpiry } from "../cache-time";

// Reference Date used as the "now" anchor in every case below.
// Chosen to be UTC noon so timezone shifts don't bleed into the unit
// boundaries of the test inputs.
const NOW = new Date("2026-06-01T12:00:00Z");

describe("formatRelativeTimestamp", () => {
  it("returns 'now' / 'this minute' for the same instant", () => {
    // Intl.RelativeTimeFormat with numeric='auto' renders 0-magnitude
    // values as 'now' or 'this minute' depending on the unit it picked.
    // Both are acceptable; we just need a non-empty short string.
    const result = formatRelativeTimestamp("2026-06-01T12:00:00Z", NOW);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain("NaN");
  });

  it("renders future timestamps with positive direction", () => {
    // 4 hours into the future -> 'in 4 hours'
    const result = formatRelativeTimestamp("2026-06-01T16:00:00Z", NOW);
    expect(result).toMatch(/in 4 hours?/i);
  });

  it("renders past timestamps with negative direction", () => {
    // 4 hours into the past -> '4 hours ago'
    const result = formatRelativeTimestamp("2026-06-01T08:00:00Z", NOW);
    expect(result).toMatch(/4 hours? ago/i);
  });

  it("picks the largest sensible unit (days, not 24 hours)", () => {
    // 36 hours into the future -> 'in 2 days' (rounded), not 'in 36 hours'.
    // Pinning the rollover so a future tweak that switches the unit
    // selection logic to e.g. 'always show hours under a week' doesn't
    // silently regress the compactness contract the issue body promises.
    const result = formatRelativeTimestamp("2026-06-03T00:00:00Z", NOW);
    expect(result).toMatch(/days?/i);
    expect(result).not.toMatch(/hours/i);
  });

  it("falls back to the input string for an unparseable timestamp", () => {
    expect(formatRelativeTimestamp("not-a-date", NOW)).toBe("not-a-date");
  });
});

describe("formatCacheExpiry", () => {
  it("renders future timestamps with the relative-time framing", () => {
    // For a not-yet-expired entry we just want the bare relative-time
    // output -- no 'expired ... ago' wrapper.
    const result = formatCacheExpiry("2026-06-01T16:00:00Z", NOW);
    expect(result).toMatch(/in 4 hours?/i);
    expect(result).not.toContain("expired");
  });

  it("renders past timestamps with the 'expired ..., will re-fetch' framing", () => {
    // 12 minutes ago -- exactly the framing the issue body promised:
    // 'expired 12 minutes ago, will re-fetch on next download'.
    const result = formatCacheExpiry("2026-06-01T11:48:00Z", NOW);
    expect(result).toMatch(/^expired/i);
    expect(result).toContain("will re-fetch on next download");
  });

  it("treats the exact same instant as expired", () => {
    // t == now should fall on the 'expired' side -- once a TTL boundary
    // hits, the next request will re-fetch, so showing 'expires in 0
    // seconds' would be misleading.
    const result = formatCacheExpiry("2026-06-01T12:00:00Z", NOW);
    expect(result).toMatch(/^expired/i);
    expect(result).toContain("will re-fetch on next download");
  });

  it("falls back to the input string for an unparseable timestamp", () => {
    expect(formatCacheExpiry("not-a-date", NOW)).toBe("not-a-date");
  });
});
