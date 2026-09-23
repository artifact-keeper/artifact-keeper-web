export interface LifecyclePolicy {
  id: string;
  repository_id: string | null;
  applies_to_all: boolean;
  repository_ids: string[];
  /** Local adapter marker; legacy projections are for display, not assignment. */
  scope_source: "explicit" | "legacy";
  name: string;
  description: string | null;
  enabled: boolean;
  policy_type: string;
  config: Record<string, unknown>;
  priority: number;
  last_run_at: string | null;
  last_run_items_removed: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLifecyclePolicyRequest {
  applies_to_all: boolean;
  repository_ids: string[];
  name: string;
  description?: string | null;
  policy_type: string;
  config: Record<string, unknown>;
  priority?: number;
}

export interface UpdateLifecyclePolicyRequest {
  applies_to_all?: boolean;
  repository_ids?: string[];
  name?: string;
  description?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  priority?: number;
}

export interface PolicyExecutionResult {
  policy_id: string;
  policy_name: string;
  dry_run: boolean;
  artifacts_matched: number;
  artifacts_removed: number;
  /**
   * Bytes held by the matched artifacts — what a run *would* reclaim, and the
   * only size figure a dry run can report (`bytes_freed` is legitimately 0
   * there). `null` when the backend predates the field (backend 1.10.0,
   * artifact-keeper#2024) so callers can omit the figure instead of showing a
   * fabricated 0.
   */
  bytes_matched: number | null;
  bytes_freed: number;
  errors: string[];
}

/**
 * A policy's "never delete these" list, carried inside `config.exclude`
 * (backend 1.10.0, artifact-keeper#2024). Both fields select on the
 * artifact's version, which is the tag for OCI/Docker formats — so one
 * editor covers "keep the `latest` tag" and "keep release 1.4.2".
 *
 * Accepted by every policy type. The backend treats an absent `exclude`
 * block and empty lists identically, so the form omits empty lists.
 */
export interface PolicyExclusions {
  /** Exact versions/tags that are never deleted. */
  versions: string[];
  /** Regexes matched against the version; a match protects the artifact. */
  version_patterns: string[];
}

export interface ListPoliciesQuery {
  repository_id?: string;
}

export type PolicyType =
  | "max_age_days"
  | "max_versions"
  | "no_downloads_days"
  | "tag_pattern_keep"
  | "tag_pattern_delete"
  | "size_quota_bytes";

export function lifecycleScopeLabel(policy: LifecyclePolicy): string {
  if (policy.applies_to_all) return "Global - all current and future repositories";
  const count = policy.repository_ids.length;
  return count === 0
    ? "Unassigned - no effect"
    : `Selected - ${count} ${count === 1 ? "repository" : "repositories"}`;
}

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  max_age_days: "Max Age (Days)",
  max_versions: "Max Versions",
  no_downloads_days: "No Downloads (Days)",
  tag_pattern_keep: "Keep by Tag Pattern",
  tag_pattern_delete: "Delete by Tag Pattern",
  size_quota_bytes: "Size Quota",
};
