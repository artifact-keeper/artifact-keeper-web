import { useQuery } from "@tanstack/react-query";
import { repositoriesApi } from "@/lib/api/repositories";
import { upstreamModeKey } from "@/lib/upstream-mode";
import type { Repository } from "@/types";

// The mode changes only through the settings toggle, which updates the cache
// itself, or through the instance environment, which needs a restart.
const STALE_TIME_MS = 60_000;

/**
 * Upstream mode of one repository (#1094). Only a Remote has one, so nothing
 * is fetched for any other type. `data` is `null` when the backend cannot
 * report it (older backend), and the caller hides the mode.
 */
export function useUpstreamMode(
  repository: Pick<Repository, "key" | "repo_type"> | null | undefined,
) {
  const isRemote = repository?.repo_type === "remote";
  const key = repository?.key ?? "";
  return useQuery({
    queryKey: upstreamModeKey(key),
    queryFn: () => repositoriesApi.getUpstreamMode(key),
    enabled: isRemote,
    staleTime: STALE_TIME_MS,
    // `null` (no support) is an answer, not a failure; a real error is not
    // worth retrying for a badge.
    retry: false,
  });
}
