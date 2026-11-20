import type { PaginatedResponse } from "@/types";

/** The backend clamps `per_page` to this, whatever a caller asks for. */
export const BACKEND_MAX_PAGE_SIZE = 100;

export interface AllPages<T> {
  items: T[];
  /** Total the server reports, which is larger than `items.length` when `truncated`. */
  total: number;
  /** True when `maxPages` stopped the walk before the last page. */
  truncated: boolean;
}

/**
 * Walk a paginated list page by page. The backend clamps `per_page` to 100, so
 * asking for 1000 silently returns 100 (#988 review): callers that need the
 * whole list, or need to filter it on the client, have to page. The walk is
 * capped so a very large instance cannot turn one screen into hundreds of
 * requests; `truncated` says when the cap was hit so the UI can say so instead
 * of presenting a partial list as the whole one.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
  { maxPages = 20 }: { maxPages?: number } = {},
): Promise<AllPages<T>> {
  const first = await fetchPage(1);
  const items = [...first.items];
  const totalPages = first.pagination?.total_pages ?? 1;
  const last = Math.min(totalPages, maxPages);
  for (let page = 2; page <= last; page += 1) {
    const next = await fetchPage(page);
    items.push(...next.items);
    if (next.items.length === 0) break;
  }
  return {
    items,
    total: first.pagination?.total ?? items.length,
    truncated: totalPages > last,
  };
}
