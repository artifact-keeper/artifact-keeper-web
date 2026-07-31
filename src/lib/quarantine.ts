/**
 * The quarantine columns exactly as the backend serializes them
 * (artifact-keeper#2940).
 *
 * Every field is optional because all four are emitted with
 * `skip_serializing_if = "Option::is_none"`: they are present on every row of
 * the repository artifacts listing and on the quarantine status endpoint, and
 * *absent* on the surfaces that never load quarantine state (the by-id and
 * by-path artifact endpoints, version history, the upload response,
 * proxy-cache rows).
 *
 * Absent is not the same as `false`. Absent means the server did not look;
 * `false` means it looked and the artifact is downloadable. Reading the two as
 * one falsy check is what left the quarantine banner unreachable (#650), so
 * the distinction is expressed explicitly in `quarantineKnowledge` and every
 * caller goes through it.
 */
export interface QuarantineFields {
  /**
   * Whether the download gate currently refuses this artifact's bytes. Covers
   * both a live hold (409) and a rejection (403). Named `is_blocked` to match
   * the backend; there is no `is_quarantined` field and there never was.
   */
  is_blocked?: boolean | null;
  /** Raw status: `quarantined`, `rejected`, `released`, `clean`, ... */
  quarantine_status?: string | null;
  /** When a live hold lapses. Null for an unconditional hold. */
  quarantine_until?: string | null;
  /**
   * Why the artifact is held. Redacted (absent) unless the caller can access
   * the repository, because it carries internal policy names, finding counts
   * and admin incident notes. A present status with an absent reason is
   * normal, not an error.
   */
  quarantine_reason?: string | null;
}

/** What a given response actually told us about an artifact's hold. */
export type QuarantineKnowledge = "unknown" | "clear" | "blocked";

/** Shown wherever a download is refused because a hold is in place. */
export const QUARANTINE_HOLD_DOWNLOAD_REASON =
  "Quarantined pending review. An administrator must release it before it can be downloaded.";

/** Shown for a rejected artifact, which no release action can revive. */
export const QUARANTINE_REJECTED_DOWNLOAD_REASON =
  "Rejected during security review. This artifact cannot be downloaded.";

/**
 * Classify what a response says about an artifact's quarantine state.
 *
 * `unknown` is a first-class answer: it means this particular response never
 * carried quarantine state, so nothing about the artifact may be asserted from
 * it. Callers that need the verdict for such an artifact fetch
 * `GET /api/v1/quarantine/{artifact_id}` instead of assuming it is fine.
 */
export function quarantineKnowledge(
  source: QuarantineFields | null | undefined,
): QuarantineKnowledge {
  // `null` as well as `undefined`: the contract omits the key, but a value of
  // null still means "no verdict", never "not blocked".
  if (source == null || source.is_blocked == null) return "unknown";
  if (!source.is_blocked) return "clear";

  // The server computed `is_blocked` when it rendered the response. A view
  // left open past the end of a timed hold should stop claiming the artifact
  // is held. An unparseable timestamp compares false here, so it stays
  // blocked rather than being waved through.
  if (
    source.quarantine_until &&
    new Date(source.quarantine_until).getTime() <= Date.now()
  ) {
    return "clear";
  }
  return "blocked";
}

/**
 * Whether the artifact's bytes are currently refused, as far as this response
 * knows. False for an artifact whose state was never loaded: use
 * `isQuarantineStateKnown` to tell that case apart before rendering anything
 * that asserts the artifact is fine.
 */
export function isActivelyQuarantined(
  source: QuarantineFields | null | undefined,
): boolean {
  return quarantineKnowledge(source) === "blocked";
}

/** Whether this response carried a quarantine verdict at all. */
export function isQuarantineStateKnown(
  source: QuarantineFields | null | undefined,
): boolean {
  return quarantineKnowledge(source) !== "unknown";
}

/**
 * Whether the artifact was rejected in review. A rejection is terminal: the
 * backend only allows `quarantined -> released|rejected`, so neither admin
 * action applies and the UI must not offer them.
 */
export function isQuarantineRejected(
  source: QuarantineFields | null | undefined,
): boolean {
  return source?.quarantine_status === "rejected";
}

/** The sentence explaining why a download control is unavailable. */
export function quarantineDownloadBlockedReason(
  source: QuarantineFields | null | undefined,
): string {
  return isQuarantineRejected(source)
    ? QUARANTINE_REJECTED_DOWNLOAD_REASON
    : QUARANTINE_HOLD_DOWNLOAD_REASON;
}

/**
 * Format a quarantine expiry timestamp into a human-readable relative
 * description (e.g. "Expires in 3 hours" or "Expires on Apr 20, 2026").
 * Returns null if no expiry is set.
 */
export function formatQuarantineExpiry(quarantineUntil: string | null | undefined): string | null {
  if (!quarantineUntil) return null;

  const expiry = new Date(quarantineUntil);
  const now = Date.now();
  const diffMs = expiry.getTime() - now;

  if (diffMs <= 0) {
    return "Expired";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 60) {
    return `Expires in ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
  }
  if (diffHours < 24) {
    return `Expires in ${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
  }
  if (diffDays < 14) {
    return `Expires in ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  }

  return `Expires on ${expiry.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}
