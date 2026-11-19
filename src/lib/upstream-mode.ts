/**
 * Upstream mode of a Remote (proxy) repository (#1094, backend
 * artifact-keeper#5282 / #5315).
 *
 * `online` proxies as usual. `cache_only` serves only what the repository
 * already holds and never contacts its upstream: a cache miss is a 404. The
 * instance-wide `PROXY_UPSTREAM_MODE=cache_only` environment variable forces
 * every Remote cache-only whatever its own setting, so the backend reports
 * both the stored mode and the `effective` one the proxy enforces.
 */

export type UpstreamMode = "online" | "cache_only";

/** `GET`/`PUT /api/v1/repositories/{key}/upstream-mode`. */
export interface UpstreamModeInfo {
  repository_key: string;
  /** The mode stored for this repository. */
  upstream_mode: UpstreamMode;
  /** The mode the proxy enforces (`cache_only` when the instance forces it). */
  effective_upstream_mode: UpstreamMode;
}

const MODES: ReadonlySet<string> = new Set<UpstreamMode>(["online", "cache_only"]);

function isMode(value: unknown): value is UpstreamMode {
  return typeof value === "string" && MODES.has(value);
}

/**
 * Narrow an upstream-mode response, or `null` when it is not one.
 *
 * Both modes must be present and recognized. A body without
 * `effective_upstream_mode` cannot say whether the instance forces cache-only
 * mode, so showing it would risk a Remote labelled online that is not: the
 * UI hides the mode instead.
 */
export function parseUpstreamMode(raw: unknown): UpstreamModeInfo | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isMode(r.upstream_mode) || !isMode(r.effective_upstream_mode)) return null;
  return {
    repository_key: typeof r.repository_key === "string" ? r.repository_key : "",
    upstream_mode: r.upstream_mode,
    effective_upstream_mode: r.effective_upstream_mode,
  };
}

/** Whether the proxy enforces cache-only mode for this repository. */
export function isCacheOnly(info: UpstreamModeInfo | null | undefined): boolean {
  return info?.effective_upstream_mode === "cache_only";
}

/**
 * Whether the instance (`PROXY_UPSTREAM_MODE=cache_only`) forces cache-only
 * mode over the repository's own `online` setting. When the repository is
 * itself `cache_only` the response cannot tell, and there is nothing to warn
 * about.
 */
export function isForcedByInstance(info: UpstreamModeInfo | null | undefined): boolean {
  return info?.upstream_mode === "online" && info.effective_upstream_mode === "cache_only";
}

export function upstreamModeLabel(mode: UpstreamMode): string {
  return mode === "cache_only" ? "Cache-only" : "Online";
}

/** Tooltip copy for the "Cache-only" badge. */
export const CACHE_ONLY_TOOLTIP =
  "Cache-only: this Remote never contacts its upstream. It serves only what it has already cached, and a cache miss returns 404.";

export function upstreamModeKey(repoKey: string) {
  return ["upstream-mode", repoKey] as const;
}
