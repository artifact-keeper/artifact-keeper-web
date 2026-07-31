import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";
import { narrowEnum } from "@/lib/api/fetch";

/**
 * Admin client for curation **rules** (v1.7.0, backend admin-guarded router).
 *
 * Where the curation *queue* (`@/lib/api/curation`) approves or blocks
 * individual packages after the fact, curation *rules* are the standing policy
 * the queue is evaluated against: pattern matches, publisher-trust gates, and
 * popularity / typo-squat heuristics. 1.7.0 added two new engine types
 * (`publisher_trust`, `popularity`) that a customer evaluation asked for and
 * that had no UI to author them.
 *
 * The rules endpoints are NOT in the generated SDK (a separate change is
 * bumping the SDK), so this module deliberately talks to the REST surface
 * through the shared `apiFetch` wrapper and validates responses with zod at the
 * trust boundary — the same pattern as `rate-limits`, `downloads`, and `audit`.
 * Keeping it SDK-free is intentional so it can't collide with the SDK bump.
 *
 * Endpoints (all under the admin-guarded curation router):
 *   GET    /api/v1/curation/rules        -> CurationRule[]
 *   POST   /api/v1/curation/rules        -> CurationRule
 *   GET    /api/v1/curation/rules/{id}   -> CurationRule
 *   PUT    /api/v1/curation/rules/{id}   -> CurationRule
 *   DELETE /api/v1/curation/rules/{id}
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Which matching engine the rule drives. */
export type RuleType = "pattern" | "publisher_trust" | "popularity";
export const RULE_TYPES: readonly RuleType[] = [
  "pattern",
  "publisher_trust",
  "popularity",
] as const;
const RULE_TYPE_SET = new Set<RuleType>(RULE_TYPES);

/** Whether the rule applies to one staging repo or every repo. */
export type RuleScope = "repository" | "global";
export const RULE_SCOPES: readonly RuleScope[] = ["repository", "global"] as const;
const RULE_SCOPE_SET = new Set<RuleScope>(RULE_SCOPES);

/**
 * Top-level rule action (the decision applied when the rule matches). Different
 * engines support different subsets, but the backend models one string column,
 * so the web keeps a single union and lets each sub-form present the relevant
 * options.
 */
export type RuleAction = "allow" | "block" | "flag" | "audit";
export const RULE_ACTIONS: readonly RuleAction[] = [
  "allow",
  "block",
  "flag",
  "audit",
] as const;

/** publisher_trust `match` strategy. */
export type PublisherMatch = "attestation" | "signature" | "namespace";
export const PUBLISHER_MATCHES: readonly PublisherMatch[] = [
  "attestation",
  "signature",
  "namespace",
] as const;

// ---------------------------------------------------------------------------
// Config shapes (engine-specific `config` JSON)
// ---------------------------------------------------------------------------

/** `publisher_trust` engine config. */
export interface PublisherTrustConfig {
  /** Publishers whose artifacts are trusted (required, non-empty). */
  trusted_publishers: string[];
  /** How trust is proven; backend default `attestation`. */
  match: string;
  /** Decision for artifacts from an untrusted publisher. */
  action: "flag" | "block" | "allow" | "audit";
}

/** `popularity` engine config (typo-squat / low-reputation heuristics). */
export interface PopularityConfig {
  /** Minimum download count for a package to be considered established. */
  min_downloads?: number;
  /** Max edit distance to a popular package that still counts as a squat (1–2). */
  max_distance?: number;
  /** Enable the typo-squat distance check. */
  typosquat_check?: boolean;
  /** Enable the homoglyph (look-alike character) check. */
  homoglyph_check?: boolean;
  /** Enable the affix (prefix/suffix padding) check. */
  affix_check?: boolean;
  /** Affix check ignores packages above this download count; backend default 1000. */
  affix_max_downloads?: number;
  /** Decision for a package flagged by any enabled heuristic. */
  action?: "flag" | "block";
  /** Optional explicit list of popular packages to compare against. */
  popular_packages?: string[];
}

export type RuleConfig =
  | PublisherTrustConfig
  | PopularityConfig
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Rule + request types
// ---------------------------------------------------------------------------

