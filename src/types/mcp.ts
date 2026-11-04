/**
 * MCP Registry types (artifact-keeper#5253).
 *
 * Two families live here:
 *
 * 1. The registry wire shapes (`server.json` schema 2025-12-11 and the
 *    registry API v0.1 envelope) the backend serves on
 *    `/mcp/<repo>/v0.1/...`. These are the shapes the official registry and
 *    its clients (VS Code, Copilot, `mcp-publisher`) use, so field names are
 *    camelCase.
 * 2. Artifact Keeper's own admin/curation shapes for the later phases
 *    (curation reviews, upstream catalog, capability snapshots, health,
 *    namespace grants). Their endpoints live in `src/lib/api/mcp.ts`; every
 *    field a backend may not send yet is optional.
 *
 * Everything rendered from a server.json is publisher-controlled text: render
 * it as plain text, and only link URLs that pass `isSafeHttpUrl`.
 */

// ---------------------------------------------------------------------------
// server.json (publisher document)
// ---------------------------------------------------------------------------

/** `registryType` values the schema allows. */
export type McpRegistryType = 'npm' | 'pypi' | 'nuget' | 'oci' | 'mcpb' | 'cargo';

/** Transport of a package (`stdio` runs locally) or a remote. */
export type McpTransportType = 'stdio' | 'streamable-http' | 'sse';

/** The schema's Input / KeyValueInput / Positional- and NamedArgument. */
export interface McpInput {
  /** `positional` | `named` for arguments; absent for env vars/headers. */
  type?: string;
  name?: string;
  valueHint?: string;
  isRepeated?: boolean;
  description?: string;
  isRequired?: boolean;
  /** `string` | `number` | `boolean` | `filepath`. */
  format?: string;
  value?: string;
  isSecret?: boolean;
  default?: string;
  placeholder?: string;
  choices?: string[];
  variables?: Record<string, McpInput>;
}

export interface McpTransport {
  type: McpTransportType | string;
  url?: string;
  headers?: McpInput[];
  variables?: Record<string, McpInput>;
}

export interface McpPackage {
  registryType: McpRegistryType | string;
  registryBaseUrl?: string;
  identifier: string;
  version?: string;
  fileSha256?: string;
  runtimeHint?: string;
  transport: McpTransport;
  runtimeArguments?: McpInput[];
  packageArguments?: McpInput[];
  environmentVariables?: McpInput[];
  _meta?: Record<string, unknown>;
}

export interface McpRepositoryRef {
  url: string;
  source: string;
  id?: string;
  subfolder?: string;
}

export interface McpIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: string;
}

export interface McpServerJson {
  $schema?: string;
  name: string;
  description: string;
  title?: string;
  version: string;
  websiteUrl?: string;
  repository?: McpRepositoryRef;
  icons?: McpIcon[];
  packages?: McpPackage[];
  remotes?: McpTransport[];
  _meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Registry API v0.1 envelope
// ---------------------------------------------------------------------------

/** Closed upstream enum. A hold is never written here. */
export type McpServerStatus = 'active' | 'deprecated' | 'deleted';

/** `_meta["io.modelcontextprotocol.registry/official"]`. */
export interface McpOfficialMeta {
  status: McpServerStatus;
  statusMessage?: string | null;
  statusChangedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
}

/** `_meta["com.artifactkeeper.registry/source"]`. */
export interface McpAkSourceMeta {
  repository: string;
  artifactId?: string;
  sha256?: string;
  packagePolicy?: McpPackagePolicy;
  /**
   * Phase 2 (Remote): where the entry came from. `hosted` for a publish to
   * this instance, `upstream` for an entry proxied from the Remote's
   * upstream registry. Server-side enum, never a publisher field.
   */
  origin?: 'hosted' | 'upstream';
  /** Phase 2: whether the upstream registry reported the entry as official. */
  upstreamVerified?: boolean;
}

/** `packages[]._meta["com.artifactkeeper/resolved"]` (OCI pins). */
export interface McpResolvedMeta {
  submittedIdentifier?: string;
  digest?: string;
  mediaType?: string;
  children?: { platform: string; digest: string }[];
  backingRepository?: string;
  resolvedAt?: string;
}

/** One entry of `/servers` or `/versions`, or the exact-version answer. */
export interface McpServedEntry {
  server: McpServerJson;
  _meta?: Record<string, unknown>;
}

export interface McpServerList {
  servers: McpServedEntry[];
  metadata: { nextCursor?: string; count: number };
}

/** Meta keys the backend writes on served entries. */
export const MCP_OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official';
export const MCP_PUBLISHER_META_KEY = 'io.modelcontextprotocol.registry/publisher-provided';
export const MCP_AK_SOURCE_META_KEY = 'com.artifactkeeper.registry/source';
export const MCP_AK_RESOLVED_META_KEY = 'com.artifactkeeper/resolved';
/** Publisher-declared capabilities (decision 10, Phase 2). */
export const MCP_AK_CAPABILITIES_META_KEY = 'com.artifactkeeper/capabilities';

// ---------------------------------------------------------------------------
// Held versions (section 4.4)
// ---------------------------------------------------------------------------

/**
 * `hold` member of a reason-gated refusal, as `decide_mcp_serve` writes it:
 * the server.json's own hold (`quarantine`, `scan_policy`, `resolving`), a
 * pinned package (`backing`, `age_gate`, `unresolvable`), Phase 2 curation
 * (`curation`).
 */
export type McpHoldClass =
  | 'quarantine'
  | 'scan_policy'
  | 'resolving'
  | 'backing'
  | 'age_gate'
  | 'unresolvable'
  | 'curation';

/** The RFC 9457 body a repository holder gets for a held exact version. */
export interface McpHoldProblem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  /** AK machine code, e.g. `mcp_backing_artifact_blocked`. */
  error?: string;
  name?: string;
  version?: string;
  hold?: McpHoldClass | string;
  /** Package as submitted, e.g. `npm:@acme/db-tool@2.0.0`. */
  package?: string;
  /** `quarantine` | `scan_policy` | `age_gate` | `curation`. */
  gate?: string;
  review_id?: string | null;
  min_age_days?: number;
  requested_age_days?: number | null;
}

