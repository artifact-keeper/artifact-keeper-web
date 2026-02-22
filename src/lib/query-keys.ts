import type { QueryClient } from "@tanstack/react-query";

/**
 * Central registry of TanStack Query keys used across the app.
 * Single source of truth for cache invalidation - used by mutations,
 * the SSE event stream hook, and the global MutationCache handler.
 */

// ---------------------------------------------------------------------------
// Query key constants
// ---------------------------------------------------------------------------

export const QUERY_KEYS = {
  ADMIN_STATS: ["admin-stats"],
  RECENT_REPOS: ["recent-repositories"],
  REPOSITORIES: ["repositories"],
  REPOSITORIES_LIST: ["repositories-list"],
  REPOSITORIES_FOR_SCAN: ["repositories-for-scan"],
  REPOSITORIES_ALL: ["repositories-all"],
  QUALITY_HEALTH: ["quality-health-dashboard"],
  QUALITY_GATES: ["quality-gates"],
  ADMIN_USERS: ["admin-users"],
  ADMIN_GROUPS: ["admin-groups"],
  ADMIN_PERMISSIONS: ["admin-permissions"],
  SERVICE_ACCOUNTS: ["service-accounts"],
} as const;

// ---------------------------------------------------------------------------
// Invalidation groups - which keys to invalidate per domain
// ---------------------------------------------------------------------------

export const INVALIDATION_GROUPS: Record<string, readonly (readonly string[])[]> = {
  dashboard: [QUERY_KEYS.ADMIN_STATS, QUERY_KEYS.RECENT_REPOS],
  repositories: [
    QUERY_KEYS.REPOSITORIES,
    QUERY_KEYS.REPOSITORIES_LIST,
    QUERY_KEYS.REPOSITORIES_FOR_SCAN,
    QUERY_KEYS.REPOSITORIES_ALL,
    QUERY_KEYS.RECENT_REPOS,
    QUERY_KEYS.QUALITY_HEALTH,
  ],
  users: [QUERY_KEYS.ADMIN_USERS, QUERY_KEYS.ADMIN_GROUPS],
  groups: [QUERY_KEYS.ADMIN_GROUPS, QUERY_KEYS.ADMIN_PERMISSIONS],
  serviceAccounts: [QUERY_KEYS.SERVICE_ACCOUNTS],
  permissions: [QUERY_KEYS.ADMIN_PERMISSIONS],
  qualityGates: [QUERY_KEYS.QUALITY_GATES, QUERY_KEYS.QUALITY_HEALTH],
};

// ---------------------------------------------------------------------------
// SSE event type → invalidation group mapping
// ---------------------------------------------------------------------------

export const EVENT_TYPE_MAP: Record<string, string> = {
  "user.created": "users",
  "user.updated": "users",
  "user.deleted": "users",
  "group.created": "groups",
  "group.updated": "groups",
  "group.deleted": "groups",
  "group.member_added": "groups",
  "group.member_removed": "groups",
  "repository.created": "repositories",
  "repository.updated": "repositories",
  "repository.deleted": "repositories",
  "service_account.created": "serviceAccounts",
  "service_account.updated": "serviceAccounts",
  "service_account.deleted": "serviceAccounts",
  "permission.created": "permissions",
  "permission.updated": "permissions",
  "permission.deleted": "permissions",
  "quality_gate.created": "qualityGates",
  "quality_gate.updated": "qualityGates",
  "quality_gate.deleted": "qualityGates",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the query keys to invalidate for a given SSE event type. */
export function getKeysForEvent(
  eventType: string,
): readonly (readonly string[])[] {
  const group = EVENT_TYPE_MAP[eventType];
  if (!group) return [];
  return INVALIDATION_GROUPS[group] ?? [];
}

/** Invalidate all query keys in a named group. */
export function invalidateGroup(
  queryClient: QueryClient,
  groupName: string,
): void {
  const keys = INVALIDATION_GROUPS[groupName];
  if (!keys) return;
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: [...key] });
  }
}
