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
 *
 * Shapes below mirror `ProxyScansResponse` / `ProxyScanEntry` /
 * `ProxyScanSummary` in backend `api/handlers/security.rs` as of backend
 * 1.10.0 (artifact-keeper#3394, per-CVE detail artifact-keeper#3395). Both
 * reads share one envelope: the single-path form returns `items` with at most
 * one entry and omits `summary`.
 */

/**
 * Verdict state for one cached path.
 *
 * There is deliberately no `stale` state: the backend persists successful
 * verdicts, not scan attempts, so nothing at rest distinguishes "not scanned
 * yet" from "scan failed" from "over the size cap". All of those land in
 * `not_scanned` with reason `unknown`.
 *
 * `pending_ingest` is a catalog row whose `checksum_sha256` is still NULL —
 * content that never finished committing. It has no digest to look a verdict
 * up by, so it is neither scanned nor scannable, and must never render clean.
 */
export type ProxyScanState =
  | "clean"
  | "vulnerable"
  | "not_scanned"
  | "pending_ingest";

/**
 * Every state the backend emits. Anything outside it is narrowed to
 * `not_scanned` — the honest fallback, since an unrecognized verdict is by
 * definition one whose safety we cannot vouch for.
 */
export const PROXY_SCAN_STATES: ReadonlySet<ProxyScanState> = new Set([
  "clean",
  "vulnerable",
  "not_scanned",
  "pending_ingest",
]);

/**
 * Why a path has no verdict row. Set by the backend only when `state` is
 * `not_scanned`.
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

export const PROXY_SCAN_REASONS: ReadonlySet<ProxyScanNotScannedReason> =
  new Set(["scanning_disabled", "unknown"]);

/**
 * What the repository does when a proxy scan cannot produce a usable verdict.
 * `fail_open` serves the artifact anyway; `fail_closed` withholds it.
 */
export type ProxyScanAction = "fail_open" | "fail_closed";

export const PROXY_SCAN_ACTIONS: ReadonlySet<ProxyScanAction> = new Set([
  "fail_open",
  "fail_closed",
]);

/**
 * One CVE behind a `vulnerable` verdict (artifact-keeper#3395).
 *
 * Returned only for a single-path read of a `vulnerable` entry: the paged
 * listing omits it to avoid an N+1, and attaching it to any other state would
 * render "we looked and found nothing".
 */
export interface ProxyScanFinding {
  /** `CVE-…` or `GHSA-…`. */
  cve_id: string;
  /** Lowercase token: `critical` | `high` | `medium` | `low` | `info`. */
  severity: string;
  package_name: string | null;
  package_version: string | null;
  /** Version that resolves it, when the scanner reported one. */
  fixed_version: string | null;
  title: string | null;
}

/** Verdict for a single cached path. */
export interface ProxyScanEntry {
  /** Cache path within the repository. */
  path: string;
  /** SHA-256 of the cached bytes. Null while the row is `pending_ingest`. */
  digest: string | null;
  state: ProxyScanState;
  /** Present only when `state` is `not_scanned`. */
  not_scanned_reason: ProxyScanNotScannedReason | null;
  /**
   * Counts are `null` — not `0` — for every state without a verdict row. The
   * backend suppresses them wholesale so an unscanned entry can never render
   * as "0 findings", which reads as clean; the UI must preserve that
   * distinction rather than coalescing to zero on display.
   */
  findings_count: number | null;
  critical_count: number | null;
  high_count: number | null;
  medium_count: number | null;
  low_count: number | null;
  max_severity: string | null;
  /**
   * When the verdict was recorded, floored at this repository's own
   * `cached_at` so a raw timestamp cannot be used as a tenant-activity oracle.
   * Null unless the entry is `clean` or `vulnerable`.
   */
  scanned_at: string | null;
  /** When this repository cached the path. Always present. */
  cached_at: string;
  size_bytes: number;
  /**
   * `null` means "not requested at this granularity" (the paged listing, or a
   * non-`vulnerable` entry); `[]` means "requested, and nothing is on record"
   * — the real state for content cached before per-CVE detail shipped. The two
   * must stay distinguishable or a pre-#3395 artifact renders as having no
   * CVEs, which reads as clean.
   */
  findings: ProxyScanFinding[] | null;
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
   * join to nothing, so they are counted as PATHS, excluded from the state
   * counts, and reported separately for the totals to reconcile with the
   * artifact listing.
   */
  pending_ingest: number;
  /** Distinct digests cached here. Equals `clean + vulnerable + not_scanned`. */
  total_digests: number;
}

/** Repository-level enforcement context, carried on every response. */
export interface ProxyScanEnforcement {
  /** Whether this repository scans proxy downloads at all. */
  scan_on_proxy: boolean;
  proxy_scan_action: ProxyScanAction;
}

/** Summary + paged list response. */
export interface ProxyScanListResponse extends ProxyScanEnforcement {
  repository_key: string;
  /** Omitted by the backend for a single-path read; null here. */
  summary: ProxyScanSummary | null;
  items: ProxyScanEntry[];
  /** Catalog paths matching the query (paths, not digests). */
  total: number;
  page: number;
  per_page: number;
}

/** Single-path response, flattened from the shared envelope. */
export interface ProxyScanPathResponse extends ProxyScanEnforcement {
  entry: ProxyScanEntry | null;
}

export interface ListProxyScansParams {
  page?: number;
  per_page?: number;
}
