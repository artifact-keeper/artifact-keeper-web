import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Admin client for the download-attribution endpoints (#569, backend #2365).
 *
 * The backend records every download in `download_statistics` with the real
 * client IP (trusted-proxy-aware), the authenticated user (null for
 * anonymous), and the user agent, and exposes them to administrators through
 * three read endpoints. None of them are in the generated SDK yet, so we use
 * the shared `apiFetch` wrapper and validate responses with zod at the trust
 * boundary (same pattern as rate-limits and audit).
 *
 * Endpoints (under the admin-guarded router):
 *   GET /api/v1/admin/downloads                    -> DownloadListResponse
 *   GET /api/v1/admin/downloads/by-ip/{ip}         -> DownloadListResponse
 *   GET /api/v1/admin/downloads/by-user/{user_id}  -> DownloadListResponse
 *
 * Query filters (shared by all three): artifact_id, user_id, ip (exact
 * match), from / to (inclusive RFC 3339 bounds on downloaded_at), page /
 * per_page (default 20, max 100). Results are ordered newest-first. On the
 * by-ip / by-user endpoints the path parameter overrides the corresponding
 * query filter.
 */

export interface DownloadRecord {
  /** Downloaded artifact id (UUID). The response carries no artifact name. */
  artifact_id: string;
  /** Downloader user id; null for anonymous downloads and legacy rows. */
  user_id: string | null;
  /**
   * Username of the downloader, when the download was authenticated and the
   * user still exists.
   */
  username: string | null;
  /** Resolved client IP; null for legacy rows and unresolvable clients. */
  ip_address: string | null;
  user_agent: string | null;
  /** When the download happened, RFC 3339. */
  downloaded_at: string;
}

export interface DownloadListResponse {
  downloads: DownloadRecord[];
  total: number;
  page: number;
  per_page: number;
}

export interface DownloadsQuery {
  /** Filter to downloads of one artifact (UUID). */
  artifact_id?: string;
  /** Filter to downloads by one user (UUID). */
  user_id?: string;
  /** Filter to downloads from one client IP (exact match). */
  ip?: string;
  /** Inclusive lower bound on downloaded_at, RFC 3339. */
  from?: string;
  /** Inclusive upper bound on downloaded_at, RFC 3339. */
  to?: string;
  /** 1-based page index (default 1). */
  page?: number;
  /** Page size (backend default 20, max 100). */
  per_page?: number;
}

/** Backend hard cap on `per_page` (#2365). */
export const DOWNLOADS_MAX_PER_PAGE = 100;
/** Backend default page size (#2365). */
export const DOWNLOADS_DEFAULT_PER_PAGE = 20;

const DownloadRecordSchema = z
  .object({
    artifact_id: z.string(),
    user_id: z.string().nullish(),
    username: z.string().nullish(),
    ip_address: z.string().nullish(),
    user_agent: z.string().nullish(),
    downloaded_at: z.string(),
  })
  .passthrough();

const DownloadListSchema = z
  .object({
    downloads: z.array(DownloadRecordSchema),
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
  })
  .passthrough();

export function parseDownloadList(data: unknown): DownloadListResponse {
  const parsed = DownloadListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Download list response did not match the expected shape");
  }
  return {
    downloads: parsed.data.downloads.map((r) => ({
      artifact_id: r.artifact_id,
      user_id: r.user_id ?? null,
      username: r.username ?? null,
      ip_address: r.ip_address ?? null,
      user_agent: r.user_agent ?? null,
      downloaded_at: r.downloaded_at,
    })),
    total: parsed.data.total,
    page: parsed.data.page,
    per_page: parsed.data.per_page,
  };
}

