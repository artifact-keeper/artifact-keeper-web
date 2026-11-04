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
 * 2. Artifact Keeper's own shapes (Remote catalog and approval queue,
 *    capability snapshots, health, bundles, namespace grants), as
 *    docs/mcp-registry.md in artifact-keeper documents them. Their endpoints
 *    live in `src/lib/api/mcp.ts`.
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
   * Where the version comes from. `hosted` for a publish to this instance,
   * `remote` for one a Remote ingested in `mcp_remote_mode: allowlist`,
   * `mirror` for one ingested in `mirror` mode. Server-side enum, never a
   * publisher field.
   */
  origin?: McpOrigin;
  /**
   * `true` only for an ingested version whose upstream is the official
   * registry or another Artifact Keeper, whose content matched at ingest and
   * has not drifted since. Always `false` for a hosted version.
   */
  upstreamVerified?: boolean;
  /** `upstream` on ingested versions only. */
  kind?: 'upstream';
  /** The Remote's `upstream_url`, on ingested versions only. */
  upstreamUrl?: string;
  /** Set when a Virtual served the entry; `repository` is then the member. */
  virtualRepository?: string;
}

/** `_meta["com.artifactkeeper.registry/source"].origin`. */
export type McpOrigin = 'hosted' | 'remote' | 'mirror';

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
 * (`curation`), a Remote server version whose upstream document changed after
 * approval (`content_drift`, gate `curation`).
 */
export type McpHoldClass =
  | 'quarantine'
  | 'scan_policy'
  | 'resolving'
  | 'backing'
  | 'age_gate'
  | 'unresolvable'
  | 'curation'
  | 'content_drift';

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
  /** `quarantine` | `scan_policy` | `age_gate` | `curation` (also for `content_drift`). */
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
  /** One entry per pinned MCPB bundle. */
  bundles?: McpBundle[];
  /** Present while (or after) packages are filled into a Remote backing repository. */
  resolution?: McpResolution;
}

/** `metadata.bundles[]`: an MCPB bundle a version pins. */
export interface McpBundle {
  /** Index of the `packages[]` entry it backs. */
  index: number;
  artifactId?: string;
  file?: string;
  fileSha256: string;
  size?: number;
  signature?: {
    state: 'valid' | 'unsigned' | 'invalid' | string;
    signer?: string;
    issuer?: string;
    fingerprint?: string;
    selfSigned?: boolean;
    signedAt?: string;
  };
  /** `null` for a bundle from a Generic repository (no upload facts). */
  manifest?: Record<string, unknown> | null;
}

/** `metadata.resolution`: the fill of packages missing from a Remote backing repository. */
export interface McpResolution {
  state: 'resolving' | 'resolved' | 'failed' | string;
  pending?: {
    index: number;
    registryType: string;
    identifier: string;
    version?: string;
    fillRepository?: string;
  }[];
  attempts?: number;
  lastError?: string | null;
  requestedAt?: string;
  resolvedAt?: string;
  failedAt?: string;
  error?: { error: string; detail?: string; index?: number } | null;
}

// ---------------------------------------------------------------------------
// Repository settings (section 3.3)
// ---------------------------------------------------------------------------

export type McpPackagePolicy = 'own-repos' | 'open';
export type McpRemotePosture = 'approval_required' | 'allow_with_gates';
export type McpOciFloatingTagPolicy = 'pin' | 'hide';
export type McpProbeRemotes = 'off' | 'hosted_only' | 'all';
export type McpRemoteMode = 'allowlist' | 'mirror';
export type McpSandboxIntrospection = 'off' | 'on';

/** registryType -> backing repository key. */
export type McpPackageRepos = Partial<Record<McpRegistryType, string>>;

/**
 * MCP fields on `RepositoryResponse` / create / update. Phase 1 fields are on
 * the backend today; the rest follow the backend's settings table
 * (docs/mcp-registry.md, "Repository settings (Phase 2 and 3)") and are
 * omitted by a backend that predates them. The response echoes each later
 * setting with its default filled in, and omits one that does not apply to
 * the repository type; a request carrying such a setting is refused (400).
 */
