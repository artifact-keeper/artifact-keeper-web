import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  formatHandlersApi,
  type FormatHandler,
} from "@/lib/api/format-handlers";

/**
 * Shared query key for the format-handler list. Exported so the admin
 * format-handlers page and repository surfaces share one cache entry.
 * (Defined here rather than in `lib/query-keys.ts` so consumers that mock
 * that module do not see an undefined key.)
 */
export const FORMAT_HANDLERS_QUERY_KEY = ["format-handlers"] as const;

/**
 * Installed package-format handlers (built-in `Core` and WASM plugins).
 *
 * The backend mounts `GET /api/v1/formats` behind optional auth, so this is
 * safe for non-admin users — e.g. the repository create dialog listing
 * selectable WASM plugin layouts (#591).
 */
export function useFormatHandlers(): UseQueryResult<FormatHandler[], Error> {
  return useQuery({
    queryKey: FORMAT_HANDLERS_QUERY_KEY,
    queryFn: () => formatHandlersApi.list(),
    staleTime: 60_000,
  });
}

/**
 * Enabled WASM plugin handlers — the custom layouts a user may select when
 * creating a repository. Disabled plugins are excluded: the backend rejects
 * repository creation against a disabled handler.
 */
export function wasmPluginFormats(
  handlers: FormatHandler[] | undefined | null,
): FormatHandler[] {
  return (handlers ?? []).filter(
    (h) => h.handler_type === "Wasm" && h.is_enabled,
  );
}
