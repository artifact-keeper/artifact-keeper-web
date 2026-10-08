/**
 * Scan-policy predicate document (`scan_policies.predicates`, backend
 * artifact-keeper#4058 / #4127, origin block #4050). Since #4165 the
 * predicates are enforced on promotion as rule `policy-predicate` at high
 * severity, across repository and global policies, and an unknown conda
 * channel fails closed.
 *
 * Not in the generated SDK yet: read off the policy response at runtime and
 * sent as a whole document (the backend replaces the stored document on
 * update; omitting it leaves the stored one untouched).
 */

export interface CondaPolicyPredicates {
  allowed_channels: string[];
  denied_channels: string[];
  denied_licenses: string[];
  denied_license_families: string[];
  block_install_scripts: boolean;
  /** `info` / `low` / `medium` / `high`, or null for no grading. */
  max_install_script_severity: string | null;
  /** `present` / `verified`, or null for no attestation requirement. */
  min_attestation_state: string | null;
}

export interface OriginPolicyPredicates {
  allowed_upstreams: string[];
  denied_upstreams: string[];
  allowed_repositories: string[];
  denied_repositories: string[];
  /** Subset of `hosted`, `proxy`, `virtual`, `migration`. */
  allowed_kinds: string[];
}

export interface PolicyPredicates {
  conda: CondaPolicyPredicates;
  origin: OriginPolicyPredicates;
}

export const ORIGIN_KINDS = ["hosted", "proxy", "virtual", "migration"] as const;
export const INSTALL_SCRIPT_SEVERITIES = ["info", "low", "medium", "high"] as const;
export const ATTESTATION_STATES = ["present", "verified"] as const;

export function emptyPredicates(): PolicyPredicates {
  return {
    conda: {
      allowed_channels: [],
      denied_channels: [],
      denied_licenses: [],
      denied_license_families: [],
      block_install_scripts: false,
      max_install_script_severity: null,
      min_attestation_state: null,
    },
    origin: {
      allowed_upstreams: [],
      denied_upstreams: [],
      allowed_repositories: [],
      denied_repositories: [],
      allowed_kinds: [],
    },
  };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null ? (v as Obj) : {});
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Adapt the response's `predicates`. Returns undefined when the backend sent
 * none (a backend that predates #4058), so the editor knows not to send a
 * document the server would not understand.
 */
export function adaptPredicates(raw: unknown): PolicyPredicates | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = obj(raw);
  const c = obj(r.conda);
  const o = obj(r.origin);
  return {
    conda: {
      allowed_channels: strings(c.allowed_channels),
      denied_channels: strings(c.denied_channels),
      denied_licenses: strings(c.denied_licenses),
      denied_license_families: strings(c.denied_license_families),
      block_install_scripts: c.block_install_scripts === true,
      max_install_script_severity: strOrNull(c.max_install_script_severity),
      min_attestation_state: strOrNull(c.min_attestation_state),
    },
    origin: {
      allowed_upstreams: strings(o.allowed_upstreams),
      denied_upstreams: strings(o.denied_upstreams),
      allowed_repositories: strings(o.allowed_repositories),
      denied_repositories: strings(o.denied_repositories),
      allowed_kinds: strings(o.allowed_kinds),
    },
  };
}

/** True when no predicate is configured (evaluation is a no-op). */
export function isInert(p: PolicyPredicates | undefined): boolean {
  if (!p) return true;
  return countPredicates(p) === 0;
}

/** Number of configured predicates, for the policy list summary. */
export function countPredicates(p: PolicyPredicates): number {
  const c = p.conda;
  const o = p.origin;
  return (
    [
      c.allowed_channels,
      c.denied_channels,
      c.denied_licenses,
      c.denied_license_families,
      o.allowed_upstreams,
      o.denied_upstreams,
      o.allowed_repositories,
      o.denied_repositories,
      o.allowed_kinds,
    ].filter((l) => l.length > 0).length +
    (c.block_install_scripts ? 1 : 0) +
    (c.max_install_script_severity ? 1 : 0) +
    (c.min_attestation_state ? 1 : 0)
  );
}

/** Split a comma- or newline-separated list, trimming and dropping blanks. */
export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function formatList(values: string[]): string {
  return values.join(", ");
}
