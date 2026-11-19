import { apiFetch } from '@/lib/api/fetch';

/** The include and exclude lists a PUT sends, two empty lists remove the filter */
export interface UpstreamFilterPatterns {
  include_patterns: string[];
  exclude_patterns: string[];
}

/** A remote's upstream filter (artifact-keeper#4399), an unusable stored one is `active` with `error` and no patterns */
export interface UpstreamFilter extends UpstreamFilterPatterns {
  repository_key: string;
  active: boolean;
  error?: string;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/** Validate the response at the trust boundary */
export function adaptUpstreamFilter(raw: unknown, repoKey: string): UpstreamFilter {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    repository_key: typeof r.repository_key === 'string' ? r.repository_key : repoKey,
    include_patterns: strings(r.include_patterns),
    exclude_patterns: strings(r.exclude_patterns),
    active: r.active === true,
    error: typeof r.error === 'string' && r.error ? r.error : undefined,
  };
}

/** One pattern per non-empty line, surrounding whitespace dropped */
export function parsePatternLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

function path(repoKey: string): string {
  return `/api/v1/repositories/${encodeURIComponent(repoKey)}/upstream-filter`;
}

/** Repository admin only (403 also on GET), 400 for anything but a remote. Not in the SDK yet */
export const upstreamFilterApi = {
  get: async (repoKey: string): Promise<UpstreamFilter> =>
    adaptUpstreamFilter(await apiFetch<unknown>(path(repoKey)), repoKey),

  set: async (repoKey: string, patterns: UpstreamFilterPatterns): Promise<UpstreamFilter> =>
    adaptUpstreamFilter(
      await apiFetch<unknown>(path(repoKey), {
        method: 'PUT',
        body: JSON.stringify(patterns),
      }),
      repoKey,
    ),

  remove: async (repoKey: string): Promise<UpstreamFilter> =>
    adaptUpstreamFilter(await apiFetch<unknown>(path(repoKey), { method: 'DELETE' }), repoKey),
};