export interface McpRepositorySettings {
  /** Phase 1. Effective policy (`own-repos` when unset). */
  mcp_package_policy?: McpPackagePolicy;
  /** Phase 1. Backing repository per registryType. */
  mcp_package_repos?: McpPackageRepos;
  /** Phase 1. Namespace prefixes; `[]` admits any name. */
  mcp_namespace_allow?: string[];
  /** Every type. Deny globs on the full name; deny always wins. */
  mcp_server_deny?: string[];
  /** Remote. Posture (`approval_required` default). */
  mcp_remote_posture?: McpRemotePosture;
  /** Remote. Instance-administrator lock on the posture (only they may write it). */
  mcp_remote_posture_locked?: boolean;
  /** Remote. Namespace globs approved automatically on sync. */
  mcp_auto_approve_namespaces?: string[];
  /** Remote. `pin` (default) or `hide` floating OCI tags. */
  mcp_oci_floating_tag_policy?: McpOciFloatingTagPolicy;
  /** Remote. `allowlist` (default) ingests approved names; `mirror` every name. */
  mcp_remote_mode?: McpRemoteMode;
  /** Local, Staging, Remote. Isolated remote `tools/list` probe (`off` default). */
  mcp_probe_remotes?: McpProbeRemotes;
  /** Local, Staging, Remote. Instance-administrator lock on the probe setting. */
  mcp_probe_remotes_locked?: boolean;
  /** Every type. Refuse OCI packages whose image lacks the MCP name label. */
  mcp_require_oci_label?: boolean;
  /** Local, Staging, Remote. Publishing needs a namespace-conditioned grant. */
  mcp_require_namespace_grant?: boolean;
  /** Local, Staging, Remote. Sandboxed stdio introspection (`off` default). */
  mcp_sandbox_introspection?: McpSandboxIntrospection;
  /** Local, Staging, Remote. Refuse unsigned MCPB bundles. */
  mcp_require_bundle_signature?: boolean;
  /**
   * Response only (`POST`, `GET`, `PATCH` of one MCP repository; not on the
   * list): `true` when the caller is an instance administrator, the only
   * role that may set or clear a `*_locked` setting or change a locked one.
   */
  mcp_caller_can_lock?: boolean;
}

// ---------------------------------------------------------------------------
// Remote management API (`/api/v1/repositories/{key}/mcp/...`): catalog,
// approval queue, pins, bulk approval, sync. JSON is camelCase.
// ---------------------------------------------------------------------------

export type McpCatalogStatus = 'pending' | 'approved' | 'blocked' | 'review';

/** `{storedSha256, upstreamSha256, detectedAt}`: upstream bytes changed under an ingested version. */
export interface McpContentDrift {
  storedSha256?: string;
  upstreamSha256?: string;
  detectedAt?: string;
}

/** A `name@version` row of a catalog item (a pin, or a re-queued drifted version). */
export interface McpCatalogPin {
  id: string;
  version: string;
  status: McpCatalogStatus | string;
  contentDrift: McpContentDrift | null;
  evaluationReason: string | null;
}

/** One ingested version (an artifact of the Remote). */
export interface McpCatalogVersion {
  version: string;
  /** The server.json artifact (capabilities diff, health). */
  artifactId: string;
  upstreamStatus: McpServerStatus | string;
  /** Packages the sync could not pin; the version is hidden until it can. */
  unresolved: { index: number; error: string; detail?: string }[];
}

/** One upstream server name of a Remote's catalog. */
export interface McpCatalogItem {
  /** `curation_packages` id of the name row. */
  id: string;
  name: string;
  namespace: string;
  status: McpCatalogStatus | string;
  /** Matches `mcp_server_deny`: never served, whatever `status`. */
  denied: boolean;
  title: string | null;
  description: string | null;
  latestVersion: string | null;
  /** Newest first, at most 200. */
  versions: string[];
  upstreamStatus: McpServerStatus | string | null;
  upstreamUpdatedAt: string | null;
  flags: { typosquat?: { similarTo: string } } & Record<string, unknown>;
  approvalRequests: {
    count?: number;
    lastRequestedAt?: string;
    lastRequestedBy?: string;
    lastNote?: string;
  };
  evaluationReason: string | null;
  evaluatedAt: string | null;
  evaluatedBy: string | null;
  firstSeenAt: string;
  pins: McpCatalogPin[];
  ingested: McpCatalogVersion[];
}

