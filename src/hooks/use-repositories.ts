import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  repositoriesApi,
  type ListRepositoriesParams,
} from "@/lib/api/repositories";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { PaginatedResponse, Repository } from "@/types";

/**
 * Canonical key factory for repository-list queries (#669).
 *
 * Every repository-list variant lives under the single `["repositories"]`
 * prefix, param-scoped by the list params: pages that request the same
 * params share one cache entry, and prefix invalidation on
 * `QUERY_KEYS.REPOSITORIES` catches every variant — no more enumerating
 * per-page key strings in the invalidation registry.
 *
 * TanStack Query hashes object key segments deterministically (object keys
 * are sorted), so `useRepositories({ per_page: 1000 })` at different call
 * sites resolves to the same cache entry.
 */
export function repositoryListKey(params: ListRepositoriesParams = {}) {
  return [...QUERY_KEYS.REPOSITORIES, params] as const;
}

export interface UseRepositoriesOptions {
  /** Passed through to `useQuery`; defaults to `true` when omitted. */
  enabled?: boolean;
}

/**
 * Shared query for the repository list (`repositoriesApi.list`).
 *
 * Replaces the ad-hoc `["repositories-all"]` / `["admin-repositories"]` /
 * `["repositories-for-scan"]` / `["repositories-list"]` query declarations
 * that duplicated the same fetch under different cache keys (#669).
 */
export function useRepositories(
  params: ListRepositoriesParams = {},
  options?: UseRepositoriesOptions,
): UseQueryResult<PaginatedResponse<Repository>, Error> {
  return useQuery({
    queryKey: repositoryListKey(params),
    queryFn: () => repositoriesApi.list(params),
    enabled: options?.enabled,
  });
}
