import { apiFetch, ApiError } from '@/lib/api/fetch';
import { artifactsApi } from '@/lib/api/artifacts';
import { MCP_API_VERSION, MCP_ROUTE_PREFIX, mcpArtifactPath } from '@/lib/mcp/format';
import { parseServedEntry, parseServerList, parseStoredMetadata } from '@/lib/mcp/server-json';
import type {
  McpBulkDecideResult,
  McpBulkResult,
  McpCapabilities,
  McpCapabilityDiff,
  McpCatalogDecision,
  McpCatalogItem,
  McpCatalogPage,
  McpCatalogQuery,
  McpDecisionResult,
  McpGrantPrincipalType,
  McpHealth,
  McpHoldProblem,
  McpHoldsPage,
  McpNamespaceGrant,
  McpPendingSummary,
  McpServedEntry,
  McpServerJson,
  McpServerStatus,
  McpStoredMetadata,
  McpSyncAccepted,
  McpSyncState,
  McpVersionRead,
} from '@/types/mcp';

/**
 * Every MCP Registry call the UI makes (artifact-keeper#5253), in one module
 * so a contract change is a change here.
 *
 * Every path, body and field follows artifact-keeper's docs/mcp-registry.md:
 * the registry API v0.1 (`/mcp/<repo>/v0.1`, proxied by `src/middleware.ts`)
 * for reads, writes, holds, capabilities and bundles; the Remote management
 * API (`/api/v1/repositories/{key}/mcp/catalog|sync`) for the approval
 * queue; `/api/v1/repositories/{key}/mcp/servers/.../health` for the health
 * roll-up; and ordinary permission rules (`/api/v1/permissions` with
 * `conditions.mcp_namespaces`) for namespace grants. A backend that predates
 * one of them answers 404/405/501, which every reader below maps to `null`
 * ("not available on this server") so the surface hides instead of erroring.
 *
 * Server names have exactly one `/` (`com.acme/weather`). The registry
 * accepts it literally or as `%2F`; the literal spelling is used because
 * some reverse proxies decode `%2F` before routing.
 */

