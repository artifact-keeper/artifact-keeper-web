/**
 * Types for the cross-repository proxy-blocked list.
 *
 * ```
 * GET /api/v1/security/proxy-blocked                  → what is refused now
 * GET /api/v1/security/proxy-blocked?would_block=true → what enforcing would refuse
 * ```
 *
 * Shapes mirror `ProxyBlockedResponse` in backend `api/handlers/security.rs`
 * (artifact-keeper#4777, #5232).
 */

export interface ProxyBlockedItem {
  repository_id: string;
  repository_key: string;
  repository_format: string;
  /** Cached logical path; `sha256:<digest>` for an OCI image manifest. */
  path: string;
  name: string;
  checksum_sha256: string;
  /** Null for a verdict with no recorded severity, which every gate blocks. */
  max_severity: string | null;
  findings_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  /** Most severe first, at most 20. Empty for a verdict with no per-CVE detail. */
  cve_ids: string[];
  scanned_at: string;
  /** The repository's current action. Only in a `would_block` preview. */
  proxy_scan_action: string | null;
}

/**
 * What a `would_block` preview adds to the list, in distinct digests. Only
 * `would_block_digests` is a count of what would be refused. The other three are
 * files with no usable verdict, which `fail_closed` scans on the next pull rather
 * than refuses. They come from the catalog, so they are upper bounds: a file the
 * format serves without gating it is counted too.
 */
export interface ProxyWouldBlockSummary {
  would_block_digests: number;
  no_verdict: number;
  stale_verdict: number;
  clean_graded_nothing: number;
}

export interface ProxyBlockedResponse {
  items: ProxyBlockedItem[];
  pagination: {
    page: number;
    per_page: number;
    /** Paths, not digests. */
    total: number;
    total_pages: number;
  };
  /** Set only with `would_block`. */
  would_block_summary: ProxyWouldBlockSummary | null;
}

export interface ListProxyBlockedParams {
  /** Repository key. */
  repository?: string;
  min_severity?: string;
  would_block?: boolean;
  page?: number;
  per_page?: number;
}
