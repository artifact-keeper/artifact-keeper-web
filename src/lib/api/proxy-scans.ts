import { z } from "zod";
import { apiFetch, narrowEnum } from "@/lib/api/fetch";
import {
  PROXY_SCAN_ACTIONS,
  PROXY_SCAN_REASONS,
  PROXY_SCAN_STATES,
  type ListProxyScansParams,
  type ProxyScanEntry,
  type ProxyScanListResponse,
  type ProxyScanPathResponse,
} from "@/types/proxy-scans";

/**
 * Client for the repository-scoped proxy scan verdict endpoint.
 *
 * Not in the generated SDK yet (backend 1.10.0, artifact-keeper#3394), so this
 * goes through `apiFetch` and validates at the trust boundary with zod — the
 * same pattern as `package-analysis.ts` and `blast-radius.ts`.
 *
 * `apiFetch` preserves the HTTP status on failure as `ApiError.status`, which
 * matters here: the panel must distinguish a 401 (anonymous viewer — "Sign in
 * to view scan status") from a 403 (signed in, no visibility) from a 404 (a
 * cache path this repository's catalog cannot resolve) from a transport
 * failure, and must never collapse any of them into "clean".
 *
 * Both reads share one envelope. The single-path form returns `items` with at
 * most one entry and omits `summary`.
 */

const FindingSchema = z
  .object({
    cve_id: z.string(),
    severity: z.string(),
    package_name: z.string().nullish(),
    package_version: z.string().nullish(),
    fixed_version: z.string().nullish(),
    title: z.string().nullish(),
  })
  .passthrough();

// Every count is `nullish`, never defaulted to 0: the backend suppresses them
// wholesale for a state with no verdict row, and turning that absence into a
// zero is precisely the false-clean this whole surface exists to remove.
const EntrySchema = z
  .object({
    path: z.string(),
    digest: z.string().nullish(),
    state: z.string(),
    not_scanned_reason: z.string().nullish(),
    findings_count: z.number().nullish(),
    critical_count: z.number().nullish(),
    high_count: z.number().nullish(),
    medium_count: z.number().nullish(),
    low_count: z.number().nullish(),
    max_severity: z.string().nullish(),
    scanned_at: z.string().nullish(),
    cached_at: z.string(),
    size_bytes: z.number().nullish(),
    findings: z.array(FindingSchema).nullish(),
  })
  .passthrough();

const SummarySchema = z
  .object({
    clean: z.number(),
    vulnerable: z.number(),
    not_scanned: z.number(),
    pending_ingest: z.number(),
    total_digests: z.number().nullish(),
  })
  .passthrough();

// `items` is required, not nullish: a backend that dropped the list would
// otherwise render as "nothing cached, nothing wrong". A drifted shape must
// surface as a parse error, which the panels present as a failure state.
const ResponseSchema = z
  .object({
    repository_key: z.string().nullish(),
    scan_on_proxy: z.boolean().nullish(),
    proxy_scan_action: z.string().nullish(),
    summary: SummarySchema.nullish(),
    items: z.array(EntrySchema),
    total: z.number().nullish(),
    page: z.number().nullish(),
    per_page: z.number().nullish(),
  })
  .passthrough();