/** `com.acme/weather` -> `com.acme/weather` with each segment escaped. */
export function encodeServerName(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

function registryBase(repoKey: string): string {
  return `${MCP_ROUTE_PREFIX}/${encodeURIComponent(repoKey)}/${MCP_API_VERSION}`;
}

function serverPath(repoKey: string, name: string): string {
  return `${registryBase(repoKey)}/servers/${encodeServerName(name)}`;
}

function versionPath(repoKey: string, name: string, version: string): string {
  return `${serverPath(repoKey, name)}/versions/${encodeURIComponent(version)}`;
}

/** The Remote management API of one repository. */
function remoteBase(repoKey: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp`;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Whether an error means "this server does not serve that endpoint". */
export function isNotSupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501);
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (isNotSupported(err)) return null;
    throw err;
  }
}

function parseProblem(body: string): McpHoldProblem | null {
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === 'object' ? (v as McpHoldProblem) : null;
  } catch {
    return null;
  }
}

/**
 * The registry's refusal text for a write (publish / status), from its
 * `application/problem+json` body: `detail`, else `title`.
 */
export function mcpProblemMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const p = parseProblem(err.body);
  if (!p) return null;
  return p.detail || p.title || null;
}

/**
 * Plain text for a refused version write (status change or soft delete) the
 * caller can act on: `401` (credential not accepted), `403
 * mcp_namespace_not_granted` (the repository requires a namespace grant for
 * writes and the caller holds none for this server's namespace) and any other
 * `403` (no repository write). `null` for every other answer, which
 * `mcpProblemMessage` reads instead.
 */
export function mcpWriteRefusal(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 401) return 'Your sign-in was not accepted. Sign in again and retry.';
  if (err.status !== 403) return null;
  const p = parseProblem(err.body);
  if (p?.error === 'mcp_namespace_not_granted') {
    const why = p.detail ? ` (${p.detail})` : '';
    return (
      "This repository requires a namespace grant for writes, and you hold none for this server's namespace" +
      `${why}. Ask an administrator for a namespace grant.`
    );
  }
  return 'You need write access to this repository to change or delete a version.';
}

export interface ListServersParams {
  cursor?: string;
  limit?: number;
  /** At least 3 characters; shorter searches are not sent (the registry 422s). */
  search?: string;
  /** `latest` or an exact version. */
  version?: string;
  include_deleted?: boolean;
  updated_since?: string;
}

export interface ServerListPage {
  servers: McpServedEntry[];
  nextCursor?: string;
  count: number;
  /** Entries the UI could not parse and left out. */
  dropped: number;
}

export const MCP_SEARCH_MIN_CHARS = 3;

export const mcpApi = {
  // -------------------------------------------------------------------------
  // Phase 1: registry API v0.1
  // -------------------------------------------------------------------------

  /** `GET /servers`: one page of servable versions. Held versions are omitted. */
  listServers: async (repoKey: string, params: ListServersParams = {}): Promise<ServerListPage> => {
    const search =
      params.search && params.search.trim().length >= MCP_SEARCH_MIN_CHARS ? params.search.trim() : undefined;
    const raw = await apiFetch<unknown>(
      `${registryBase(repoKey)}/servers${query({
        cursor: params.cursor,
        limit: params.limit,
        search,
        version: params.version,
        include_deleted: params.include_deleted,
        updated_since: params.updated_since,
      })}`,
    );
    return parseServerList(raw);
  },

  /** `GET /servers/{name}/versions`: every servable version (404 -> none). */
  listVersions: async (repoKey: string, name: string): Promise<McpServedEntry[]> => {
    try {
      const raw = await apiFetch<unknown>(`${serverPath(repoKey, name)}/versions`);
      return parseServerList(raw).servers;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return [];
      throw err;
    }
  },

  /**
   * `GET /servers/{name}/versions/{version}`, classified for the held-version
   * panel: a repository holder gets the reason (`held`); everyone else gets
   * the plain 404, byte-identical to an unknown name (`hidden`).
   */
  getVersion: async (
    repoKey: string,
    name: string,
    version: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<McpVersionRead> => {
    try {
      const raw = await apiFetch<unknown>(
        `${serverPath(repoKey, name)}/versions/${encodeURIComponent(version)}${query({
          include_deleted: opts.includeDeleted,
        })}`,
      );
      const entry = parseServedEntry(raw);
      return entry ? { kind: 'served', entry } : { kind: 'hidden' };
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      const problem = parseProblem(err.body) ?? undefined;
      if (err.status === 503) return { kind: 'unavailable', problem };
      if (err.status === 404) {
        return problem?.error ? { kind: 'held', problem } : { kind: 'hidden' };
      }
      throw err;
    }
  },

  /** `POST /publish` (hosted repositories, `write`). */
  publish: async (repoKey: string, server: McpServerJson): Promise<McpServedEntry> => {
    const raw = await apiFetch<unknown>(`${registryBase(repoKey)}/publish`, {
      method: 'POST',
      body: JSON.stringify(server),
    });
    const entry = parseServedEntry(raw);
    if (!entry) throw new Error('Publish answered with an unrecognised document');
    return entry;
  },

  /** `PATCH /servers/{name}/versions/{version}/status`. */
  setVersionStatus: async (
    repoKey: string,
    name: string,
    version: string,
    status: McpServerStatus,
    statusMessage?: string,
  ): Promise<void> => {
    await apiFetch<unknown>(`${serverPath(repoKey, name)}/versions/${encodeURIComponent(version)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(statusMessage ? { status, statusMessage } : { status }),
    });
  },

  /** `PATCH /servers/{name}/status`: every version at once. */
  setServerStatus: async (
    repoKey: string,
    name: string,
    status: McpServerStatus,
    statusMessage?: string,
  ): Promise<{ updatedCount: number }> => {
    const raw = await apiFetch<{ updatedCount?: number }>(`${serverPath(repoKey, name)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(statusMessage ? { status, statusMessage } : { status }),
    });
    return { updatedCount: raw?.updatedCount ?? 0 };
  },

  /**
   * The stored metadata document of a version (pins, registry state,
   * policy), through the generic artifact routes: the artifact at
   * `servers/<name>/<version>/server.json`, then
   * `GET /api/v1/artifacts/{id}/metadata`. `null` when either is missing.
   * The served `_meta` carries the artifact id; pass it to skip the lookup.
   */
  getStoredMetadata: async (
    repoKey: string,
    name: string,
    version: string,
    artifactId?: string,
  ): Promise<{ artifactId: string; metadata: McpStoredMetadata } | null> => {
    let id = artifactId;
    if (!id) {
      try {
        id = (await artifactsApi.get(repoKey, mcpArtifactPath(name, version))).id;
      } catch {
        return null;
      }
    }
    const res = await orNull(apiFetch<{ metadata?: unknown }>(`/api/v1/artifacts/${encodeURIComponent(id)}/metadata`));
    const metadata = res ? parseStoredMetadata(res.metadata) : null;
    return metadata ? { artifactId: id, metadata } : null;
  },

  // -------------------------------------------------------------------------
  // Remote management API: /api/v1/repositories/{key}/mcp/... (Remote MCP
  // repositories only; any other key answers 404). Reads need read on the
  // repository, decisions the repository `admin` action.
  // -------------------------------------------------------------------------

  /** `GET /catalog`: one page of the Remote's catalog (`null`: not served). */
  listCatalog: (repoKey: string, params: McpCatalogQuery = {}): Promise<McpCatalogPage | null> =>
    orNull(
      apiFetch<McpCatalogPage>(
        `${remoteBase(repoKey)}/catalog${query({ ...params, search: params.search?.trim() || undefined })}`,
      ).then((r) => ({ items: r?.items ?? [], nextCursor: r?.nextCursor ?? null, counts: r?.counts ?? {} })),
    ),

  /** `GET /catalog/servers/{name}`: one name of the catalog. */
  catalogItem: (repoKey: string, name: string): Promise<McpCatalogItem | null> =>
    orNull(apiFetch<McpCatalogItem>(`${remoteBase(repoKey)}/catalog/servers/${encodeServerName(name)}`)),

  /** `POST /catalog/{id}/approve|block|reopen`: a name row, or a `name@version` row. */
  decide: (
    repoKey: string,
    id: string,
    decision: McpCatalogDecision,
    reason?: string,
  ): Promise<McpDecisionResult> =>
    apiFetch<McpDecisionResult>(`${remoteBase(repoKey)}/catalog/${encodeURIComponent(id)}/${decision}`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),

  /** `POST /catalog/pins`: approve one `name@version` only. */
  pinVersion: (repoKey: string, name: string, version: string, reason?: string): Promise<McpDecisionResult> =>
    apiFetch<McpDecisionResult>(`${remoteBase(repoKey)}/catalog/pins`, {
      method: 'POST',
      body: JSON.stringify(reason ? { name, version, reason } : { name, version }),
    }),

  /**
   * `POST /catalog/bulk-approve`: every `pending` name whose full name
   * matches the glob (`io.github.acme/*`; a bare namespace is 422); deny
   * globs still win, flagged names only with `includeReview`. `dryRun`
   * answers every match without writing.
   */
  bulkApprovePattern: (
    repoKey: string,
    body: { pattern: string; includeReview?: boolean; reason?: string; dryRun?: boolean },
  ): Promise<McpBulkResult> =>
    apiFetch<McpBulkResult>(`${remoteBase(repoKey)}/catalog/bulk-approve`, {
      method: 'POST',
      body: JSON.stringify({
        pattern: body.pattern,
        includeReview: body.includeReview ?? false,
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.dryRun ? { dryRun: true } : {}),
      }),
    }).then(normalizeBulk),

  /** `POST /catalog/bulk-block`: block every name whose full name matches the glob. */
  bulkBlockPattern: (
    repoKey: string,
    body: { pattern: string; reason?: string; dryRun?: boolean },
  ): Promise<McpBulkResult> =>
    apiFetch<McpBulkResult>(`${remoteBase(repoKey)}/catalog/bulk-block`, {
      method: 'POST',
      body: JSON.stringify({
        pattern: body.pattern,
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.dryRun ? { dryRun: true } : {}),
      }),
    }).then(normalizeBulk),

  /** `POST /catalog/bulk-decide`: approve or block up to 500 rows (names or `name@version` rows) by id. */
  bulkDecide: (
    repoKey: string,
    ids: string[],
    action: 'approve' | 'block',
    reason?: string,
  ): Promise<McpBulkDecideResult> =>
    apiFetch<McpBulkDecideResult>(`${remoteBase(repoKey)}/catalog/bulk-decide`, {
      method: 'POST',
      body: JSON.stringify(reason ? { ids, action, reason } : { ids, action }),
    }).then((r) => ({
      action: r?.action ?? action,
      decided: r?.decided ?? [],
      unchanged: r?.unchanged ?? [],
      skippedDenied: r?.skippedDenied ?? [],
      notFound: r?.notFound ?? [],
    })),

  /** `POST /catalog/{id}/request-approval` (any reader): flags a name as wanted. */
  requestApproval: (repoKey: string, id: string, note?: string): Promise<McpCatalogItem> =>
    apiFetch<McpCatalogItem>(`${remoteBase(repoKey)}/catalog/${encodeURIComponent(id)}/request-approval`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),

  /** `GET /sync`: the Remote's sync state (`null`: not served). */
  syncState: (repoKey: string): Promise<McpSyncState | null> =>
    orNull(apiFetch<McpSyncState>(`${remoteBase(repoKey)}/sync`)),

  /**
   * `POST /sync`: start a sync pass in the background (`202`, artifact-keeper#5404);
   * its outcome is read from `syncState`. `409` while a pass runs or scheduled
   * upstream jobs are paused.
   */
  triggerSync: (repoKey: string): Promise<McpSyncAccepted> =>
    apiFetch<McpSyncAccepted>(`${remoteBase(repoKey)}/sync`, { method: 'POST' }),

  /**
   * `GET /api/v1/mcp/pending-summary`: names and drifted versions awaiting a
   * decision across the Remote MCP repositories the caller can read
   * (`null`: not served).
   */
  pendingSummary: (): Promise<McpPendingSummary | null> =>
    orNull(
      apiFetch<McpPendingSummary>('/api/v1/mcp/pending-summary').then((r) => ({
        pending: r?.pending ?? 0,
        review: r?.review ?? 0,
        drifted: r?.drifted ?? 0,
        total: r?.total ?? 0,
        repositories: r?.repositories ?? [],
      })),
    ),

  /**
   * Reason-gated holds of a hosted or Remote repository
   * (`GET /v0.1/x/com.artifactkeeper/holds`). Only a repository holder gets
   * the list; everyone else, and a Virtual, gets the plain 404 (`null`).
   */
  listHolds: async (
    repoKey: string,
    params: { cursor?: string; limit?: number; search?: string } = {},
  ): Promise<McpHoldsPage | null> => {
    const search =
      params.search && params.search.trim().length >= MCP_SEARCH_MIN_CHARS ? params.search.trim() : undefined;
    const r = await orNull(
      apiFetch<{ holds?: McpHoldProblem[]; metadata?: { count?: number; nextCursor?: string } }>(
        `${registryBase(repoKey)}/x/com.artifactkeeper/holds${query({ cursor: params.cursor, limit: params.limit, search })}`,
      ),
    );
    if (!r) return null;
    const holds = r.holds ?? [];
    return { holds, count: r.metadata?.count ?? holds.length, nextCursor: r.metadata?.nextCursor || undefined };
  },

  // -------------------------------------------------------------------------
  // Capabilities (Tools tab) on the registry surface
  // -------------------------------------------------------------------------

  /**
   * `GET .../versions/{version}/capabilities`. `snapshot` answers that
   * snapshot as `current`; `source` restricts `current` and the list.
   */
  capabilities: (
    repoKey: string,
    name: string,
    version: string,
    params: { snapshot?: string; source?: string; limit?: number } = {},
  ): Promise<McpCapabilities | null> =>
    orNull(
      apiFetch<McpCapabilities>(`${versionPath(repoKey, name, version)}/capabilities${query(params)}`).then((r) => ({
        ...r,
        current: r?.current ?? null,
        snapshots: Array.isArray(r?.snapshots) ? r.snapshots : [],
        introspection: {
          ...r?.introspection,
          remoteProbe: r?.introspection?.remoteProbe ?? 'off',
          sandbox: r?.introspection?.sandbox ?? 'off',
          probeEnabled: r?.introspection?.probeEnabled === true,
          sandboxEnabled: r?.introspection?.sandboxEnabled === true,
        },
      })),
    ),

  /**
   * `GET .../capabilities/diff`: tool, resource and prompt diff. Defaults:
   * `to` = this version's current snapshot, `from` = the previous one of the
   * same source (else the previous version's). `null` when there is no `to`.
   */
  capabilitiesDiff: (
    repoKey: string,
    name: string,
    version: string,
    params: { from?: string; to?: string; source?: string } = {},
  ): Promise<McpCapabilityDiff | null> =>
    orNull(apiFetch<McpCapabilityDiff>(`${versionPath(repoKey, name, version)}/capabilities/diff${query(params)}`)),

  /**
   * `POST .../capabilities/probe` (repository admin): queue the jobs the
   * repository's settings allow; `409 mcp_introspection_disabled` when none.
   */
  probe: (repoKey: string, name: string, version: string): Promise<{ queued: string[] }> =>
    apiFetch<{ queued?: string[] }>(`${versionPath(repoKey, name, version)}/capabilities/probe`, {
      method: 'POST',
    }).then((r) => ({ queued: r?.queued ?? [] })),

  // -------------------------------------------------------------------------
  // Health roll-up, admin edit/delete
  // -------------------------------------------------------------------------

  /** `GET /api/v1/repositories/{key}/mcp/servers/{name}/versions/{v}/health` (holders; 404 -> null). */
  health: (repoKey: string, name: string, version: string): Promise<McpHealth | null> =>
    orNull(
      apiFetch<McpHealth>(
        `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/servers/${encodeServerName(name)}/versions/${encodeURIComponent(version)}/health`,
      ).then((r) => ({
        ...r,
        packages: Array.isArray(r?.packages) ? r.packages : [],
        lint: {
          ...r?.lint,
          ran: r?.lint?.ran === true,
          block: r?.lint?.block ?? 0,
          review: r?.lint?.review ?? 0,
          warn: r?.lint?.warn ?? 0,
          findings: r?.lint?.findings ?? [],
        },
      })),
    ),

  /** `PUT .../versions/{version}` (repository admin): replace the document. */
  editVersion: (repoKey: string, name: string, version: string, server: McpServerJson): Promise<McpServedEntry> =>
    apiFetch<McpServedEntry>(versionPath(repoKey, name, version), {
      method: 'PUT',
      body: JSON.stringify(server),
    }),

  /** `DELETE .../versions/{version}` (write): soft delete, answers the served entry. */
  deleteVersion: (repoKey: string, name: string, version: string, statusMessage?: string): Promise<void> =>
    apiFetch<void>(versionPath(repoKey, name, version), {
      method: 'DELETE',
      ...(statusMessage ? { body: JSON.stringify({ statusMessage }) } : {}),
    }),

  // -------------------------------------------------------------------------
  // Namespace grants: ordinary permission rules (`/api/v1/permissions`,
  // instance administrators) carrying `conditions.mcp_namespaces`.
  // -------------------------------------------------------------------------

  /** Every rule on the repository that carries `conditions.mcp_namespaces`. */
  listNamespaceGrants: async (repositoryId: string): Promise<McpNamespaceGrant[]> => {
    const out: McpNamespaceGrant[] = [];
    for (let page = 1; page <= GRANT_PAGE_LIMIT; page += 1) {
      const r = await apiFetch<{ items?: PermissionRule[]; pagination?: { total_pages?: number } }>(
        `/api/v1/permissions${query({ target_type: 'repository', target_id: repositoryId, page, per_page: 100 })}`,
      );
      for (const rule of r?.items ?? []) {
        const grant = toNamespaceGrant(rule);
        if (grant) out.push(grant);
      }
      if (page >= (r?.pagination?.total_pages ?? 1)) break;
    }
    return out;
  },

  /**
   * Create the rule. A backend that predates namespace conditions would drop
   * `conditions.mcp_namespaces` and store an unconditional grant, so the
   * answer is checked and such a rule is deleted again before failing.
   */
  createNamespaceGrant: async (
    repositoryId: string,
    body: {
      principal_type: McpGrantPrincipalType;
      principal_id: string;
      actions: string[];
      namespaces: string[];
      /** Required by the backend when a pattern uses `{claim}`. */
      issuer?: string;
    },
  ): Promise<McpNamespaceGrant> => {
    const created = await apiFetch<PermissionRule>('/api/v1/permissions', {
      method: 'POST',
      body: JSON.stringify({
        principal_type: body.principal_type,
        principal_id: body.principal_id,
        target_type: 'repository',
        target_id: repositoryId,
        actions: body.actions,
        conditions: {
          mcp_namespaces: body.namespaces,
          ...(body.issuer ? { mcp_namespace_issuer: body.issuer } : {}),
        },
      }),
    });
    const grant = created ? toNamespaceGrant(created) : null;
    if (!grant) {
      if (created?.id) {
        await apiFetch<void>(`/api/v1/permissions/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(
          () => undefined,
        );
      }
      throw new Error('This server does not support MCP namespace grants; nothing was granted');
    }
    return grant;
  },

  deleteNamespaceGrant: (id: string): Promise<void> =>
    apiFetch<void>(`/api/v1/permissions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

function normalizeBulk(r: McpBulkResult | null | undefined): McpBulkResult {
  return {
    approved: r?.approved ?? 0,
    blocked: r?.blocked ?? 0,
    names: r?.names ?? [],
    skippedDenied: r?.skippedDenied ?? 0,
    skippedReview: r?.skippedReview ?? 0,
    dryRun: r?.dryRun === true,
  };
}

/** Pages of permission rules read per repository (100 each). */
const GRANT_PAGE_LIMIT = 20;

interface PermissionRule {
  id: string;
  principal_type: string;
  principal_id: string;
  principal_name?: string | null;
  target_type: string;
  target_id: string;
  actions: string[];
  conditions?: { mcp_namespaces?: unknown; mcp_namespace_issuer?: unknown } | null;
  created_at?: string;
}

/** A permission rule as a namespace grant, `null` when it carries no namespace condition. */
export function toNamespaceGrant(rule: PermissionRule): McpNamespaceGrant | null {
  const ns = rule.conditions?.mcp_namespaces;
  if (!Array.isArray(ns) || ns.length === 0) return null;
  return {
    id: rule.id,
    repository_id: rule.target_id,
    principal_type: rule.principal_type as McpGrantPrincipalType,
    principal_id: rule.principal_id,
    principal_name: rule.principal_name ?? undefined,
    actions: rule.actions ?? [],
    namespaces: ns.filter((n): n is string => typeof n === 'string'),
    issuer: typeof rule.conditions?.mcp_namespace_issuer === 'string' ? rule.conditions.mcp_namespace_issuer : undefined,
    created_at: rule.created_at,
  };
}
