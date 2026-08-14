import { apiFetch } from "@/lib/api/fetch";
import type {
  ListProxyScansParams,
  ProxyScanEntry,
  ProxyScanListResponse,
  ProxyScanPathResponse,
} from "@/types/proxy-scans";

/**
 * Client for the repository-scoped proxy scan verdict endpoint.
 *
 * Not part of the generated SDK, so this goes through `apiFetch`, which
 * preserves the HTTP status on failure as `ApiError.status`. That matters: the
 * panel must distinguish a 401 (anonymous viewer — "Sign in to view scan
 * status") from a 404 (a cache path this repository's catalog cannot resolve)
 * from a transport failure, and must never collapse any of them into "clean".
 */

function basePath(repoKey: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repoKey)}/security/proxy-scans`;
}

/**
 * Normalize the single-path response.
 *
 * The endpoint is documented as returning "one cached path", which leaves the
 * envelope shape open: it may return the entry inline, or reuse the list
 * envelope with a single item. Accept both so the panel is not coupled to that
 * choice, and treat an empty result as unresolved rather than as clean.
 */
export function normalizePathResponse(
  raw: unknown,
): ProxyScanPathResponse {
  const body = (raw ?? {}) as Partial<ProxyScanListResponse> &
    Partial<ProxyScanPathResponse> & { items?: ProxyScanEntry[] };

  const enforcement = {
    scan_on_proxy: body.scan_on_proxy === true,
    proxy_scan_action:
      body.proxy_scan_action === "fail_closed"
        ? ("fail_closed" as const)
        : ("fail_open" as const),
  };

  if (body.entry != null) return { ...enforcement, entry: body.entry };
  const first = Array.isArray(body.items) ? body.items[0] : undefined;
  return { ...enforcement, entry: first ?? null };
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
    return apiFetch<ProxyScanListResponse>(
      suffix ? `${basePath(repoKey)}?${suffix}` : basePath(repoKey),
    );
  },

  /** Verdict for a single cache path within a repository. */
  async getByPath(repoKey: string, path: string): Promise<ProxyScanPathResponse> {
    const query = new URLSearchParams({ path });
    const raw = await apiFetch<unknown>(`${basePath(repoKey)}?${query.toString()}`);
    return normalizePathResponse(raw);
  },
};
