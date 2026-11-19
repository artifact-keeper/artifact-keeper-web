import type {
  Permission,
  PermissionAction,
  PermissionPrincipalType,
  PermissionTargetType,
} from "@/lib/api/permissions";

export interface PermissionFilters {
  principalType: PermissionPrincipalType | "";
  principal: string;
  targetType: PermissionTargetType | "";
  target: string;
  action: PermissionAction | "";
}

export const EMPTY_PERMISSION_FILTERS: PermissionFilters = {
  principalType: "",
  principal: "",
  targetType: "",
  target: "",
  action: "",
};

export const PRINCIPAL_TYPES: readonly PermissionPrincipalType[] = ["user", "group", "service_account"];
export const TARGET_TYPES: readonly PermissionTargetType[] = ["repository", "group", "artifact"];
export const ACTIONS: readonly PermissionAction[] = ["read", "write", "delete", "admin"];

// Query-string keys. Namespaced so they cannot collide with the MCP grants
// panel on the same page, which reads its own params.
const KEYS = {
  principalType: "principal_type",
  principal: "principal",
  targetType: "target_type",
  target: "target",
  action: "action",
} as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/** Read filters from a query string. Unknown enum values are dropped, not trusted. */
export function filtersFromSearch(search: string): PermissionFilters {
  const params = new URLSearchParams(search);
  return {
    principalType: oneOf(params.get(KEYS.principalType), PRINCIPAL_TYPES),
    principal: params.get(KEYS.principal) ?? "",
    targetType: oneOf(params.get(KEYS.targetType), TARGET_TYPES),
    target: params.get(KEYS.target) ?? "",
    action: oneOf(params.get(KEYS.action), ACTIONS),
  };
}

/**
 * Merge filters into an existing query string, touching only our own keys so
 * unrelated params (such as the MCP grants panel's) survive. Empty filters
 * are removed rather than written as `key=`.
 */
export function filtersToSearch(filters: PermissionFilters, existing = ""): string {
  const params = new URLSearchParams(existing);
  for (const [field, key] of Object.entries(KEYS) as [keyof PermissionFilters, string][]) {
    const value = filters[field].trim();
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

export function hasActiveFilters(filters: PermissionFilters): boolean {
  return Object.values(filters).some((v) => v.trim() !== "");
}

interface Labels {
  principalLabel: (p: Permission) => string;
  targetLabel: (p: Permission) => string;
}

const contains = (haystacks: string[], needle: string) =>
  haystacks.some((h) => h.toLowerCase().includes(needle));

/** All filters combine with AND. Text matches the display name or the id. */
export function filterPermissions(
  items: readonly Permission[],
  filters: PermissionFilters,
  { principalLabel, targetLabel }: Labels,
): Permission[] {
  const principal = filters.principal.trim().toLowerCase();
  const target = filters.target.trim().toLowerCase();
  return items.filter(
    (p) =>
      (!filters.principalType || p.principal_type === filters.principalType) &&
      (!filters.targetType || p.target_type === filters.targetType) &&
      (!filters.action || p.actions.includes(filters.action)) &&
      (!principal || contains([principalLabel(p), p.principal_id], principal)) &&
      (!target || contains([targetLabel(p), p.target_id], target)),
  );
}
