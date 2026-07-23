import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";
import { isCveId, isGhsaId } from "@/lib/vuln-utils";
import type {
  BlastRadiusResponse,
  BlastRadiusSummary,
  BlastRadiusTargetInfo,
  AffectedRepo,
  BlastDownloader,
  AccessibleUsersResponse,
  AccessibleUser,
  RepoExposure,
} from "@artifact-keeper/sdk";

// Re-export the generated SDK types (regenerated from the OpenAPI spec),
// mapping the two SDK names that differ from this module's historical names
// (`BlastRadiusTargetInfo` -> BlastRadiusTarget, `BlastDownloader` ->
// BlastRadiusDownloader). The zod schema below still validates at the trust
// boundary.
export type {
  BlastRadiusResponse,
  BlastRadiusSummary,
  AffectedRepo,
  // 1.6.0 disclosure dimension (backend #2386): accessible-but-not-downloaded.
  AccessibleUsersResponse,
  AccessibleUser,
  RepoExposure,
};
export type BlastRadiusTarget = BlastRadiusTargetInfo;
export type BlastRadiusDownloader = BlastDownloader;

/**
 * Admin client for the CVE blast-radius endpoints (#570, backend #2364).
 *
 * Given a CVE id or an artifact, the backend joins the CVE seam
 * (`scan_findings.cve_id` / `artifact_id`) to the per-user download
 * attribution seam (`download_statistics.user_id` / `ip_address`) and
 * answers "who is exposed": the principals that downloaded an affected
 * artifact plus a per-repository classification of how widely each affected
 * repository is reachable.
 *
 * The operations and response schemas ARE now in the generated
 * `@artifact-keeper/sdk@1.6.0` (`cveBlastRadius` / `artifactBlastRadius` /
 * `cveAccessibleUsers` / `artifactAccessibleUsers`), so we import the generated
 * response *types* as the source of truth. We deliberately keep fetching through
 * the shared `apiFetch` wrapper and validate every response with zod at the
 * trust boundary — the same pattern the rest of this module (and audit /
 * downloads) uses — rather than mixing in the generated client. This keeps one
 * fetch/validation path for the whole feature and guarantees a backend that
 * drifts from the spec surfaces as a clear parse error instead of an untyped
 * runtime shape.
 *
 * Endpoints (under the admin-guarded router):
 *   GET /api/v1/admin/security/cve/{cve_id}/blast-radius            -> BlastRadiusResponse
 *   GET /api/v1/admin/security/artifact/{artifact_id}/blast-radius  -> BlastRadiusResponse
 *   GET /api/v1/admin/security/cve/{cve_id}/accessible-users        -> AccessibleUsersResponse (#2386)
 *   GET /api/v1/admin/security/artifact/{artifact_id}/accessible-users -> AccessibleUsersResponse (#2386)
 *
 * Query params (blast-radius): page / per_page (default 20, max 100) over the
 * collapsed downloaders list, optional from / to (inclusive RFC 3339 bounds
 * on downloaded_at). `affected_repos` is bounded to 200 rows server-side and
 * per-downloader IP samples are capped at 50 (counts stay exact).
 *
 * Query params (accessible-users): page / per_page (same bounds) over the
 * accessible-not-downloaded list, plus `repository_id` which is REQUIRED for
 * the CVE route (a CVE spans many repos so enumeration must be scoped to one)
 * and ignored for the artifact route (the repo is implied by the artifact).
 */

/**
 * How widely a repository holding an affected artifact is reachable:
 * `public` (anonymous-readable — everyone is exposed), `restricted_acl`
 * (private with explicit repository ACL rows), or `restricted_roles`
 * (private, access only via role assignments/admin). Kept as a plain string
 * so a future scope added server-side degrades to a neutral badge instead of
 * failing the whole response parse.
 */
export type AccessScope = string;

export interface BlastRadiusQuery {
  /** Inclusive lower bound on downloaded_at, RFC 3339. */
  from?: string;
  /** Inclusive upper bound on downloaded_at, RFC 3339. */
  to?: string;
  /** 1-based page index over the downloaders list (default 1). */
  page?: number;
  /** Downloaders page size (backend default 20, max 100). */
  per_page?: number;
}

/** Backend hard cap on `per_page` (#2364). */
export const BLAST_RADIUS_MAX_PER_PAGE = 100;
/** Backend default page size (#2364). */
export const BLAST_RADIUS_DEFAULT_PER_PAGE = 20;

const TargetSchema = z
  .object({ kind: z.string(), value: z.string() })
  .passthrough();

const SummarySchema = z
  .object({
    affected_artifact_count: z.number(),
    affected_repo_count: z.number(),
    downloader_user_count: z.number(),
    anonymous_download_present: z.boolean(),
    distinct_ip_count: z.number(),
    total_download_count: z.number(),
  })
  .passthrough();

