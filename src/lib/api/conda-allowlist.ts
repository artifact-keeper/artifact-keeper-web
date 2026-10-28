import { apiFetch } from '@/lib/api/fetch';
import type { AllowlistEntry } from '@/lib/conda-allowlist';

/**
 * Which members of the virtual channel the list filters (backend
 * artifact-keeper#5055): `all_members` (the backend default: hosted and
 * remote) or `remote_only` (hosted members pass through unfiltered).
 */
export type CondaAllowlistScope = 'all_members' | 'remote_only';

/**
 * The package allowlist of a virtual conda repository (backend
 * artifact-keeper#4576), as `GET`/`PUT`/`DELETE
 * /api/v1/repositories/{key}/allowlist` return it. `error` is set when the
 * stored list is unusable: the backend then enforces it as admit-nothing and
 * reports `enabled: true` with no entries.
 *
 * `scope` is null when the backend does not report one: a backend before
 * artifact-keeper#5055 (1.11.9), which filters remote members only and
 * rejects a `scope` field on `PUT` (the request body denies unknown fields).
 */
export interface CondaAllowlist {
  repository_key: string;
  enabled: boolean;
  scope: CondaAllowlistScope | null;
  entries: AllowlistEntry[];
  entry_count: number;
  error?: string;
}

export interface CondaAllowlistRequest {
  enabled: boolean;
  /**
   * Send only to a backend that reported a scope. Omitted, the backend keeps
   * the stored scope (`all_members` for a new list).
   */
  scope?: CondaAllowlistScope;
  entries: AllowlistEntry[];
}

/**
 * The members a list filters, as the backend in use applies it: the reported
 * scope, or remote members only on a backend that predates scopes.
 */
export function filtersHostedMembers(list: Pick<CondaAllowlist, 'scope'>): boolean {
  return list.scope === 'all_members';
}

function adaptScope(v: unknown): CondaAllowlistScope | null {
  // Anything else (absent, or a value this client does not know) is null:
  // the control stays hidden and a save omits `scope`, so the backend keeps
  // whatever it has stored.
  return v === 'all_members' || v === 'remote_only' ? v : null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Validate the response at the trust boundary; drop malformed entries. */
export function adaptAllowlist(raw: unknown, repoKey: string): CondaAllowlist {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const entries: AllowlistEntry[] = [];
  if (Array.isArray(r.entries)) {
    for (const e of r.entries) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const name = str(o.name);
      if (!name) continue;
      const entry: AllowlistEntry = { name };
      const version = str(o.version);
      if (version) entry.version = version;
      if (Array.isArray(o.subdirs)) {
        const subdirs = o.subdirs.filter((s): s is string => typeof s === 'string');
        if (subdirs.length) entry.subdirs = subdirs;
      }
      entries.push(entry);
    }
  }
  return {
    repository_key: str(r.repository_key) ?? repoKey,
    enabled: r.enabled === true,
    scope: adaptScope(r.scope),
    entries,
    entry_count: typeof r.entry_count === 'number' ? r.entry_count : entries.length,
    error: str(r.error) || undefined,
  };
}

function path(repoKey: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repoKey)}/allowlist`;
}

/**
 * Client for the allowlist endpoints. Repository admin only (a 403
 * otherwise, also on `GET`); a 400 on anything but a virtual conda
 * repository. Not in the generated SDK yet, so hand-written.
 */
export const condaAllowlistApi = {
  get: async (repoKey: string): Promise<CondaAllowlist> =>
    adaptAllowlist(await apiFetch<unknown>(path(repoKey)), repoKey),

  /** Replace the whole list. The backend's 400 names the entry (`entries[N]: ...`). */
  set: async (repoKey: string, body: CondaAllowlistRequest): Promise<CondaAllowlist> =>
    adaptAllowlist(
      await apiFetch<unknown>(path(repoKey), { method: 'PUT', body: JSON.stringify(body) }),
      repoKey,
    ),

  /** Remove the list: the virtual's merge is unfiltered again. */
  remove: async (repoKey: string): Promise<CondaAllowlist> =>
    adaptAllowlist(await apiFetch<unknown>(path(repoKey), { method: 'DELETE' }), repoKey),
};

/** Whether a repository carries an allowlist: virtual conda repositories only. */
export function supportsCondaAllowlist(repo: { format?: string; repo_type?: string } | undefined): boolean {
  return (
    !!repo &&
    repo.repo_type === 'virtual' &&
    (repo.format === 'conda' || repo.format === 'conda_native')
  );
}

/** React Query key shared by the settings section and the overview summary. */
export function allowlistQueryKey(repoKey: string) {
  return ['repository', repoKey, 'conda-allowlist'] as const;
}
