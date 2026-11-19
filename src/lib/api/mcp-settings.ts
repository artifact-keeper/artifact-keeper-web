import type {
  McpOciFloatingTagPolicy,
  McpPackagePolicy,
  McpPackageRepos,
  McpProbeRemotes,
  McpRemoteMode,
  McpRemotePosture,
  McpRepositorySettings,
  McpSandboxIntrospection,
} from '@/types/mcp';

/**
 * MCP registry settings on the repository API (artifact-keeper#5253,
 * section 3.3). The generated SDK does not declare any of them, so they are
 * read defensively off the response and appended to create/update bodies.
 *
 * A backend that predates a field omits it, and the reader yields
 * `undefined`, which the settings UI treats as "not supported by this
 * server" rather than as a value. Unknown enum values are dropped for the
 * same reason: sending back a value the UI could not render would be a
 * silent rewrite.
 */

const PACKAGE_POLICIES: ReadonlySet<McpPackagePolicy> = new Set(['own-repos', 'open']);
const POSTURES: ReadonlySet<McpRemotePosture> = new Set(['approval_required', 'allow_with_gates']);
const FLOATING: ReadonlySet<McpOciFloatingTagPolicy> = new Set(['pin', 'hide']);
const PROBE: ReadonlySet<McpProbeRemotes> = new Set(['off', 'hosted_only', 'all']);
const REMOTE_MODES: ReadonlySet<McpRemoteMode> = new Set(['allowlist', 'mirror']);
const SANDBOX: ReadonlySet<McpSandboxIntrospection> = new Set(['off', 'on']);

function oneOf<T extends string>(v: unknown, allowed: ReadonlySet<T>): T | undefined {
  return typeof v === 'string' && allowed.has(v as T) ? (v as T) : undefined;
}

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string');
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function repoMap(v: unknown): McpPackageRepos | undefined {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.length > 0) out[k] = val;
  }
  return out as McpPackageRepos;
}

/** Pick the MCP settings off a raw `RepositoryResponse`. */
export function readMcpSettings(raw: unknown): McpRepositorySettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: McpRepositorySettings = {
    mcp_package_policy: oneOf(r.mcp_package_policy, PACKAGE_POLICIES),
    mcp_package_repos: repoMap(r.mcp_package_repos),
    mcp_namespace_allow: stringList(r.mcp_namespace_allow),
    mcp_server_deny: stringList(r.mcp_server_deny),
    mcp_remote_posture: oneOf(r.mcp_remote_posture, POSTURES),
    mcp_remote_posture_locked: bool(r.mcp_remote_posture_locked),
    mcp_auto_approve_namespaces: stringList(r.mcp_auto_approve_namespaces),
    mcp_oci_floating_tag_policy: oneOf(r.mcp_oci_floating_tag_policy, FLOATING),
    mcp_remote_mode: oneOf(r.mcp_remote_mode, REMOTE_MODES),
    mcp_probe_remotes: oneOf(r.mcp_probe_remotes, PROBE),
    mcp_probe_remotes_locked: bool(r.mcp_probe_remotes_locked),
    mcp_require_oci_label: bool(r.mcp_require_oci_label),
    mcp_require_namespace_grant: bool(r.mcp_require_namespace_grant),
    mcp_sandbox_introspection: oneOf(r.mcp_sandbox_introspection, SANDBOX),
    mcp_require_bundle_signature: bool(r.mcp_require_bundle_signature),
    mcp_caller_can_lock: bool(r.mcp_caller_can_lock),
    mcp_caller_is_repo_admin: bool(r.mcp_caller_is_repo_admin),
  };
  // Drop absent keys so a non-MCP repository object stays unchanged in shape.
  for (const k of Object.keys(out) as (keyof McpRepositorySettings)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

const WRITABLE_KEYS = [
  'mcp_package_policy',
  'mcp_package_repos',
  'mcp_namespace_allow',
  'mcp_server_deny',
  'mcp_remote_posture',
  'mcp_remote_posture_locked',
  'mcp_auto_approve_namespaces',
  'mcp_oci_floating_tag_policy',
  'mcp_remote_mode',
  'mcp_probe_remotes',
  'mcp_probe_remotes_locked',
  'mcp_require_oci_label',
  'mcp_require_namespace_grant',
  'mcp_sandbox_introspection',
  'mcp_require_bundle_signature',
] as const satisfies readonly (keyof McpRepositorySettings)[];

/**
 * The MCP fields of a create/update input, for the request body. Only keys
 * the caller set are sent: the backend rejects fields it does not know, and
 * an omitted field means "leave unchanged" on update. The `*_locked` flags
 * are writable by an instance administrator only (403 for anyone else); the
 * settings UI puts them in an input only for an instance administrator who
 * changed them.
 */
export function mcpSettingsBody(input: McpRepositorySettings): Partial<McpRepositorySettings> {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE_KEYS) {
    if (input[k] !== undefined) out[k] = input[k];
  }
  return out as Partial<McpRepositorySettings>;
}

/** The settings whose globs are over the full server name. */
export type McpNameGlobKey = 'mcp_server_deny' | 'mcp_auto_approve_namespaces';

const NAME_GLOB_KEYS: readonly McpNameGlobKey[] = ['mcp_server_deny', 'mcp_auto_approve_namespaces'];

/** A save refusal that belongs to one glob setting. */
export interface McpGlobSaveError {
  key: McpNameGlobKey;
  /** `422`: a bare namespace (matches no name); `400`: any other bad pattern or too many. */
  status: 400 | 422;
  message: string;
}

function field(o: unknown, k: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
}

/**
 * The refusal of a repository save that names `mcp_server_deny` or
 * `mcp_auto_approve_namespaces`, so the form can show it on that field. The
 * backend answers `422 UNPROCESSABLE_ENTITY` for a bare namespace and
 * `400 VALIDATION_ERROR` for other bad syntax; either message starts with the
 * setting's key. `null` for any other error.
 */
export function mcpGlobSaveError(err: unknown): McpGlobSaveError | null {
  const body = field(err, 'body') ?? err;
  const message = [field(body, 'message'), field(err, 'message'), field(body, 'error')].find(
    (m): m is string => typeof m === 'string' && m.trim() !== '',
  );
  if (!message) return null;
  const key = NAME_GLOB_KEYS.find((k) => new RegExp(`^${k}\\b`).test(message.trim()));
  if (!key) return null;
  const rawStatus = [field(err, 'status'), field(body, 'status')].find((v): v is number => typeof v === 'number');
  const code = field(body, 'code') ?? field(err, 'code');
  const status = rawStatus === 422 || code === 'UNPROCESSABLE_ENTITY' ? 422 : rawStatus === 400 || code === 'VALIDATION_ERROR' ? 400 : null;
  if (status === null) return null;
  return { key, status, message: message.trim() };
}
