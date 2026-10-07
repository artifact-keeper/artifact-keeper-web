import type { QueryClient } from "@tanstack/react-query";

/**
 * Every query the Replication dashboard renders from: the peer list, each
 * peer's subscriptions (Subscriptions tab) and each peer's connections
 * (Topology tab). The header's refresh button must re-read all of them;
 * refreshing only `["peers"]` left the Subscriptions tab showing what it
 * loaded first (#841).
 */
export const REPLICATION_QUERY_ROOTS = [
  ["peers"],
  ["peer-repos"],
  ["peer-connections"],
] as const;

export function refreshReplicationDashboard(queryClient: Pick<QueryClient, "invalidateQueries">) {
  return Promise.all(
    REPLICATION_QUERY_ROOTS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] }),
    ),
  );
}