/** Build the query string for the downloads endpoints, omitting empty filters. */
export function buildDownloadsQueryString(query: DownloadsQuery): string {
  const params = new URLSearchParams();
  if (query.artifact_id?.trim())
    params.set("artifact_id", query.artifact_id.trim());
  if (query.user_id?.trim()) params.set("user_id", query.user_id.trim());
  if (query.ip?.trim()) params.set("ip", query.ip.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page != null) params.set("page", String(Math.max(1, query.page)));
  if (query.per_page != null) {
    params.set(
      "per_page",
      String(Math.min(Math.max(1, query.per_page), DOWNLOADS_MAX_PER_PAGE))
    );
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Network-topology grouping helpers (pure; computed client-side over a page
// of attributed events — the backend endpoints return rows, not aggregates)
// ---------------------------------------------------------------------------

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Expand a textual IPv6 address into its 8 hextets, or null if malformed. */
function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.toLowerCase());
}

export const UNKNOWN_NETWORK = "unknown";

/**
 * Map a client IP to its display subnet: /24 for IPv4, /64 for IPv6. This is
 * the "which corner of the network" grouping key for the topology view.
 * Unresolvable / missing IPs group under {@link UNKNOWN_NETWORK}.
 */
export function subnetOf(ip: string | null): string {
  if (!ip) return UNKNOWN_NETWORK;
  const v4 = IPV4_RE.exec(ip.trim());
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.every((o) => o <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    return UNKNOWN_NETWORK;
  }
  if (ip.includes(":")) {
    const groups = expandIpv6(ip.trim());
    if (groups) return `${groups.slice(0, 4).join(":")}::/64`;
  }
  return UNKNOWN_NETWORK;
}

export interface IpGroup {
  /** Client IP, or {@link UNKNOWN_NETWORK} for rows without one. */
  ip: string;
  /** Display subnet (/24 or /64) the IP belongs to. */
  subnet: string;
  downloads: number;
  /** Distinct authenticated users seen from this IP. */
  unique_users: number;
  /** Distinct artifacts pulled from this IP. */
  unique_artifacts: number;
  /** True when at least one download from this IP was anonymous. */
  has_anonymous: boolean;
  /** Most recent downloaded_at from this IP, RFC 3339. */
  last_downloaded_at: string;
}

export interface UserGroup {
  /** User id, or null for the aggregated anonymous bucket. */
  user_id: string | null;
  /** Username when known; null for anonymous / deleted users. */
  username: string | null;
  downloads: number;
  /** Distinct client IPs this user pulled from. */
  unique_ips: number;
  /** Distinct artifacts this user pulled. */
  unique_artifacts: number;
  /** Most recent downloaded_at for this user, RFC 3339. */
  last_downloaded_at: string;
}

/**
 * Group attributed download events by client IP ("what did each network
 * location pull?"). Sorted by download count descending, then by IP.
 */
export function groupDownloadsByIp(records: DownloadRecord[]): IpGroup[] {
  const byIp = new Map<
    string,
    { users: Set<string>; artifacts: Set<string>; g: IpGroup }
  >();
  for (const r of records) {
    const key = r.ip_address ?? UNKNOWN_NETWORK;
    let entry = byIp.get(key);
    if (!entry) {
      entry = {
        users: new Set(),
        artifacts: new Set(),
        g: {
          ip: key,
          subnet: subnetOf(r.ip_address),
          downloads: 0,
          unique_users: 0,
          unique_artifacts: 0,
          has_anonymous: false,
          last_downloaded_at: r.downloaded_at,
        },
      };
      byIp.set(key, entry);
    }
    entry.g.downloads += 1;
    if (r.user_id) entry.users.add(r.user_id);
    else entry.g.has_anonymous = true;
    entry.artifacts.add(r.artifact_id);
    if (r.downloaded_at > entry.g.last_downloaded_at) {
      entry.g.last_downloaded_at = r.downloaded_at;
    }
  }
  return [...byIp.values()]
    .map((e) => ({
      ...e.g,
      unique_users: e.users.size,
      unique_artifacts: e.artifacts.size,
    }))
    .sort((a, b) => b.downloads - a.downloads || a.ip.localeCompare(b.ip));
}

/**
 * Group attributed download events by user ("what did each user pull?").
 * Anonymous downloads aggregate into a single `user_id: null` bucket.
 * Sorted by download count descending, then by username.
 */
export function groupDownloadsByUser(records: DownloadRecord[]): UserGroup[] {
  const byUser = new Map<
    string,
    { ips: Set<string>; artifacts: Set<string>; g: UserGroup }
  >();
  for (const r of records) {
    const key = r.user_id ?? "";
    let entry = byUser.get(key);
    if (!entry) {
      entry = {
        ips: new Set(),
        artifacts: new Set(),
        g: {
          user_id: r.user_id,
          username: r.user_id ? r.username : null,
          downloads: 0,
          unique_ips: 0,
          unique_artifacts: 0,
          last_downloaded_at: r.downloaded_at,
        },
      };
      byUser.set(key, entry);
    }
    entry.g.downloads += 1;
    if (r.ip_address) entry.ips.add(r.ip_address);
    entry.artifacts.add(r.artifact_id);
    if (!entry.g.username && r.user_id) entry.g.username = r.username;
    if (r.downloaded_at > entry.g.last_downloaded_at) {
      entry.g.last_downloaded_at = r.downloaded_at;
    }
  }
  return [...byUser.values()]
    .map((e) => ({
      ...e.g,
      unique_ips: e.ips.size,
      unique_artifacts: e.artifacts.size,
    }))
    .sort(
      (a, b) =>
        b.downloads - a.downloads ||
        (a.username ?? "").localeCompare(b.username ?? "")
    );
}

export const downloadsApi = {
  /** List attributed download events, filterable and paginated. */
  list: async (query: DownloadsQuery = {}): Promise<DownloadListResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/downloads${buildDownloadsQueryString(query)}`,
      { method: "GET" }
    );
    return parseDownloadList(data);
  },

  /** Downloads originating from one client IP: what did this network location pull? */
  listByIp: async (
    ip: string,
    query: Omit<DownloadsQuery, "ip"> = {}
  ): Promise<DownloadListResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/downloads/by-ip/${encodeURIComponent(
        ip.trim()
      )}${buildDownloadsQueryString(query)}`,
      { method: "GET" }
    );
    return parseDownloadList(data);
  },

  /** Downloads performed by one user: what did this user pull? */
  listByUser: async (
    userId: string,
    query: Omit<DownloadsQuery, "user_id"> = {}
  ): Promise<DownloadListResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/downloads/by-user/${encodeURIComponent(
        userId.trim()
      )}${buildDownloadsQueryString(query)}`,
      { method: "GET" }
    );
    return parseDownloadList(data);
  },
};

export default downloadsApi;
