import { useMemo } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  repositoriesApi,
  type ListRepositoriesParams,
} from "@/lib/api/repositories";
import { QUERY_KEYS } from "@/lib/query-keys";
import { BACKEND_MAX_PAGE_SIZE, fetchAllPages } from "@/lib/fetch-all-pages";
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
  /**
   * Keep showing the previous result while the next page or search loads,
   * so a table or picker does not flash empty between requests.
   */
  keepPreviousData?: boolean;
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
    placeholderData: options?.keepPreviousData ? keepPreviousData : undefined,
  });
}

/** Page size of the walk behind "No project"; the backend clamps to 100. */
const UNASSIGNED_SCAN_MAX_PAGES = 20;

export interface UnassignedRepositories {
  data: PaginatedResponse<Repository> | undefined;
  /** More repositories exist than were scanned; the list is a partial answer. */
  truncated: boolean;
  scanned: number;
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => unknown;
}

/**
 * Repositories that belong to no project, one page at a time.
 *
 * The backend can only filter *to* a project (`project=<id>`); there is no
 * "none". So this walks the (filtered) list 100 at a time, which is the most
 * the backend returns per request, drops the assigned ones, and pages the rest
 * locally. The walk is capped at 20 pages (2000 repositories): beyond that the
 * answer is partial and `truncated` says so rather than presenting it as the
 * whole list. A backend `project=none` filter would replace all of this.
 */
export function useUnassignedRepositories(
  params: Omit<ListRepositoriesParams, "project" | "page" | "per_page">,
  page: number,
  pageSize: number,
  options?: { enabled?: boolean },
): UnassignedRepositories {
  const query = useQuery({
    queryKey: [...QUERY_KEYS.REPOSITORIES, "unassigned", params] as const,
    queryFn: async () => {
      const all = await fetchAllPages(
        (p) => repositoriesApi.list({ ...params, page: p, per_page: BACKEND_MAX_PAGE_SIZE }),
        { maxPages: UNASSIGNED_SCAN_MAX_PAGES },
      );
      return {
        items: all.items.filter((r) => !r.project_id),
        scanned: all.items.length,
        total: all.total,
        truncated: all.truncated,
      };
    },
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });

  const result = query.data;
  const data = useMemo<PaginatedResponse<Repository> | undefined>(() => {
    if (!result) return undefined;
    const totalItems = result.items.length;
    const start = (page - 1) * pageSize;
    return {
      items: result.items.slice(start, start + pageSize),
      pagination: {
        page,
        per_page: pageSize,
        total: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }, [result, page, pageSize]);

  return {
    data,
    truncated: result?.truncated ?? false,
    scanned: result?.scanned ?? 0,
    total: result?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