export interface McpCatalogPage {
  items: McpCatalogItem[];
  nextCursor: string | null;
  /** Name rows per status in the whole repository. */
  counts: Partial<Record<McpCatalogStatus, number>>;
}

export interface McpCatalogQuery {
  /** Case-insensitive substring of the name. */
  search?: string;
  status?: McpCatalogStatus;
  /** Exact namespace (the part before `/`). */
  namespace?: string;
  /** Only names someone requested approval for. */
  requested?: boolean;
  /** The approval queue: names, or one of their versions, awaiting a decision. */
  queue?: boolean;
  cursor?: string;
  /** Default 50, max 200. */
  limit?: number;
}

export type McpCatalogDecision = 'approve' | 'block' | 'reopen';

export interface McpDecisionResult {
  item: McpCatalogItem;
  /** Set when the approval stands but upstream could not be reached; the next sync ingests it. */
  ingestError: string | null;
}

export interface McpBulkApproveResult {
  approved: number;
  /** The first 100 approved names. */
  names: string[];
  /** Matching names left alone because they match `mcp_server_deny`. */
  skippedDenied: number;
  /** Matching flagged (`review`) names left alone without `includeReview`. */
  skippedReview: number;
}

export interface McpSyncSummary {
  pages: number;
  entries: number;
  namesNew: number;
  autoApproved: number;
  flagged: number;
  ingested: number;
  unchanged: number;
  statusChanged: number;
  drifted: number;
  invalid: number;
  unresolved: number;
  reResolved: number;
  backfilledNames: number;
  complete: boolean;
  errors: string[];
}

export interface McpSyncState {
  updatedSince: string | null;
  resumeCursor: string | null;
  resumeSince: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
  lastSummary: McpSyncSummary | null;
}