/**
 * Outcome of reading one exact version for the held-version panel.
 * `held` = a reason-gated body; `hidden` = the plain 404 (held, deleted or
 * missing; the caller cannot tell which, by design); `unavailable` = 503.
 */
export type McpVersionRead =
  | { kind: 'served'; entry: McpServedEntry }
  | { kind: 'held'; problem: McpHoldProblem }
  | { kind: 'hidden' }
  | { kind: 'unavailable'; problem?: McpHoldProblem };

// ---------------------------------------------------------------------------
// Stored artifact metadata (`GET /api/v1/artifacts/{id}/metadata`)
// ---------------------------------------------------------------------------

export interface McpPackagePin {
  index: number;
  registryType: string;
  submitted: { identifier: string; version?: string };
  resolved: {
    repository: string;
    repositoryId?: string;
    artifactIds?: string[];
    name?: string;
    tag?: string;
    digest?: string;
    mediaType?: string;
    children?: { platform: string; digest: string }[];
    gateDigest?: string;
    resolvedAt?: string;
    warnings?: string[];
  };
  /** Set when a pinned OCI tag later moved (`MCP_PIN_DRIFT_DETECTED`). */
  drift?: Record<string, unknown> | null;
}

export interface McpStoredMetadata {
  schema?: string;
  server: McpServerJson;
  registry: McpOfficialMeta;
  policy?: { package?: McpPackagePolicy };
  packages?: McpPackagePin[];
  index?: {
    namespace?: string;
    shortName?: string;
    packageTypes?: string[];
    remoteTypes?: string[];
  };
}

// ---------------------------------------------------------------------------
// Repository settings (section 3.3)
// ---------------------------------------------------------------------------

export type McpPackagePolicy = 'own-repos' | 'open';
export type McpRemotePosture = 'approval_required' | 'allow_with_gates';
export type McpOciFloatingTagPolicy = 'pin' | 'hide';
export type McpProbeRemotes = 'off' | 'hosted_only' | 'all';

/** registryType -> backing repository key. */
export type McpPackageRepos = Partial<Record<McpRegistryType, string>>;

/**
 * MCP fields on `RepositoryResponse` / create / update. Phase 1 fields are on
 * the backend today; the rest follow the issue's settings table and are
 * omitted by a backend that predates them.
 */
export interface McpRepositorySettings {
  /** Phase 1. Effective policy (`own-repos` when unset). */
  mcp_package_policy?: McpPackagePolicy;
  /** Phase 1. Backing repository per registryType. */
  mcp_package_repos?: McpPackageRepos;
  /** Phase 1. Namespace prefixes; `[]` admits any name. */
  mcp_namespace_allow?: string[];
  /** Phase 2. Deny globs on the full name; deny always wins. */
  mcp_server_deny?: string[];
  /** Phase 2. Remote posture (`approval_required` default). */
  mcp_remote_posture?: McpRemotePosture;
  /** Phase 2. True when an instance administrator locked the posture. */
  mcp_remote_posture_locked?: boolean;
  /** Phase 2. Namespace globs auto-approved on a Remote. */
  auto_approve_namespaces?: string[];
  /** Phase 2. Remote only: `pin` (default) or `hide` floating OCI tags. */
  mcp_oci_floating_tag_policy?: McpOciFloatingTagPolicy;
  /** Phase 2. Isolated remote `tools/list` probe (`off` default). */
  mcp_probe_remotes?: McpProbeRemotes;
  /** Phase 2. True when an instance administrator locked the probe setting. */
  mcp_probe_remotes_locked?: boolean;
  /** Phase 3. Publishing needs a namespace-conditioned grant. */
  mcp_require_namespace_grant?: boolean;
}