/** A stored curation rule. */
export interface CurationRule {
  id: string;
  /** Repo the rule is scoped to; null / undefined for global rules. */
  staging_repo_id?: string | null;
  /** Glob over package names (default `*`). */
  package_pattern: string;
  /** Version constraint / glob (default `*`). */
  version_constraint: string;
  /** Architecture glob (default `*`). */
  architecture: string;
  action: string;
  /** Lower runs first; backend default 100. */
  priority: number;
  reason?: string | null;
  rule_type: RuleType;
  config: Record<string, unknown>;
  scope: RuleScope;
  /** Whether the rule is active. Absent responses are treated as enabled. */
  enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Create body. Mirrors the backend `CreateRuleRequest`. */
export interface CreateRuleRequest {
  staging_repo_id?: string | null;
  package_pattern?: string;
  version_constraint?: string;
  architecture?: string;
  action: string;
  priority?: number;
  reason?: string;
  rule_type?: RuleType;
  config?: Record<string, unknown>;
  scope?: RuleScope;
  enabled?: boolean;
}

/** Update body — same shape; the backend PUT replaces the rule. */
export type UpdateRuleRequest = Partial<CreateRuleRequest>;

// ---------------------------------------------------------------------------
// Response validation (trust boundary)
// ---------------------------------------------------------------------------

const RuleSchema = z
  .object({
    id: z.string(),
    staging_repo_id: z.string().nullish(),
    package_pattern: z.string().nullish(),
    version_constraint: z.string().nullish(),
    architecture: z.string().nullish(),
    action: z.string().nullish(),
    priority: z.number().nullish(),
    reason: z.string().nullish(),
    rule_type: z.string().nullish(),
    config: z.record(z.string(), z.unknown()).nullish(),
    scope: z.string().nullish(),
    enabled: z.boolean().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .passthrough();

const RuleListSchema = z.union([
  z.array(RuleSchema),
  z.object({ rules: z.array(RuleSchema) }).passthrough(),
]);

type RawRule = z.infer<typeof RuleSchema>;

function adaptRule(r: RawRule): CurationRule {
  return {
    id: r.id,
    staging_repo_id: r.staging_repo_id ?? null,
    package_pattern: r.package_pattern ?? "*",
    version_constraint: r.version_constraint ?? "*",
    architecture: r.architecture ?? "*",
    action: r.action ?? "flag",
    priority: r.priority ?? 100,
    reason: r.reason ?? null,
    rule_type: narrowEnum(r.rule_type ?? "pattern", RULE_TYPE_SET, "pattern"),
    config: r.config ?? {},
    scope: narrowEnum(r.scope ?? "repository", RULE_SCOPE_SET, "repository"),
    // A rule with no explicit `enabled` flag is treated as active.
    enabled: r.enabled ?? true,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

export function parseRule(data: unknown): CurationRule {
  const parsed = RuleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Curation rule response did not match the expected shape");
  }
  return adaptRule(parsed.data);
}

export function parseRuleList(data: unknown): CurationRule[] {
  const parsed = RuleListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Curation rules response did not match the expected shape");
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.rules;
  return rows.map(adaptRule);
}

// ---------------------------------------------------------------------------
// Config builders (pure — used by the dialog sub-forms and unit-tested)
// ---------------------------------------------------------------------------

/**
 * Parse a free-form textarea of publishers / packages (comma- or
 * newline-separated) into a trimmed, de-duplicated, non-empty list.
 */
export function parseList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const v = raw.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Clamp the popularity edit-distance to the backend-supported 1–2 range. */
export function clampDistance(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 2;
  return Math.min(2, Math.max(1, Math.trunc(n)));
}

export const curationRulesApi = {
  list: async (): Promise<CurationRule[]> => {
    const data = await apiFetch<unknown>("/api/v1/curation/rules", {
      method: "GET",
    });
    return parseRuleList(data);
  },

  get: async (id: string): Promise<CurationRule> => {
    const data = await apiFetch<unknown>(
      `/api/v1/curation/rules/${encodeURIComponent(id)}`,
      { method: "GET" }
    );
    return parseRule(data);
  },

  create: async (req: CreateRuleRequest): Promise<CurationRule> => {
    const data = await apiFetch<unknown>("/api/v1/curation/rules", {
      method: "POST",
      body: JSON.stringify(req),
    });
    return parseRule(data);
  },

  update: async (id: string, req: UpdateRuleRequest): Promise<CurationRule> => {
    const data = await apiFetch<unknown>(
      `/api/v1/curation/rules/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(req) }
    );
    return parseRule(data);
  },

  remove: async (id: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/curation/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

export default curationRulesApi;