const AffectedRepoSchema = z
  .object({
    repository_id: z.string(),
    repository_key: z.string(),
    is_public: z.boolean(),
    access_scope: z.string(),
  })
  .passthrough();

const DownloaderSchema = z
  .object({
    user_id: z.string().nullish(),
    username: z.string().nullish(),
    download_count: z.number(),
    distinct_ip_count: z.number(),
    first_download: z.string(),
    last_download: z.string(),
    ip_addresses: z.array(z.string()).nullish(),
  })
  .passthrough();

const BlastRadiusSchema = z
  .object({
    target: TargetSchema,
    summary: SummarySchema,
    affected_repos: z.array(AffectedRepoSchema),
    downloaders: z.array(DownloaderSchema),
    total_downloaders: z.number(),
    page: z.number(),
    per_page: z.number(),
  })
  .passthrough();

export function parseBlastRadius(data: unknown): BlastRadiusResponse {
  const parsed = BlastRadiusSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Blast-radius response did not match the expected shape");
  }
  return {
    target: { kind: parsed.data.target.kind, value: parsed.data.target.value },
    summary: {
      affected_artifact_count: parsed.data.summary.affected_artifact_count,
      affected_repo_count: parsed.data.summary.affected_repo_count,
      downloader_user_count: parsed.data.summary.downloader_user_count,
      anonymous_download_present:
        parsed.data.summary.anonymous_download_present,
      distinct_ip_count: parsed.data.summary.distinct_ip_count,
      total_download_count: parsed.data.summary.total_download_count,
    },
    affected_repos: parsed.data.affected_repos.map((r) => ({
      repository_id: r.repository_id,
      repository_key: r.repository_key,
      is_public: r.is_public,
      access_scope: r.access_scope,
    })),
    downloaders: parsed.data.downloaders.map((d) => ({
      user_id: d.user_id ?? null,
      username: d.username ?? null,
      download_count: d.download_count,
      distinct_ip_count: d.distinct_ip_count,
      first_download: d.first_download,
      last_download: d.last_download,
      ip_addresses: d.ip_addresses ?? [],
    })),
    total_downloaders: parsed.data.total_downloaders,
    page: parsed.data.page,
    per_page: parsed.data.per_page,
  };
}

// ---------------------------------------------------------------------------
// Accessible-but-not-downloaded (latent exposure) — 1.6.0 dimension (#2386)
// ---------------------------------------------------------------------------

export interface AccessibleUsersQuery {
  /**
   * Repository to scope enumeration to. REQUIRED for the CVE route (a CVE
   * spans many repos); ignored server-side for the artifact route.
   */
  repository_id?: string;
  /** 1-based page index over the accessible-users list (default 1). */
  page?: number;
  /** Accessible-users page size (backend default 20, max 100). */
  per_page?: number;
}

/**
 * Coarse breadth of who can reach the affected artifact in this repository:
 * `enumerable` (a bounded, listable set of principals — the only case where
 * `accessible_not_downloaded` is populated), `everyone` (public / anonymous
 * readable — not enumerated, `total` is null), or `effectively-everyone`
 * (so broadly granted that per-user enumeration is not meaningful). Kept as a
 * plain string so a future value degrades to a neutral badge.
 */
export type Exposure = string;

// The accessible-users response validates against the generated SDK
// `AccessibleUsersResponse` shape. RepoExposure carries the single restricted
// repository the enumeration was scoped to; `total` is null for public repos.
const RepoExposureSchema = z
  .object({
    repository_id: z.string(),
    repository_key: z.string(),
    access_scope: z.string(),
  })
  .passthrough();

const AccessibleUserSchema = z
  .object({
    // `reason` is always "has-access" for this endpoint (accessible minus
    // downloaded) but is validated rather than assumed.
    reason: z.string(),
    user_id: z.string(),
    username: z.string(),
    // How access is granted: `admin` | `permission` | `role`.
    via: z.string(),
  })
  .passthrough();

const AccessibleUsersSchema = z
  .object({
    target: TargetSchema,
    repository: RepoExposureSchema,
    exposure: z.string(),
    accessible_not_downloaded: z.array(AccessibleUserSchema),
    // `null` for public repos (never enumerated); omitted is treated as null.
    total: z.number().nullish(),
    page: z.number(),
    per_page: z.number(),
  })
  .passthrough();

