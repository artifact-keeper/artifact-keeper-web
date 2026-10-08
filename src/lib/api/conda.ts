import { apiFetch } from '@/lib/api/fetch';

/**
 * One CEP-6 channel notice as the conda router serves it from
 * `/conda/{repo}/notices.json`. Withdrawals (backend artifact-keeper#4059)
 * append `{id, message, level, created_at, package, subdir, reason}`.
 */
export interface CondaChannelNotice {
  id: string;
  message: string;
  level?: string;
  created_at?: string;
  package?: string;
  subdir?: string;
  reason?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Keep only notices with an id and a message; tolerate anything else. */
export function adaptNotices(raw: unknown): CondaChannelNotice[] {
  const list = (raw as { notices?: unknown } | null)?.notices;
  if (!Array.isArray(list)) return [];
  const out: CondaChannelNotice[] = [];
  for (const n of list) {
    if (typeof n !== 'object' || n === null) continue;
    const r = n as Record<string, unknown>;
    const id = str(r.id);
    const message = str(r.message);
    if (!id || !message) continue;
    out.push({
      id,
      message,
      level: str(r.level),
      created_at: str(r.created_at),
      package: str(r.package),
      subdir: str(r.subdir),
      reason: str(r.reason),
    });
  }
  return out;
}

export interface WithdrawResult {
  withdrawn: boolean;
  artifact_id?: string;
  quarantine_status?: string;
  notice_id?: string;
}

/** `<subdir>/<file>` path segments, each URL-encoded. */
function channelPath(repoKey: string, path: string): string {
  return `/conda/${encodeURIComponent(repoKey)}/${path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')}`;
}

export const condaApi = {
  /**
   * Withdraw one package from a hosted conda channel (backend
   * artifact-keeper#4137/#4148): `DELETE /conda/{key}/{subdir}/{file}` with a
   * reason. The package leaves repodata, is named in `removed`, and a CEP-6
   * notice is appended. Admin only; not in the OpenAPI spec, so hand-written.
   */
  withdraw: async (repoKey: string, path: string, reason: string): Promise<WithdrawResult> =>
    (await apiFetch<WithdrawResult>(channelPath(repoKey, path), {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })) ?? { withdrawn: true },

  /**
   * The channel's CEP-6 notices. Served by the native conda router, not the
   * `/api/v1` API, so it goes through `apiFetch` with the channel path (the
   * web middleware proxies `/conda`).
   */
  getNotices: async (repoKey: string): Promise<CondaChannelNotice[]> =>
    // `no-store`: the channel serves notices.json with `max-age=60`, so a
    // browser-cached copy would hide a withdrawal made seconds ago.
    adaptNotices(
      await apiFetch<unknown>(`/conda/${encodeURIComponent(repoKey)}/notices.json`, {
        cache: 'no-store',
      }),
    ),
};

/** The newest withdrawal notice naming this package file, if any. */
export function noticeForPackage(
  notices: CondaChannelNotice[] | undefined,
  filename: string,
): CondaChannelNotice | undefined {
  const matching = (notices ?? []).filter((n) => n.package === filename);
  return matching[matching.length - 1];
}
