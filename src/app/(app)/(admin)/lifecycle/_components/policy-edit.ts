import type {
  LifecyclePolicy,
  PolicyExclusions,
  UpdateLifecyclePolicyRequest,
} from "@/types/lifecycle";
import { withExclusions } from "@/lib/api/lifecycle";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Split a stored policy `config` into what the edit form shows as raw JSON
 * and what it shows in the exclusions editor.
 *
 * The `exclude` block moves to the editor only when it is exactly the shape
 * the editor can represent (`versions` and/or `version_patterns` string
 * lists). Anything else stays in the JSON untouched, so opening and saving a
 * policy never silently drops a block the editor could not show.
 *
 * Moving `exclude` out of the JSON is what lets removing the last exclusion
 * actually remove it: `withExclusions` leaves the config untouched when both
 * lists are empty, and the config sent on save no longer carries the old
 * block (the backend replaces `config` whole, it does not merge).
 */
export function splitPolicyConfig(config: Record<string, unknown>): {
  config: Record<string, unknown>;
  exclusions: PolicyExclusions;
} {
  const empty: PolicyExclusions = { versions: [], version_patterns: [] };
  const exclude = config.exclude;
  if (typeof exclude !== "object" || exclude === null || Array.isArray(exclude)) {
    return { config, exclusions: empty };
  }
  const block = exclude as Record<string, unknown>;
  const keys = Object.keys(block);
  const representable =
    keys.every((k) => k === "versions" || k === "version_patterns") &&
    (block.versions === undefined || isStringArray(block.versions)) &&
    (block.version_patterns === undefined || isStringArray(block.version_patterns));
  if (!representable) return { config, exclusions: empty };

  const { exclude: _moved, ...rest } = config;
  void _moved;
  return {
    config: rest,
    exclusions: {
      versions: (block.versions as string[] | undefined) ?? [],
      version_patterns: (block.version_patterns as string[] | undefined) ?? [],
    },
  };
}

/** Key-order independent JSON form, for comparing configs structurally. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

export function configsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export interface PolicyEditDraft {
  name: string;
  description: string;
  /** Full config to store, exclusions already merged in. */
  config: Record<string, unknown>;
  cronSchedule: string;
  appliesToAll: boolean;
}

/**
 * Build a PATCH body holding only the fields the operator changed.
 *
 * The backend keeps every omitted field, so sending less is both the
 * minimal write and the safe one: a rename does not re-send `config` (which
 * would re-run the inert-on-remote check against every assignment) and does
 * not touch scope (which would require assignment support and rewrite the
 * assignments). `enabled` is owned by the row toggle and never sent here.
 *
 * Scope is only ever switched between global and not-global from this form:
 * turning global on sends `repository_ids: []` (the backend refuses a global
 * policy with explicit assignments), and turning it off leaves the policy
 * unassigned, to be attached from a repository's Settings.
 */
export function buildPolicyUpdate(
  policy: LifecyclePolicy,
  draft: PolicyEditDraft
): UpdateLifecyclePolicyRequest {
  const req: UpdateLifecyclePolicyRequest = {};
  const name = draft.name.trim();
  if (name !== policy.name.trim()) req.name = name;
  if (draft.description !== (policy.description ?? "")) {
    req.description = draft.description;
  }
  // Also compare against the stored config as the form itself would produce
  // it: the split/merge round trip drops empty `exclude` lists, and counting
  // that as a change would make a plain rename re-send `config`, which
  // re-runs the backend's per-assignment checks and can refuse the rename.
  const stored = splitPolicyConfig(policy.config);
  const normalized = withExclusions(stored.config, stored.exclusions);
  if (
    !configsEqual(draft.config, policy.config) &&
    !configsEqual(draft.config, normalized)
  ) {
    req.config = draft.config;
  }
  const cron = draft.cronSchedule.trim();
  if (cron && cron !== (policy.cron_schedule ?? "")) req.cron_schedule = cron;
  if (draft.appliesToAll !== policy.applies_to_all) {
    req.applies_to_all = draft.appliesToAll;
    req.repository_ids = [];
  }
  return req;
}
