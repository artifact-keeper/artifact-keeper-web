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
 * Top-level rule `action` column. The backend stores it under a
 * `CHECK (action IN ('allow', 'block'))` constraint (artifact-keeper
 * `backend/migrations/071_curation.sql`), so any other value fails the write
 * with a 500. Only `pattern` rules read it; `publisher_trust` and `popularity`
 * rules decide from `config.action` and ignore this column.
 */
export type RuleAction = "allow" | "block";
export const RULE_ACTIONS: readonly RuleAction[] = ["allow", "block"] as const;

/**
 * publisher_trust `config.match`: which publisher signal satisfies the trusted
 * list. The backend evaluator accepts exactly these two values
 * (`backend/src/services/curation/publisher_trust.rs`); anything else makes
 * the rule flag every applicable package as misconfigured.
 *
 * - `attestation` (backend default): only a publisher identity from a
 *   provenance attestation the server has cryptographically verified counts.
 * - `metadata` (artifact-keeper#4134): also accepts the self-asserted
 *   author/maintainer name the package declares, which anyone can forge.
 */
export type PublisherMatch = "attestation" | "metadata";
export const PUBLISHER_MATCHES: readonly PublisherMatch[] = [
  "attestation",
  "metadata",
] as const;
const PUBLISHER_MATCH_SET = new Set<PublisherMatch>(PUBLISHER_MATCHES);

/**
 * publisher_trust `config.action` (backend default `flag`). Unknown values make
 * the rule flag every applicable package as misconfigured.
 */
export type PublisherTrustAction = "allow" | "flag" | "block";
export const PUBLISHER_TRUST_ACTIONS: readonly PublisherTrustAction[] = [
  "block",
  "allow",
  "flag",
] as const;
const PUBLISHER_TRUST_ACTION_SET = new Set<PublisherTrustAction>(
  PUBLISHER_TRUST_ACTIONS,
);

/**
 * Package formats a publisher_trust rule evaluates (backend
 * `publisher_source::APPLICABLE_FORMATS`, plus the jupyter/poetry and yarn/pnpm
 * aliases). `conda_native` repositories evaluate as conda's publisher family
 * since artifact-keeper#4253. Every other format passes through the rule
 * untouched.
 */
export const PUBLISHER_TRUST_FORMATS = ["pypi", "npm", "conda", "conda_native"] as const;

/**
 * Shown with a publisher-trust rule whose stored values the backend does not
 * accept. Backend 1.11.0 (artifact-keeper#4248) rejects such values at write
 * time, so any rule like this was saved before that check existed.
 */
export const INVALID_RULE_NOTE =
  "Saved before the backend validated rule values; edit the rule to choose valid ones.";

// ---------------------------------------------------------------------------
// Config shapes (engine-specific `config` JSON)
// ---------------------------------------------------------------------------

/** `publisher_trust` engine config. */
export interface PublisherTrustConfig {
  /** Publishers whose artifacts are trusted (required, non-empty). */
  trusted_publishers: string[];
  /** Which publisher signal is sufficient; backend default `attestation`. */
  match: PublisherMatch;
  /** What the rule does with trusted / untrusted packages; backend default `flag`. */
  action: PublisherTrustAction;
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
// publisher_trust config reader
// ---------------------------------------------------------------------------

/**
 * A stored publisher_trust config as the backend evaluator will read it.
 * `match` / `action` are `"unknown"` when the stored value is one the backend
 * rejects; `raw_match` / `raw_action` keep that value verbatim so the UI can
 * show it instead of pretending the rule is valid.
 */
export interface PublisherTrustSettings {
  trusted_publishers: string[];
  match: PublisherMatch | "unknown";
  action: PublisherTrustAction | "unknown";
  raw_match: string;
  raw_action: string;
  /**
   * Why the backend treats the rule as misconfigured (it then flags every
   * applicable package for review). Empty when the config is valid.
   */
  problems: string[];
}

/**
 * Read a publisher_trust `config` the way the backend evaluator does: a
 * missing or non-string `match` / `action` takes the backend default
 * (`attestation` / `flag`), non-string and blank publisher entries are
 * dropped. An unrecognised value is kept, never coerced to a valid one.
 */
export function readPublisherTrust(
  config: Record<string, unknown> | null | undefined,
): PublisherTrustSettings {
  const c = config ?? {};
  const list = Array.isArray(c.trusted_publishers) ? c.trusted_publishers : [];
  const trusted_publishers = list
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  const raw_match = typeof c.match === "string" ? c.match : "attestation";
  const raw_action = typeof c.action === "string" ? c.action : "flag";
  const match = narrowEnum<PublisherMatch | "unknown">(
    raw_match,
    PUBLISHER_MATCH_SET,
    "unknown",
    `Unknown publisher_trust match mode "${raw_match}"; the backend flags every package for this rule`,
  );
  const action = narrowEnum<PublisherTrustAction | "unknown">(
    raw_action,
    PUBLISHER_TRUST_ACTION_SET,
    "unknown",
    `Unknown publisher_trust action "${raw_action}"; the backend flags every package for this rule`,
  );
  const problems: string[] = [];
  if (trusted_publishers.length === 0) problems.push("No trusted publishers");
  if (match === "unknown") problems.push(`Unknown match mode "${raw_match}"`);
  if (action === "unknown") problems.push(`Unknown action "${raw_action}"`);
  return { trusted_publishers, match, action, raw_match, raw_action, problems };
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

