import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";
import type { AuditLogItem, AuditLogListResponse } from "@artifact-keeper/sdk";

// Re-export the generated SDK types so callers keep importing them from this
// module. The response shapes now live in `@artifact-keeper/sdk` (regenerated
// from the OpenAPI spec); the zod schema below still validates at the trust
// boundary before we hand data back typed as these.
export type { AuditLogItem, AuditLogListResponse };

/**
 * Admin client for the audit-log query endpoint (#568, backend issue #2366).
 *
 * The backend records audit events (logins, user/repository/artifact changes,
 * token lifecycle, ...) in the `audit_log` table and exposes them to
 * administrators via a single read endpoint. The endpoint is not in the
 * generated SDK yet, so we use the shared `apiFetch` wrapper and validate
 * responses with zod at the trust boundary (same pattern as rate-limits).
 *
 * Endpoint (under the admin-guarded router):
 *   GET /api/v1/admin/audit -> AuditLogListResponse
 *
 * Query filters: user_id, action, resource_type, resource_id (exact match),
 * from / to (inclusive RFC 3339 bounds), page / per_page (default 50, max 200).
 * Results are ordered newest-first by the backend.
 */

export interface AuditLogQuery {
  /** Filter by acting user id (UUID). */
  user_id?: string;
  /** Filter by action string. */
  action?: string;
  /** Filter by resource type. */
  resource_type?: string;
  /** Filter by affected resource id (UUID). */
  resource_id?: string;
  /** Inclusive lower time bound, RFC 3339. */
  from?: string;
  /** Inclusive upper time bound, RFC 3339. */
  to?: string;
  /** 1-based page index (default 1). */
  page?: number;
  /** Page size (backend default 50, max 200). */
  per_page?: number;
}

/** Backend hard cap on `per_page` (#2366). */
export const AUDIT_MAX_PER_PAGE = 200;
/** Backend default page size (#2366). */
export const AUDIT_DEFAULT_PER_PAGE = 50;

const AuditLogItemSchema = z
  .object({
    id: z.string(),
    user_id: z.string().nullish(),
    /** Username of the acting user, embedded server-side (#2392). */
    actor_username: z.string().nullish(),
    action: z.string(),
    resource_type: z.string(),
    resource_id: z.string().nullish(),
    details: z.unknown().optional(),
    ip_address: z.string().nullish(),
    correlation_id: z.string(),
    created_at: z.string(),
  })
  .passthrough();

const AuditLogListSchema = z
  .object({
    items: z.array(AuditLogItemSchema),
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
  })
  .passthrough();

export function parseAuditLogList(data: unknown): AuditLogListResponse {
  const parsed = AuditLogListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Audit log response did not match the expected shape");
  }
  return {
    items: parsed.data.items.map((r) => ({
      id: r.id,
      user_id: r.user_id ?? null,
      actor_username: r.actor_username ?? null,
      action: r.action,
      resource_type: r.resource_type,
      resource_id: r.resource_id ?? null,
      details: r.details ?? null,
      ip_address: r.ip_address ?? null,
      correlation_id: r.correlation_id,
      created_at: r.created_at,
    })),
    total: parsed.data.total,
    page: parsed.data.page,
    per_page: parsed.data.per_page,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Basic UUID validation for client-side feedback. The backend deserializes
 * `user_id` / `resource_id` as UUIDs and rejects the whole request with a 400
 * on malformed input, so catching it before submitting gives a friendlier
 * error than a failed query.
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Build the query string for the audit endpoint, omitting empty filters. */
export function buildAuditQueryString(query: AuditLogQuery): string {
  const params = new URLSearchParams();
  if (query.user_id?.trim()) params.set("user_id", query.user_id.trim());
  if (query.action?.trim()) params.set("action", query.action.trim());
  if (query.resource_type?.trim())
    params.set("resource_type", query.resource_type.trim());
  if (query.resource_id?.trim())
    params.set("resource_id", query.resource_id.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page != null) params.set("page", String(Math.max(1, query.page)));
  if (query.per_page != null) {
    params.set(
      "per_page",
      String(Math.min(Math.max(1, query.per_page), AUDIT_MAX_PER_PAGE))
    );
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const auditApi = {
  list: async (query: AuditLogQuery = {}): Promise<AuditLogListResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/audit${buildAuditQueryString(query)}`,
      { method: "GET" }
    );
    return parseAuditLogList(data);
  },
};

export default auditApi;