// ---------------------------------------------------------------------------
// Phase 2: curation (Remote approval queue) and upstream catalog
// ---------------------------------------------------------------------------

export type McpReviewStatus = 'pending' | 'approved' | 'blocked' | 'review';

/** A row of the MCP approval queue (curation_packages keyed by server name). */
export interface McpReview {
  id: string;
  repository_id?: string;
  /** Full server name. */
  name: string;
  /** `name@version` pin, or null for a name-level approval. */
  version?: string | null;
  status: McpReviewStatus | string;
  reason?: string | null;
  first_seen_at?: string;
  decided_at?: string | null;
  decided_by?: string | null;
  /** Latest upstream document, when the backend includes it. */
  server?: McpServerJson | null;
  /** Lint findings attached to the review (Phase 2 `mcp_lint`). */
  findings?: McpLintFinding[];
  /** Tool diff against the previously approved snapshot (Phase 3). */
  tool_diff?: McpToolDiff | null;
}

export interface McpLintFinding {
  rule: string;
  severity?: string;
  action?: 'block' | 'review' | string;
  message?: string;
  pointer?: string;
}

/** An entry of the upstream catalog browse (UI only, never on /v0.1). */
export interface McpUpstreamEntry {
  server: McpServerJson;
  _meta?: Record<string, unknown>;
  /** Curation state of the name in this Remote, `null` when never requested. */
  review_status?: McpReviewStatus | string | null;
  review_id?: string | null;
}

export interface McpUpstreamPage {
  servers: McpUpstreamEntry[];
  next_cursor?: string | null;
  /** Echoed by the backend when the upstream fetch failed (fail closed). */
  upstream_error?: string | null;
}

export interface McpBulkNamespaceResult {
  approved: number;
  /** Names the glob matched but deny globs refused. */
  denied?: number;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Phase 2/3: capability snapshots (decision 10)
// ---------------------------------------------------------------------------

export type McpCapabilitySource =
  | 'publisher_declared'
  | 'ci_reported'
  | 'gateway_reported'
  | 'remote_probe'
  | 'sandbox_run';

export type McpAuthState = 'none' | 'auth_required' | 'caller_specific';

export type McpSnapshotOutcome = 'ok' | 'timeout' | 'start_failed' | 'needs_config' | 'refused';

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: McpToolAnnotations;
}

export interface McpResource {
  uri?: string;
  uriTemplate?: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface McpCapabilitySnapshot {
  id?: string;
  source: McpCapabilitySource | string;
  signature_state?: 'none' | 'verified' | 'invalid';
  protocol_version?: string | null;
  observed_at?: string | null;
  auth_state?: McpAuthState | string | null;
  cache_scope?: string | null;
  outcome?: McpSnapshotOutcome | string | null;
  tools?: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
  instructions?: string | null;
  content_hash?: string | null;
  /** Lint findings over the tool objects. */
  findings?: McpLintFinding[];
}

export interface McpCapabilities {
  /** Whether the instance runs the introspection worker at all. */
  probe_available?: boolean;
  /** Current snapshot per source, newest first. */
  snapshots: McpCapabilitySnapshot[];
}

export interface McpToolDiff {
  added: string[];
  removed: string[];
  changed: { name: string; fields: string[] }[];
}

// ---------------------------------------------------------------------------
// Phase 3: health roll-up, namespace grants, MCPB bundles
// ---------------------------------------------------------------------------

export type McpHealthState = 'healthy' | 'warning' | 'held' | 'unknown';

/** Per-version health rolled up from the pinned packages' scan results. */
export interface McpHealth {
  state: McpHealthState | string;
  packages: {
    package: string;
    registry_type?: string;
    repository?: string | null;
    artifact_id?: string | null;
    scan_state?: string | null;
    max_severity?: string | null;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    gate?: string | null;
  }[];
  computed_at?: string;
}

/** A namespace-conditioned grant (`PermissionConditions.mcp_namespaces`). */
export interface McpNamespaceGrant {
  /** Underlying permission id. */
  id: string;
  repository_id: string;
  repository_key?: string;
  principal_type: 'user' | 'group' | 'service_account';
  principal_id: string;
  principal_name?: string;
  actions: string[];
  namespaces: string[];
  created_at?: string;
}

export interface McpBundle {
  name: string;
  version: string;
  file_name?: string;
  size_bytes?: number;
  sha256: string;
  signature_state?: 'none' | 'verified' | 'invalid' | string;
  /** Ticketed, short-lived download URL. */
  download_url?: string | null;
}
