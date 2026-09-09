/**
 * Types for the repository-scoped proxy scan verdict endpoint.
 *
 * ```
 * GET /api/v1/repositories/:key/security/proxy-scans          → summary + paged list
 * GET /api/v1/repositories/:key/security/proxy-scans?path=…   → one cached path
 * ```
 *
 * Proxy-cached artifacts are scanned at download time and blocked on policy
 * violation, but they have no `artifacts` row and no artifact-keyed CVE
 * history, so none of it was visible in the UI. Verdicts are keyed by content
 * digest and looked up **by cache path** — a digest parameter would turn the
 * endpoint into a cross-tenant lookup oracle, a path is inherently scoped to
 * the calling repository.
 *
 * The endpoint requires authentication unconditionally, including on public
 * repositories.
 */

/**
 * Verdict state for one cached path.
 *
 * There is deliberately no `stale` state and no `pending` state: the backend
 * persists successful verdicts, not scan attempts, so nothing at rest
 * distinguishes "not scanned yet" from "scan failed" from "over the size cap".
 * All of those land in `not_scanned` with reason `unknown`.
 */
export type ProxyScanState = "clean" | "vulnerable" | "not_scanned";

/**
 * Why a path has no verdict row.
 *
 * `scanning_disabled` also covers the case where the repository has **no**
 * `scan_configs` row at all — that is the default state for a repository whose
 * security settings were never saved, and it matches what the download gate
 * actually does (`unwrap_or(false)`).
 *
 * `unknown` is a large bucket: over-cap content, unestablished identity, and
 * failed scans all land here, including cases where content was served without
 * ever being scanned. Copy for it must never imply safety.
 */
export type ProxyScanNotScannedReason = "scanning_disabled" | "unknown";

/**
 * What the repository does when a proxy scan cannot produce a usable verdict.
 * `fail_open` serves the artifact anyway; `fail_closed` withholds it.
 */
export type ProxyScanAction = "fail_open" | "fail_closed";

/** Verdict for a single cached path. */
export interface ProxyScanEntry {
  /** Cache path within the repository. */
  path: string;
  state: ProxyScanState;
  /** Present only when `state` is `not_scanned`. */
  reason?: ProxyScanNotScannedReason | null;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  findings_count: number;
  /**
   * When the verdict was recorded, floored at this repository's own
   * `cached_at` so a raw timestamp cannot be used as a tenant-activity oracle.
   * Null for `not_scanned`.
   */
  scanned_at?: string | null;
}

/**
 * Counts over **distinct digests**, not paths — one repository can cache the
 * same digest at many paths.
 */
export interface ProxyScanSummary {
  clean: number;
  vulnerable: number;
  not_scanned: number;
  /**
   * Placeholder rows with a NULL `checksum_sha256`. `record_proxy_download`
   * upserts these before content commits, and an aborted tee or a client
   * disconnect leaves them NULL permanently — there is no cleanup job. They
   * join to nothing, so they are excluded from the state counts and reported
   * separately for the totals to reconcile with the artifact listing.
   */
  pending_ingest: number;
}

/** Repository-level enforcement context, carried on every response. */
export interface ProxyScanEnforcement {
  /** Whether this repository scans proxy downloads at all. */
  scan_on_proxy: boolean;
  proxy_scan_action: ProxyScanAction;
}

/** Summary + paged list response. */
export interface ProxyScanListResponse extends ProxyScanEnforcement {
  summary: ProxyScanSummary;
  items: ProxyScanEntry[];
  total: number;
  page: number;
  per_page: number;
}

/** Single-path response: the entry plus the same enforcement context. */
export interface ProxyScanPathResponse extends ProxyScanEnforcement {
  entry: ProxyScanEntry | null;
}

export interface ListProxyScansParams {
  page?: number;
  per_page?: number;
}
