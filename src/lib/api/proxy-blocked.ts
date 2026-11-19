import { z } from "zod";

import { apiFetch } from "@/lib/api/fetch";
import type {
  ListProxyBlockedParams,
  ProxyBlockedItem,
  ProxyBlockedResponse,
} from "@/types/proxy-blocked";

/**
 * Client for `GET /api/v1/security/proxy-blocked` (backend artifact-keeper#4777,
 * `would_block` from #5232).
 *
 * Not in the generated SDK yet, so this goes through `apiFetch` and validates at
 * the trust boundary with zod, like `proxy-scans.ts`. The route takes an instance
 * administrator with an unrestricted credential, and `apiFetch` keeps the 403 so
 * the page can say so.
 */

const ItemSchema = z
  .object({
    repository_id: z.string(),
    repository_key: z.string(),
    repository_format: z.string(),
    path: z.string(),
    name: z.string(),
    checksum_sha256: z.string(),
    max_severity: z.string().nullish(),
    findings_count: z.number(),
    critical_count: z.number(),
    high_count: z.number(),
    medium_count: z.number(),
    low_count: z.number(),
    cve_ids: z.array(z.string()).nullish(),
    scanned_at: z.string(),
    proxy_scan_action: z.string().nullish(),
  })
  .passthrough();

// Required once present: a partial summary must fail rather than read as zero
// files waiting on a scan.
const SummarySchema = z
  .object({
    would_block_digests: z.number(),
    no_verdict: z.number(),
    stale_verdict: z.number(),
    clean_graded_nothing: z.number(),
  })
  .passthrough();

// `items` is required: a backend that dropped the list must read as a failure,
// not as "nothing is blocked".
const ResponseSchema = z
  .object({
    items: z.array(ItemSchema),
    pagination: z
      .object({
        page: z.number(),
        per_page: z.number(),
        total: z.number(),
        total_pages: z.number(),
      })
      .passthrough(),
    would_block_summary: SummarySchema.nullish(),
  })
  .passthrough();

function mapItem(raw: z.infer<typeof ItemSchema>): ProxyBlockedItem {
  return {
    repository_id: raw.repository_id,
    repository_key: raw.repository_key,
    repository_format: raw.repository_format,
    path: raw.path,
    name: raw.name,
    checksum_sha256: raw.checksum_sha256,
    max_severity: raw.max_severity ?? null,
    findings_count: raw.findings_count,
    critical_count: raw.critical_count,
    high_count: raw.high_count,
    medium_count: raw.medium_count,
    low_count: raw.low_count,
    cve_ids: raw.cve_ids ?? [],
    scanned_at: raw.scanned_at,
    proxy_scan_action: raw.proxy_scan_action ?? null,
  };
}

export const proxyBlockedApi = {
  list: async (params: ListProxyBlockedParams = {}): Promise<ProxyBlockedResponse> => {
    const query = new URLSearchParams();
    if (params.repository) query.set("repository", params.repository);
    if (params.min_severity) query.set("min_severity", params.min_severity);
    if (params.would_block) query.set("would_block", "true");
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.per_page !== undefined) query.set("per_page", String(params.per_page));
    const qs = query.toString();
    const suffix = qs ? `?${qs}` : "";
    const raw = await apiFetch<unknown>(`/api/v1/security/proxy-blocked${suffix}`);
    const parsed = ResponseSchema.parse(raw);
    return {
      items: parsed.items.map(mapItem),
      pagination: {
        page: parsed.pagination.page,
        per_page: parsed.pagination.per_page,
        total: parsed.pagination.total,
        total_pages: parsed.pagination.total_pages,
      },
      would_block_summary: parsed.would_block_summary
        ? {
            would_block_digests: parsed.would_block_summary.would_block_digests,
            no_verdict: parsed.would_block_summary.no_verdict,
            stale_verdict: parsed.would_block_summary.stale_verdict,
            clean_graded_nothing: parsed.would_block_summary.clean_graded_nothing,
          }
        : null,
    };
  },
};