function mapEntry(raw: z.infer<typeof EntrySchema>): ProxyScanEntry {
  // An unrecognized state narrows to `not_scanned`, never to `clean`:
  // whatever the backend meant by a value this build does not know, the UI
  // must not vouch for the content on the strength of it. `max_severity` and
  // the finding severities stay verbatim because they only drive styling.
  const state = narrowEnum(
    raw.state,
    PROXY_SCAN_STATES,
    "not_scanned",
    `Unknown proxy scan state "${raw.state}"; treating as not_scanned`,
  );
  return {
    path: raw.path,
    digest: raw.digest ?? null,
    state,
    // Same rule: an unrecognized reason becomes `unknown` (the bucket whose
    // copy promises nothing), not `scanning_disabled` (which explains it).
    not_scanned_reason:
      raw.not_scanned_reason == null
        ? null
        : narrowEnum(
            raw.not_scanned_reason,
            PROXY_SCAN_REASONS,
            "unknown",
            `Unknown proxy not_scanned reason "${raw.not_scanned_reason}"; treating as unknown`,
          ),
    findings_count: raw.findings_count ?? null,
    critical_count: raw.critical_count ?? null,
    high_count: raw.high_count ?? null,
    medium_count: raw.medium_count ?? null,
    low_count: raw.low_count ?? null,
    max_severity: raw.max_severity ?? null,
    scanned_at: raw.scanned_at ?? null,
    cached_at: raw.cached_at,
    size_bytes: raw.size_bytes ?? 0,
    // `undefined` (omitted — not requested at this granularity) collapses to
    // `null`; `[]` survives as `[]` and is the only value that renders as
    // "the scanner recorded no per-CVE detail for this digest".
    findings:
      raw.findings == null
        ? null
        : raw.findings.map((f) => ({
            cve_id: f.cve_id,
            severity: f.severity,
            package_name: f.package_name ?? null,
            package_version: f.package_version ?? null,
            fixed_version: f.fixed_version ?? null,
            title: f.title ?? null,
          })),
  };
}

/** Validate and normalize either form of the response. */
export function parseProxyScansResponse(
  raw: unknown,
  repoKey: string,
): ProxyScanListResponse {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Proxy scan response did not match the expected shape");
  }
  const d = parsed.data;
  const items = d.items.map(mapEntry);
  return {
    repository_key: d.repository_key ?? repoKey,
    // Absent enforcement context defaults to the *weaker* claim: scanning off
    // and fail-open, so the copy never implies a download was blocked.
    scan_on_proxy: d.scan_on_proxy === true,
    proxy_scan_action: narrowEnum(
      d.proxy_scan_action ?? "fail_open",
      PROXY_SCAN_ACTIONS,
      "fail_open",
    ),
    summary:
      d.summary == null
        ? null
        : {
            clean: d.summary.clean,
            vulnerable: d.summary.vulnerable,
            not_scanned: d.summary.not_scanned,
            pending_ingest: d.summary.pending_ingest,
            total_digests:
              d.summary.total_digests ??
              d.summary.clean + d.summary.vulnerable + d.summary.not_scanned,
          },
    items,
    total: d.total ?? items.length,
    page: d.page ?? 1,
    per_page: d.per_page ?? items.length,
  };
}

/**
 * Flatten a single-path read. The endpoint reuses the list envelope with at
 * most one item, so an empty `items` is a resolved "this repository has no
 * such catalog row" — rendered as unknown, never as clean.
 */
export function normalizePathResponse(
  raw: unknown,
  repoKey: string,
): ProxyScanPathResponse {
  const body = parseProxyScansResponse(raw, repoKey);
  return {
    scan_on_proxy: body.scan_on_proxy,
    proxy_scan_action: body.proxy_scan_action,
    entry: body.items[0] ?? null,
  };
}

function basePath(repoKey: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repoKey)}/security/proxy-scans`;
}

export const proxyScansApi = {
  /** Summary plus the paged list of cached paths for a repository. */
  async list(
    repoKey: string,
    params: ListProxyScansParams = {},
  ): Promise<ProxyScanListResponse> {
    const query = new URLSearchParams();
    if (params.page != null) query.set("page", String(params.page));
    if (params.per_page != null) query.set("per_page", String(params.per_page));
    const suffix = query.toString();
    const raw = await apiFetch<unknown>(
      suffix ? `${basePath(repoKey)}?${suffix}` : basePath(repoKey),
    );
    return parseProxyScansResponse(raw, repoKey);
  },

  /** Verdict for a single cache path within a repository. */
  async getByPath(
    repoKey: string,
    path: string,
  ): Promise<ProxyScanPathResponse> {
    const query = new URLSearchParams({ path });
    const raw = await apiFetch<unknown>(
      `${basePath(repoKey)}?${query.toString()}`,
    );
    return normalizePathResponse(raw, repoKey);
  },
};