/** `GET /v0.1/x/com.artifactkeeper/holds`, one page. */
export interface McpHoldsPage {
  holds: McpHoldProblem[];
  nextCursor?: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Capability snapshots (`/mcp/<repo>/v0.1/servers/{name}/versions/{v}/capabilities`)
// ---------------------------------------------------------------------------

export type McpCapabilitySource =
  | 'publisher_declared'
  | 'ci_reported'
  | 'gateway_reported'
  | 'remote_probe'
  | 'sandbox_run';

export type McpAuthState = 'none' | 'auth_required' | 'caller_specific' | 'unknown';

export type McpSnapshotOutcome =
  | 'ok'
  | 'auth_required'
  | 'rate_limited'
  | 'timeout'
  | 'start_failed'
  | 'needs_config'
  | 'refused'
  | 'unsupported'
  | 'error';

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

/**
 * A snapshot. `snapshots[]` entries are summaries (no lists); `current` and
 * an answer for `?snapshot=<id>` carry `tools`, `resources`, `prompts` and
 * `instructions`.
 */
export interface McpCapabilitySnapshot {
  id: string;
  source: McpCapabilitySource | string;
  /** Display label set by AK, e.g. "observed by remote probe". */
  provenance?: string;
  /** `remote:0`, `package:1`, `mcpb:<sha256>`, ... */
  origin?: string | null;
  observed?: boolean;
  authState?: McpAuthState | string | null;
  outcome?: McpSnapshotOutcome | string | null;
  protocolVersion?: string | null;
  observedAt?: string | null;
  ttlMs?: number | null;
  cacheScope?: 'public' | 'private' | string | null;
  counts?: { tools: number; resources: number; prompts: number };
  toolsHash?: string | null;
  contentHash?: string | null;
  workerVersion?: string | null;
  reportedBy?: string | null;
  details?: Record<string, unknown> | null;
  createdAt?: string;
  tools?: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
  instructions?: string | null;
}

export interface McpIntrospectionJob {
  id: string;
  kind: 'remote_probe' | 'sandbox_run' | string;
  target: string;
  status: 'pending' | 'claimed' | 'completed' | 'failed' | 'cancelled' | string;
  attempts?: number;
  maxAttempts?: number;
  lastError?: string | null;
  snapshotId?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface McpCapabilities {
  repository: string;
  server: string;
  version: string;
  artifactId: string;
  /** Newest successful snapshot of the best source; `null` when none. */
  current: McpCapabilitySnapshot | null;
  /** Summaries, newest first (failed attempts included). */
  snapshots: McpCapabilitySnapshot[];
  introspection: {
    remoteProbe: McpProbeRemotes | string;
    probeEnabled: boolean;
    sandbox: McpSandboxIntrospection | string;
    sandboxEnabled: boolean;
    /** Repository holders only. */
    jobs?: McpIntrospectionJob[];
  };
  notice: string;
}

// ---------------------------------------------------------------------------
// Server health (`/api/v1/repositories/{key}/mcp/servers/{name}/versions/{v}/health`)
// ---------------------------------------------------------------------------

export type McpHealthStatus = 'ok' | 'warning' | 'critical' | 'unknown';

/** `allowed` is the only gate that does not hold the version. */
export type McpHealthGate = 'allowed' | 'quarantine' | 'scan_policy' | 'age_gate' | 'unresolvable' | 'unavailable';

export interface McpHealthPackage {
  index: number;
  /** `npm:@acme/x@1.0.0`, as refusals name it. */
  package: string;
  registryType: string;
  repository: string;
  scanned: boolean;
  score: number | null;
  grade: string | null;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  gate: McpHealthGate | string;
  status: McpHealthStatus | string;
}

export interface McpLintFinding {
  /** The finding id the acknowledgement API takes. */
  id: string;
  rule: string;
  action: 'block' | 'review' | 'warn' | string;
  severity?: string;
  /** `server_json`, `status_message` or `capabilities:<source>`. */
  source?: string;
  path?: string;
  message?: string;
  acknowledged?: boolean;
}

export interface McpLintSummary {
  ran: boolean;
  scanId?: string | null;
  lintedAt?: string | null;
  block: number;
  review: number;
  warn: number;
  findings: McpLintFinding[];
}

export interface McpHealth {
  name: string;
  version: string;
  artifactId: string;
  status: McpHealthStatus | string;
  packagePolicy: McpPackagePolicy | string;
  packages: McpHealthPackage[];
  lint: McpLintSummary;
}

// ---------------------------------------------------------------------------
// Namespace grants: permission rules with `conditions.mcp_namespaces`
// ---------------------------------------------------------------------------

export type McpGrantPrincipalType = 'user' | 'group' | 'service_account';

/** A `/api/v1/permissions` rule on an MCP repository that carries `conditions.mcp_namespaces`. */
export interface McpNamespaceGrant {
  /** The permission rule id. */
  id: string;
  /** The repository id (`target_id`). */
  repository_id: string;
  principal_type: McpGrantPrincipalType;
  principal_id: string;
  principal_name?: string;
  actions: string[];
  namespaces: string[];
  created_at?: string;
}

/** One side of a diff list: `key` is the tool/prompt name or the resource uri. */
export interface McpDiffList<T> {
  added: { key: string; item: T }[];
  removed: { key: string; item: T }[];
  changed: { key: string; fields: string[]; before: T; after: T }[];
  unchanged: number;
}

interface McpDiffCounts {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

/** `GET .../capabilities/diff`. */
export interface McpCapabilityDiff {
  /** `null` (and everything `added`) when there is no baseline. */
  from: McpCapabilitySnapshot | null;
  to: McpCapabilitySnapshot;
  fromVersion: string | null;
  toVersion: string;
  summary: {
    /** e.g. "Tools: +1 added, 1 changed (`delete_repo` now destructiveHint: true)". */
    text: string;
    tools: McpDiffCounts;
    resources: McpDiffCounts;
    prompts: McpDiffCounts;
    instructionsChanged: boolean;
    destructiveAdded: string[];
    identical: boolean;
  };
  tools: McpDiffList<McpTool>;
  resources: McpDiffList<McpResource>;
  prompts: McpDiffList<McpPrompt>;
  instructionsChanged: boolean;
  notice: string;
}
