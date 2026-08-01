/**
 * The quarantine fields an artifact payload may carry, exactly as the shipped
 * backend serializes them (artifact-keeper#2966; listing side #2940).
 *
 * `quarantine_status` is present on every artifact surface that loads
 * quarantine state — the repository artifacts listing, the by-id and the
 * by-path artifact responses — as one of:
 *
 * - `"quarantined"` — held; downloads refused until `quarantine_until` lapses,
 * - `"rejected"` — terminally blocked by an admin,
 * - a scan-lifecycle state (`"clean"` / `"flagged"` / `"unscanned"` /
 *   `"released"`),
 * - `"not_quarantined"` — the explicit default, so a client never has to
 *   treat a missing value as a state.
 *
 * `quarantine_until` travels only with a timed hold
 * (`skip_serializing_if = "Option::is_none"`).
 *
 * Artifact payloads carry NO `is_blocked` and NO `quarantine_reason`: the
 * reason is per-artifact security detail disclosed only by the authenticated,
 * repository-visibility-checked `GET /api/v1/quarantine/{id}` (#2912), which
 * is also the only surface that computes `is_blocked`.
 *
 * An absent `quarantine_status` is still meaningful: the response came from
 * an older backend (or a surface that never loads quarantine state), i.e.
 * "the server did not look". Absent must not read as "clear" — that collapse
 * is what left the quarantine banner unreachable (#650) — so
 * `quarantineKnowledge` keeps `unknown` as a first-class answer and every
 * caller goes through it.
 */
export interface QuarantineFields {
  /**
   * Raw status. Absent only when the server never loaded quarantine state
   * (older backend), or null from the status endpoint for an artifact with
   * no recorded state.
   */
  quarantine_status?: string | null;
  /** When a timed hold lapses. Absent for permanent holds and clear rows. */
  quarantine_until?: string | null;
  /**
   * Why the artifact is held. Only ever present from
   * `GET /api/v1/quarantine/{id}`, and only for callers who hold the
   * repository, because it carries internal policy names, finding counts and
   * admin incident notes. Never present on an artifact listing; a blocked
   * status with an absent reason is normal, not an error.
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
 * The verdict is derived from `quarantine_status` with the same semantics as
 * the backend's download gate (`check_download_allowed` in
 * quarantine_service.rs): `"quarantined"` (while any timed hold is live) and
 * `"rejected"` are blocked; `"not_quarantined"` and the scan-lifecycle states
 * are clear.
 *
 * `unknown` is a first-class answer: it means this particular response never
 * carried quarantine state, so nothing about the artifact may be asserted from
 * it. Callers that need the verdict for such an artifact fetch
 * `GET /api/v1/quarantine/{artifact_id}` instead of assuming it is fine.
 */
export function quarantineKnowledge(
  source: QuarantineFields | null | undefined,
): QuarantineKnowledge {
  if (source == null) return "unknown";
  const status = source.quarantine_status;
  // Absent, null or empty all mean "the server did not look" — never
  // "not blocked".
  if (!status) return "unknown";

  if (status === "quarantined") {
    // A timed hold whose window has lapsed no longer blocks downloads, even
    // though the row keeps the "quarantined" label until the background job
    // transitions it. A view left open past the end of a hold should stop
    // claiming the artifact is held. An unparseable timestamp compares false
    // here, so it stays blocked rather than being waved through.
    if (
      source.quarantine_until &&
      new Date(source.quarantine_until).getTime() <= Date.now()
    ) {
      return "clear";
    }
    return "blocked";
  }
  if (status === "rejected") return "blocked";
  // "not_quarantined" and the scan-lifecycle states are all downloadable.
  return "clear";
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
