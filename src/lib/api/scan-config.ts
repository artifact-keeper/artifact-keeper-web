import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Repository-scoped scanning & enforcement configuration
 * (backend #2954 / #3003, "inline scan-and-block").
 *
 * The generated SDK models this endpoint too, but the SDK's
 * `UpsertScanConfigRequest`/`ScanConfigResponse` do not yet carry the
 * `proxy_scan_action` field — the knob that decides, when an inline proxy
 * download is scanned and the scanner is unavailable or the artifact fails
 * policy, whether the request *fails open* (serve anyway, availability first)
 * or *fails closed* (block, security first). Bumping the SDK is owned by a
 * separate worker, so this module deliberately talks to the backend through
 * the shared `apiFetch` wrapper and validates responses with zod at the trust
 * boundary. That keeps the "active blocking" UI shippable independently of the
 * SDK release cadence.
 *
 * Endpoints (repo-admin guarded on the backend):
 *   GET /api/v1/repositories/{key}/security  -> RepoSecurityResponse
 *   PUT /api/v1/repositories/{key}/security  -> ScanConfigResponse
 *
 * The GET wraps the config in `{ config, score }`; `config` is `null` until a
 * row exists, in which case we surface the documented defaults so the form has
 * something coherent to render.
 */

/**
 * What the proxy does when an inline download is scanned and the scan can't
 * confirm the artifact is clean (scanner error/timeout, or a policy violation
 * with blocking on).
 *
 * - `fail_open`  — serve the artifact anyway. Availability first. (default)
 * - `fail_closed`— block the download. Security first ("active blocking").
 * - `record_only`— serve everything and record the verdicts; never block.
 *   For trying enforcement out before turning it on (backend #3645).
 */
export type ProxyScanAction = "fail_open" | "fail_closed" | "record_only";

export type SeverityThreshold = "critical" | "high" | "medium" | "low";

export const SEVERITY_THRESHOLDS: readonly SeverityThreshold[] = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

/** Documented backend defaults for a repository with no scan-config row yet. */
export const DEFAULT_SCAN_CONFIG: RepoScanConfig = {
  scan_enabled: false,
  scan_on_upload: false,
  scan_on_proxy: false,
  block_on_policy_violation: false,
  severity_threshold: "high",
  proxy_scan_action: "fail_open",
};

export interface RepoScanConfig {
  scan_enabled: boolean;
  scan_on_upload: boolean;
  scan_on_proxy: boolean;
  block_on_policy_violation: boolean;
  severity_threshold: string;
  /**
   * Kept as the backend sent it. A value this build does not know (a mode
   * added later) must survive a load and a save untouched, so it is not
   * narrowed to a known action; check with `isKnownProxyScanAction`.
   */
  proxy_scan_action: string;
}

/**
 * Upsert patch. Every field is optional: the backend upsert is a
 * read-modify-write that merges the patch over the existing row (#1374), so an
 * omitted field keeps its stored value instead of being reset to a default.
 */
export interface UpsertScanConfigRequest {
  scan_enabled?: boolean;
  scan_on_upload?: boolean;
  scan_on_proxy?: boolean;
  block_on_policy_violation?: boolean;
  severity_threshold?: string;
  proxy_scan_action?: string;
}

// A missing field (a backend that predates it) falls back to the default in
// `normalize`. A value we do not recognise is kept, not coerced to
// `fail_open`: that would show a `record_only` repository as blocking-capable
// and write the wrong mode back on the next save (#1069).
const ProxyScanActionLoose = z.string().optional().catch(undefined);

const ScanConfigSchema = z
  .object({
    scan_enabled: z.boolean().catch(false),
    scan_on_upload: z.boolean().catch(false),
    scan_on_proxy: z.boolean().catch(false),
    block_on_policy_violation: z.boolean().catch(false),
    severity_threshold: z.string().catch("high"),
    proxy_scan_action: ProxyScanActionLoose,
  })
  .passthrough();

// The GET returns `{ config: ScanConfigResponse | null, score: ... | null }`.
// Accept the wrapped shape and, defensively, a bare config object too.
const RepoSecuritySchema = z.union([
  z
    .object({ config: ScanConfigSchema.nullable().optional() })
    .passthrough(),
  ScanConfigSchema,
]);

function normalize(raw: z.infer<typeof ScanConfigSchema>): RepoScanConfig {
  return {
    scan_enabled: raw.scan_enabled,
    scan_on_upload: raw.scan_on_upload,
    scan_on_proxy: raw.scan_on_proxy,
    block_on_policy_violation: raw.block_on_policy_violation,
    severity_threshold: raw.severity_threshold,
    proxy_scan_action: raw.proxy_scan_action ?? "fail_open",
  };
}

/** Parse a GET response into a normalized config, applying defaults when the
 *  repository has no config row yet. Exported for unit testing. */
export function parseRepoSecurity(data: unknown): RepoScanConfig {
  const parsed = RepoSecuritySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      "Repository security response did not match the expected shape",
    );
  }
  const value = parsed.data;
  // Bare config object (no wrapper).
  if ("scan_enabled" in value) {
    return normalize(value as z.infer<typeof ScanConfigSchema>);
  }
  // Wrapped: `config` may be null/absent for an unconfigured repository.
  if (!value.config) {
    return { ...DEFAULT_SCAN_CONFIG };
  }
  return normalize(value.config);
}

/** Parse a PUT response (a bare ScanConfigResponse). Exported for testing. */
export function parseScanConfig(data: unknown): RepoScanConfig {
  const parsed = ScanConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Scan config response did not match the expected shape");
  }
  return normalize(parsed.data);
}

export const scanConfigApi = {
  /** Load the current scanning & enforcement config for a repository. */
  get: async (repoKey: string): Promise<RepoScanConfig> => {
    const data = await apiFetch<unknown>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/security`,
      { method: "GET" },
    );
    return parseRepoSecurity(data);
  },

  /** Save (upsert) the scanning & enforcement config for a repository. */
  update: async (
    repoKey: string,
    req: UpsertScanConfigRequest,
  ): Promise<RepoScanConfig> => {
    const data = await apiFetch<unknown>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/security`,
      { method: "PUT", body: JSON.stringify(req) },
    );
    return parseScanConfig(data);
  },
};

