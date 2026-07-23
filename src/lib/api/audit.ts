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

// ---------------------------------------------------------------------------
// Export for SIEM (#603 / backend #2413)
// ---------------------------------------------------------------------------
//
// SDK-operation note: the generated `@artifact-keeper/sdk@1.6.0` client was
// inspected for a dedicated audit-export operation. It exposes only
// `listAuditLogs` (GET /api/v1/admin/audit -> AuditLogListResponse); there is
// NO export operation and no schema-version field on the audit types (the only
// `event_schema_version` fields in the SDK belong to webhooks). Because the
// export operation is genuinely absent, we build the export client-side by
// paginating the existing list endpoint through the shared `apiFetch` wrapper
// (same trust-boundary validation as `list`), then format CSV / JSON here.
//
// The JSON export is wrapped in a *versioned structured envelope* so downstream
// SIEM pipelines can key off `schema_version` — mirroring the intent of backend
// #2413's versioned structured schema. Bump this when the envelope shape
// changes in a non-additive way.
export const AUDIT_EXPORT_SCHEMA_VERSION = "1.0";

/** Safety cap on the number of rows a single client-side export will pull. */
export const AUDIT_EXPORT_MAX_ROWS = 50_000;

export const AUDIT_EXPORT_CSV_MIME = "text/csv;charset=utf-8";
export const AUDIT_EXPORT_JSON_MIME = "application/json;charset=utf-8";

export type AuditExportFormat = "csv" | "json";

/**
 * Column order for the flat CSV / structured JSON export. Kept explicit (rather
 * than derived from an item) so the schema is stable and reviewable, and so a
 * new optional field on `AuditLogItem` doesn't silently change the output.
 */
export const AUDIT_EXPORT_COLUMNS = [
  "id",
  "created_at",
  "action",
  "resource_type",
  "resource_id",
  "user_id",
  "actor_username",
  "ip_address",
  "correlation_id",
  "details",
] as const;

export interface AuditExportResult {
  /** Rows collected (bounded by `maxRows`). */
  items: AuditLogItem[];
  /** Total rows matching the filters server-side (may exceed `items.length`). */
  total: number;
  /** True when the export was capped before pulling every matching row. */
  truncated: boolean;
}

export interface AuditExportOptions {
  /** Override the row cap (defaults to `AUDIT_EXPORT_MAX_ROWS`). */
  maxRows?: number;
}

export interface AuditExportMeta {
  /** Active filters, echoed into the JSON envelope for provenance. */
  filters?: AuditLogQuery;
  /** Server-side total matching the filters. */
  total?: number;
  /** Whether the export was capped. */
  truncated?: boolean;
  /** Override the export timestamp (primarily for tests). */
  exportedAt?: string;
}

export interface AuditExportEnvelope {
  schema_version: string;
  exported_at: string;
  filters: Record<string, unknown>;
  count: number;
  total: number;
  truncated: boolean;
  items: AuditLogItem[];
}

function serializeDetails(details: unknown): string {
  if (details == null) return "";
  return typeof details === "string" ? details : JSON.stringify(details);
}

/**
 * Render a single CSV cell (RFC 4180). Two defensive steps, in order:
 *  1. Neutralize spreadsheet formula injection (CWE-1236): a cell that a tool
 *     like Excel would evaluate as a formula (leading `= + - @`, tab or CR) is
 *     prefixed with a single quote. Audit `action`/`details` can carry
 *     attacker-influenced strings, and this export is meant for analyst tools.
 *  2. Quote-and-escape if the value contains a comma, quote, CR or LF.
 */
export function auditCsvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build the flat CSV document (header + one row per event, CRLF-terminated). */
export function auditItemsToCsv(items: AuditLogItem[]): string {
  const header = AUDIT_EXPORT_COLUMNS.join(",");
  const rows = items.map((item) =>
    AUDIT_EXPORT_COLUMNS.map((col) =>
      col === "details"
        ? auditCsvCell(serializeDetails(item.details))
        : auditCsvCell((item as Record<string, unknown>)[col])
    ).join(",")
  );
  // Trailing CRLF so the file ends on a record boundary; empty result still
  // yields a valid header-only document.
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** Strip empty/paging fields so the envelope records only the active filters. */
function normalizeExportFilters(query: AuditLogQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (query.user_id?.trim()) out.user_id = query.user_id.trim();
  if (query.action?.trim()) out.action = query.action.trim();
  if (query.resource_type?.trim()) out.resource_type = query.resource_type.trim();
  if (query.resource_id?.trim()) out.resource_id = query.resource_id.trim();
  if (query.from) out.from = query.from;
  if (query.to) out.to = query.to;
  return out;
}

/** Build the versioned structured JSON envelope (#2413-style schema_version). */
export function buildAuditExportEnvelope(
  items: AuditLogItem[],
  meta: AuditExportMeta = {}
): AuditExportEnvelope {
  return {
    schema_version: AUDIT_EXPORT_SCHEMA_VERSION,
    exported_at: meta.exportedAt ?? new Date().toISOString(),
    filters: normalizeExportFilters(meta.filters ?? {}),
    count: items.length,
    total: meta.total ?? items.length,
    truncated: meta.truncated ?? false,
    items,
  };
}

/** Serialize the versioned JSON export document. */
export function auditItemsToJson(
  items: AuditLogItem[],
  meta: AuditExportMeta = {}
): string {
  return JSON.stringify(buildAuditExportEnvelope(items, meta), null, 2);
}

/** Timestamped, filesystem-safe download filename, e.g. `audit-log-...-.csv`. */
export function buildAuditExportFilename(
  format: AuditExportFormat,
  now: Date = new Date()
): string {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  return `audit-log-${ts}.${format}`;
}

export const auditApi = {
  list: async (query: AuditLogQuery = {}): Promise<AuditLogListResponse> => {
    const data = await apiFetch<unknown>(
      `/api/v1/admin/audit${buildAuditQueryString(query)}`,
      { method: "GET" }
    );
    return parseAuditLogList(data);
  },

  /**
   * Collect every audit event matching `query` for export, honoring the same
   * filters as `list` but ignoring caller-supplied paging — it walks pages at
   * the backend max page size until it has every matching row or hits the
   * `maxRows` safety cap (large-export guard). Returns the rows plus the
   * server-side total and whether the result was truncated.
   */
  export: async (
    query: AuditLogQuery = {},
    options: AuditExportOptions = {}
  ): Promise<AuditExportResult> => {
    const maxRows = Math.max(1, options.maxRows ?? AUDIT_EXPORT_MAX_ROWS);
    // Drop caller paging; we drive pagination ourselves.
    const filters: AuditLogQuery = { ...query };
    delete filters.page;
    delete filters.per_page;

    const items: AuditLogItem[] = [];
    let total = 0;
    let page = 1;

    for (;;) {
      const res = await auditApi.list({
        ...filters,
        page,
        per_page: AUDIT_MAX_PER_PAGE,
      });
      total = res.total;

      for (const item of res.items) {
        if (items.length >= maxRows) break;
        items.push(item);
      }

      const drainedPage = res.items.length < AUDIT_MAX_PER_PAGE;
      if (
        drainedPage ||
        res.items.length === 0 ||
        items.length >= maxRows ||
        items.length >= total
      ) {
        break;
      }
      page += 1;
    }

    return { items, total, truncated: items.length < total };
  },
};

export default auditApi;