export function parseAccessibleUsers(data: unknown): AccessibleUsersResponse {
  const parsed = AccessibleUsersSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      "Accessible-users response did not match the expected shape"
    );
  }
  return {
    target: { kind: parsed.data.target.kind, value: parsed.data.target.value },
    repository: {
      repository_id: parsed.data.repository.repository_id,
      repository_key: parsed.data.repository.repository_key,
      access_scope: parsed.data.repository.access_scope,
    },
    exposure: parsed.data.exposure,
    accessible_not_downloaded: parsed.data.accessible_not_downloaded.map(
      (u) => ({
        reason: u.reason,
        user_id: u.user_id,
        username: u.username,
        via: u.via,
      })
    ),
    total: parsed.data.total ?? null,
    page: parsed.data.page,
    per_page: parsed.data.per_page,
  };
}

/**
 * Build the query string for the accessible-users endpoints, omitting empty
 * params and clamping page/per_page to the same bounds as blast-radius.
 */
export function buildAccessibleUsersQueryString(
  query: AccessibleUsersQuery
): string {
  const params = new URLSearchParams();
  if (query.repository_id) params.set("repository_id", query.repository_id);
  if (query.page != null) params.set("page", String(Math.max(1, query.page)));
  if (query.per_page != null) {
    params.set(
      "per_page",
      String(Math.min(Math.max(1, query.per_page), BLAST_RADIUS_MAX_PER_PAGE))
    );
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const accessibleUsersApi = {
  /**
   * Latent exposure of one CVE/GHSA id, scoped to a single repository: who
   * COULD read an affected artifact but has not downloaded it. `repository_id`
   * is required — a CVE spans many repos.
   */
  forCve: async (
    cveId: string,
    query: AccessibleUsersQuery = {}
  ): Promise<AccessibleUsersResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/security/cve/${encodeURIComponent(
        normalizeVulnId(cveId)
      )}/accessible-users${buildAccessibleUsersQueryString(query)}`,
      { method: "GET" }
    );
    return parseAccessibleUsers(data);
  },

  /**
   * Latent exposure of one artifact: the repository is implied by the artifact
   * so `repository_id` is ignored server-side.
   */
  forArtifact: async (
    artifactId: string,
    query: AccessibleUsersQuery = {}
  ): Promise<AccessibleUsersResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/security/artifact/${encodeURIComponent(
        artifactId.trim()
      )}/accessible-users${buildAccessibleUsersQueryString(query)}`,
      { method: "GET" }
    );
    return parseAccessibleUsers(data);
  },
};

/**
 * Client-side validation of the blast-radius target id. The backend matches
 * `scan_findings.cve_id` exactly, and scanners populate that column with CVE
 * ids (Trivy/Grype/NVD) or GHSA ids (GitHub advisories), so both formats are
 * accepted. Catching a malformed id before submitting gives a friendlier
 * error than an empty report for a typo'd id.
 */
export function isValidVulnId(value: string): boolean {
  const v = value.trim();
  return isCveId(v) || isGhsaId(v);
}

/**
 * Normalize a vulnerability id to the canonical form scanners record:
 * uppercase `CVE-…`, lowercase suffix `GHSA-…` ids are left as typed apart
 * from the uppercased prefix.
 */
export function normalizeVulnId(value: string): string {
  const v = value.trim();
  if (isCveId(v)) return v.toUpperCase();
  if (isGhsaId(v)) return `GHSA-${v.slice(5).toLowerCase()}`;
  return v;
}

/** Link into the blast-radius page pre-scoped to one vulnerability id. */
export function blastRadiusHref(cveId: string): string {
  return `/security/blast-radius?cve=${encodeURIComponent(cveId)}`;
}

/** Build the query string for the blast-radius endpoints, omitting empty params. */
export function buildBlastRadiusQueryString(query: BlastRadiusQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page != null) params.set("page", String(Math.max(1, query.page)));
  if (query.per_page != null) {
    params.set(
      "per_page",
      String(Math.min(Math.max(1, query.per_page), BLAST_RADIUS_MAX_PER_PAGE))
    );
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const blastRadiusApi = {
  /** Blast radius of one CVE/GHSA id: who is exposed to this vulnerability? */
  forCve: async (
    cveId: string,
    query: BlastRadiusQuery = {}
  ): Promise<BlastRadiusResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/security/cve/${encodeURIComponent(
        normalizeVulnId(cveId)
      )}/blast-radius${buildBlastRadiusQueryString(query)}`,
      { method: "GET" }
    );
    return parseBlastRadius(data);
  },

  /** Blast radius of one artifact, regardless of which CVE flagged it. */
  forArtifact: async (
    artifactId: string,
    query: BlastRadiusQuery = {}
  ): Promise<BlastRadiusResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/security/artifact/${encodeURIComponent(
        artifactId.trim()
      )}/blast-radius${buildBlastRadiusQueryString(query)}`,
      { method: "GET" }
    );
    return parseBlastRadius(data);
  },
};

export default blastRadiusApi;
