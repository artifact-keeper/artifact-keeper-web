import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Admin client for rate-limit configuration and exemption management
 * (#270, backend issue #680).
 *
 * Rate-limit exemptions were historically configured only through environment
 * variables (`RATE_LIMIT_EXEMPT_USERNAMES`, `RATE_LIMIT_EXEMPT_SERVICE_ACCOUNTS`,
 * `RATE_LIMIT_TRUSTED_CIDRS`). This module talks to the admin endpoints that let
 * an operator view the effective configuration and manage exemptions from the
 * UI. The endpoints are not in the generated SDK, so we use the shared
 * `apiFetch` wrapper and validate responses with zod at the trust boundary.
 *
 * Endpoints (all under the admin-guarded router):
 *   GET    /api/v1/admin/rate-limits                  -> RateLimitConfig
 *   GET    /api/v1/admin/rate-limits/exemptions       -> RateLimitExemption[]
 *   POST   /api/v1/admin/rate-limits/exemptions       -> RateLimitExemption
 *   DELETE /api/v1/admin/rate-limits/exemptions/{id}
 */

export type ExemptionType = "username" | "service_account" | "cidr";

export interface RateLimitExemption {
  id: string;
  /** What the value refers to: a username, a service-account name, or a CIDR. */
  type: ExemptionType;
  /** The exempted value (username, service-account name, or CIDR range). */
  value: string;
  /** Optional operator note explaining why the exemption exists. */
  note?: string;
  /** When the exemption was created, ISO 8601. Optional for env-sourced rows. */
  created_at?: string;
  /**
   * True when the exemption comes from an environment variable and therefore
   * cannot be removed through the UI. Env-sourced rows are shown read-only.
   */
  source_env?: boolean;
}

export interface RateLimitWindow {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  window_secs: number;
}

export interface RateLimitConfig {
  auth: RateLimitWindow;
  api: RateLimitWindow;
  search: RateLimitWindow;
  /** Whether all service accounts are globally exempt (env toggle). */
  exempt_service_accounts: boolean;
}

export interface CreateExemptionRequest {
  type: ExemptionType;
  value: string;
  note?: string;
}

const WindowSchema = z.object({
  limit: z.number(),
  window_secs: z.number(),
});

const RateLimitConfigSchema = z
  .object({
    auth: WindowSchema,
    api: WindowSchema,
    search: WindowSchema,
    exempt_service_accounts: z.boolean(),
  })
  .passthrough();

const ExemptionTypeSchema = z.enum(["username", "service_account", "cidr"]);

const ExemptionSchema = z
  .object({
    id: z.string(),
    type: ExemptionTypeSchema,
    value: z.string(),
    note: z.string().optional(),
    created_at: z.string().optional(),
    source_env: z.boolean().optional(),
  })
  .passthrough();

const ExemptionListSchema = z.union([
  z.array(ExemptionSchema),
  z.object({ exemptions: z.array(ExemptionSchema) }).passthrough(),
]);

export function parseExemptions(data: unknown): RateLimitExemption[] {
  const parsed = ExemptionListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Rate-limit exemptions response did not match the expected shape");
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.exemptions;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    value: r.value,
    note: r.note,
    created_at: r.created_at,
    source_env: r.source_env,
  }));
}

export function parseRateLimitConfig(data: unknown): RateLimitConfig {
  const parsed = RateLimitConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Rate-limit config response did not match the expected shape");
  }
  const c = parsed.data;
  return {
    auth: c.auth,
    api: c.api,
    search: c.search,
    exempt_service_accounts: c.exempt_service_accounts,
  };
}

/**
 * Basic CIDR validation for client-side feedback. Accepts IPv4 and IPv6 with a
 * prefix length. The backend performs authoritative validation; this just keeps
 * obviously malformed input from being submitted.
 */
export function isValidCidr(value: string): boolean {
  const parts = value.trim().split("/");
  if (parts.length !== 2) return false;
  const [addr, prefix] = parts;
  const prefixNum = Number(prefix);
  if (!Number.isInteger(prefixNum) || prefixNum < 0) return false;
  const isIpv6 = addr.includes(":");
  if (isIpv6) {
    return prefixNum <= 128 && /^[0-9a-fA-F:]+$/.test(addr);
  }
  if (prefixNum > 32) return false;
  const octets = addr.split(".");
  if (octets.length !== 4) return false;
  return octets.every((o) => {
    const n = Number(o);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

/** Validate a create request, returning an error message or null if valid. */
export function validateExemption(req: CreateExemptionRequest): string | null {
  const value = req.value.trim();
  if (!value) return "Value is required";
  if (req.type === "cidr" && !isValidCidr(value)) {
    return "Enter a valid CIDR range, for example 10.0.0.0/8 or 2001:db8::/32";
  }
  return null;
}

export const rateLimitsApi = {
  getConfig: async (): Promise<RateLimitConfig> => {
    const data = await apiFetch<unknown>("/api/v1/admin/rate-limits", {
      method: "GET",
    });
    return parseRateLimitConfig(data);
  },

  listExemptions: async (): Promise<RateLimitExemption[]> => {
    const data = await apiFetch<unknown>(
      "/api/v1/admin/rate-limits/exemptions",
      { method: "GET" }
    );
    return parseExemptions(data);
  },

  addExemption: async (
    req: CreateExemptionRequest
  ): Promise<RateLimitExemption> => {
    const data = await apiFetch<unknown>(
      "/api/v1/admin/rate-limits/exemptions",
      {
        method: "POST",
        body: JSON.stringify({
          type: req.type,
          value: req.value.trim(),
          note: req.note?.trim() || undefined,
        }),
      }
    );
    // The create response echoes the stored row; validate it the same way.
    const parsed = ExemptionSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Create exemption response did not match the expected shape");
    }
    return parseExemptions([parsed.data])[0];
  },

  removeExemption: async (id: string): Promise<void> => {
    await apiFetch<void>(
      `/api/v1/admin/rate-limits/exemptions/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  },
};

export default rateLimitsApi;
