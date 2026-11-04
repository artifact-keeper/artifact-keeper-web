import { apiFetch, ApiError } from '@/lib/api/fetch';
import { artifactsApi } from '@/lib/api/artifacts';
import { MCP_API_VERSION, MCP_ROUTE_PREFIX, mcpArtifactPath } from '@/lib/mcp/format';
import { parseServedEntry, parseServerList, parseStoredMetadata } from '@/lib/mcp/server-json';
import type {
  McpBulkNamespaceResult,
  McpBundle,
  McpCapabilities,
  McpHealth,
  McpHoldProblem,
  McpNamespaceGrant,
  McpReview,
  McpServedEntry,
  McpServerJson,
  McpServerStatus,
  McpStoredMetadata,
  McpUpstreamPage,
  McpVersionRead,
} from '@/types/mcp';

/**
 * Every MCP Registry call the UI makes (artifact-keeper#5253), in one module
 * so a contract change is a change here.
 *
 * Phase 1 endpoints are the backend's registry API v0.1 (mounted at
 * `/mcp/<repo>/v0.1`, proxied by `src/middleware.ts`) plus the generic
 * artifact metadata route. Phase 2/3 endpoints follow the tracking issue's
 * contract (sections 3.3, 3.4, 4.2, 8 and decision 10) and are marked
 * `PHASE 2` / `PHASE 3`; a backend that does not serve one answers 404/405/
 * 501, which every reader below maps to `null` ("not available on this
 * server") so the surface hides instead of erroring.
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

function adminServerPath(repoKey: string, name: string, version?: string): string {
  const base = `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/servers/${encodeServerName(name)}`;
  return version === undefined ? base : `${base}/versions/${encodeURIComponent(version)}`;
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
  // PHASE 2: Remote approval queue (curation_packages keyed by server name)
  // -------------------------------------------------------------------------

  /** `GET /api/v1/repositories/{key}/mcp/reviews?status=` (null: not served). */
  listReviews: (repoKey: string, params: { status?: string; search?: string } = {}): Promise<McpReview[] | null> =>
    orNull(
      apiFetch<{ items?: McpReview[] } | McpReview[]>(
        `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/reviews${query(params)}`,
      ).then((r) => (Array.isArray(r) ? r : (r?.items ?? []))),
    ),

  /** Approve a name (or `name@version` when `version` is set). */
  approveReview: (id: string, body: { reason?: string; version?: string } = {}): Promise<McpReview> =>
    apiFetch<McpReview>(`/api/v1/curation/packages/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  blockReview: (id: string, body: { reason?: string } = {}): Promise<McpReview> =>
    apiFetch<McpReview>(`/api/v1/curation/packages/${encodeURIComponent(id)}/block`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  bulkApprove: (ids: string[], reason: string): Promise<number> =>
    apiFetch<number>('/api/v1/curation/packages/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    }),

  bulkBlock: (ids: string[], reason: string): Promise<number> =>
    apiFetch<number>('/api/v1/curation/packages/bulk-block', {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    }),

  /** Approve every pending name a namespace glob matches; deny globs still win. */
  bulkApproveNamespace: (repoKey: string, namespaceGlob: string, reason: string): Promise<McpBulkNamespaceResult> =>
    apiFetch<McpBulkNamespaceResult>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/reviews/bulk-approve-namespace`,
      { method: 'POST', body: JSON.stringify({ namespace_glob: namespaceGlob, reason }) },
    ),

  /** Browse the Remote's upstream catalog (UI only, never on /v0.1). */
  upstreamCatalog: (
    repoKey: string,
    params: { search?: string; cursor?: string; limit?: number } = {},
  ): Promise<McpUpstreamPage | null> =>
    orNull(
      apiFetch<McpUpstreamPage>(`/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/upstream${query(params)}`),
    ),

  /** "Request approval" for an upstream name: queues it as `pending`. */
  requestApproval: (repoKey: string, name: string): Promise<McpReview> =>
    apiFetch<McpReview>(`/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/upstream/request-approval`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /** Reason-gated holds of a repository (`GET /v0.1/x/com.artifactkeeper/holds`). */
  listHolds: (repoKey: string, params: { name?: string; version?: string } = {}): Promise<McpHoldProblem[] | null> =>
    orNull(
      apiFetch<{ holds?: McpHoldProblem[] }>(`${registryBase(repoKey)}/x/com.artifactkeeper/holds${query(params)}`).then(
        (r) => r?.holds ?? [],
      ),
    ),

  /** Instance-wide count of MCP versions awaiting approval (dashboard tile). */
  pendingReviewCount: async (): Promise<number | null> => {
    const r = await orNull(apiFetch<Record<string, unknown>>('/api/v1/admin/holds/summary'));
    const v = r?.mcp_pending_reviews;
    return typeof v === 'number' ? v : null;
  },

  // -------------------------------------------------------------------------
  // PHASE 2/3: capabilities (Tools tab) and probe
  // -------------------------------------------------------------------------

  capabilities: (repoKey: string, name: string, version: string): Promise<McpCapabilities | null> =>
    orNull(
      apiFetch<McpCapabilities>(`${adminServerPath(repoKey, name, version)}/capabilities`).then((r) => ({
        ...r,
        snapshots: Array.isArray(r?.snapshots) ? r.snapshots : [],
      })),
    ),

  /** Admin: queue a remote probe (only when `probe_available`). */
  probe: (repoKey: string, name: string, version: string): Promise<void> =>
    apiFetch<void>(`${adminServerPath(repoKey, name, version)}/capabilities/probe`, { method: 'POST' }),

  // -------------------------------------------------------------------------
  // PHASE 3: health roll-up, admin edit/delete, bundles, namespace grants
  // -------------------------------------------------------------------------

  health: (repoKey: string, name: string, version: string): Promise<McpHealth | null> =>
    orNull(apiFetch<McpHealth>(`${adminServerPath(repoKey, name, version)}/health`)),

  /** `PUT .../versions/{version}` (admin edit). */
  editVersion: (repoKey: string, name: string, version: string, server: McpServerJson): Promise<McpServedEntry> =>
    apiFetch<McpServedEntry>(`${serverPath(repoKey, name)}/versions/${encodeURIComponent(version)}`, {
      method: 'PUT',
      body: JSON.stringify(server),
    }),

  /** `DELETE .../versions/{version}` (soft delete). */
  deleteVersion: (repoKey: string, name: string, version: string): Promise<void> =>
    apiFetch<void>(`${serverPath(repoKey, name)}/versions/${encodeURIComponent(version)}`, { method: 'DELETE' }),

  bundle: (repoKey: string, name: string, version: string): Promise<McpBundle | null> =>
    orNull(apiFetch<McpBundle>(`${adminServerPath(repoKey, name, version)}/bundle`)),

  listNamespaceGrants: (repoKey: string): Promise<McpNamespaceGrant[] | null> =>
    orNull(
      apiFetch<{ items?: McpNamespaceGrant[] } | McpNamespaceGrant[]>(
        `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/namespace-grants`,
      ).then((r) => (Array.isArray(r) ? r : (r?.items ?? []))),
    ),

  createNamespaceGrant: (
    repoKey: string,
    body: { principal_type: McpNamespaceGrant['principal_type']; principal_id: string; actions: string[]; namespaces: string[] },
  ): Promise<McpNamespaceGrant> =>
    apiFetch<McpNamespaceGrant>(`/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/namespace-grants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteNamespaceGrant: (repoKey: string, id: string): Promise<void> =>
    apiFetch<void>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/mcp/namespace-grants/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
};
