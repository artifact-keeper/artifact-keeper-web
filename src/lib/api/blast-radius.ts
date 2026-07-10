import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";
import { isCveId, isGhsaId } from "@/lib/vuln-utils";

/**
 * Admin client for the CVE blast-radius endpoints (#570, backend #2364).
 *
 * Given a CVE id or an artifact, the backend joins the CVE seam
 * (`scan_findings.cve_id` / `artifact_id`) to the per-user download
 * attribution seam (`download_statistics.user_id` / `ip_address`) and
 * answers "who is exposed": the principals that downloaded an affected
 * artifact plus a per-repository classification of how widely each affected
 * repository is reachable. Neither endpoint is in the generated SDK yet, so
 * we use the shared `apiFetch` wrapper and validate responses with zod at
 * the trust boundary (same pattern as audit and downloads).
 *
 * Endpoints (under the admin-guarded router):
 *   GET /api/v1/admin/security/cve/{cve_id}/blast-radius           -> BlastRadiusResponse
 *   GET /api/v1/admin/security/artifact/{artifact_id}/blast-radius -> BlastRadiusResponse
 *
 * Query params (shared): page / per_page (default 20, max 100) over the
 * collapsed downloaders list, optional from / to (inclusive RFC 3339 bounds
 * on downloaded_at). `affected_repos` is bounded to 200 rows server-side and
 * per-downloader IP samples are capped at 50 (counts stay exact).
 */

/** What the report was computed for. */
export interface BlastRadiusTarget {
  /** `cve` or `artifact`. */
  kind: string;
  /** The CVE id or artifact id the report is scoped to. */
  value: string;
}

export interface BlastRadiusSummary {
  /** Affected artifacts downloaded in the window. */
  affected_artifact_count: number;
  /** Repositories holding an affected artifact. */
  affected_repo_count: number;
  /** Distinct authenticated users that downloaded an affected artifact. */
  downloader_user_count: number;
  /** True when at least one download was unauthenticated. */
  anonymous_download_present: boolean;
  /** Distinct client IPs across all downloads of affected artifacts. */
  distinct_ip_count: number;
  /** Total downloads of affected artifacts in the window. */
  total_download_count: number;
}

/**
 * How widely a repository holding an affected artifact is reachable:
 * `public` (anonymous-readable — everyone is exposed), `restricted_acl`
 * (private with explicit repository ACL rows), or `restricted_roles`
 * (private, access only via role assignments/admin). Kept as a plain string
 * so a future scope added server-side degrades to a neutral badge instead of
 * failing the whole response parse.
 */
export type AccessScope = string;

export interface AffectedRepo {
  repository_id: string;
  repository_key: string;
  is_public: boolean;
  access_scope: AccessScope;
}

export interface BlastRadiusDownloader {
  /** Downloader user id; null for the collapsed anonymous principal. */
  user_id: string | null;
  /** Username when the download was authenticated and the user still exists. */
  username: string | null;
  download_count: number;
  distinct_ip_count: number;
  /** Earliest matching download, RFC 3339. */
  first_download: string;
  /** Most recent matching download, RFC 3339. */
  last_download: string;
  /** Sample of client IPs (capped at 50 server-side; counts stay exact). */
  ip_addresses: string[];
}

export interface BlastRadiusResponse {
  target: BlastRadiusTarget;
  summary: BlastRadiusSummary;
  affected_repos: AffectedRepo[];
  downloaders: BlastRadiusDownloader[];
  /** Total collapsed downloader principals (for pagination). */
  total_downloaders: number;
  page: number;
  per_page: number;
}

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
