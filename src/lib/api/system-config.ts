import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Client for the public runtime configuration endpoint
 * (`GET /api/v1/system/config`, backend issue #496).
 *
 * The endpoint requires no authentication and exposes only non-sensitive
 * values that let the frontend adapt its behavior: upload limits, enabled
 * integrations (scanners, auth providers), the storage and search backends,
 * and feature flags. It is not modeled in the generated SDK yet, so we hit it
 * through the shared `apiFetch` wrapper and validate the response with zod at
 * the trust boundary.
 */

export interface ScannersConfig {
  trivy_enabled: boolean;
  openscap_enabled: boolean;
  dependency_track_enabled: boolean;
}

export interface AuthProvidersConfig {
  oidc_enabled: boolean;
  ldap_enabled: boolean;
  sso_enabled: boolean;
}

export interface PermissionsConfig {
  rules_exist: boolean;
  enforcement_enabled: boolean;
}

export interface SystemConfig {
  max_upload_size_bytes: number;
  demo_mode: boolean;
  guest_access_enabled: boolean;
  scanners: ScannersConfig;
  search_engine: string;
  storage_backend: string;
  auth: AuthProvidersConfig;
  oidc_issuer?: string;
  permissions: PermissionsConfig;
}

const ScannersSchema = z.object({
  trivy_enabled: z.boolean(),
  openscap_enabled: z.boolean(),
  dependency_track_enabled: z.boolean(),
});

const AuthSchema = z.object({
  oidc_enabled: z.boolean(),
  ldap_enabled: z.boolean(),
  sso_enabled: z.boolean(),
});

const PermissionsSchema = z.object({
  rules_exist: z.boolean(),
  enforcement_enabled: z.boolean(),
});

// `.passthrough()` keeps the parser forward-compatible: a backend that adds new
// config fields in a later release will not fail validation here, the new
// fields are simply ignored until the web app models them.
const SystemConfigSchema = z
  .object({
    max_upload_size_bytes: z.number(),
    demo_mode: z.boolean(),
    guest_access_enabled: z.boolean(),
    scanners: ScannersSchema,
    search_engine: z.string(),
    storage_backend: z.string(),
    auth: AuthSchema,
    oidc_issuer: z.string().optional(),
    permissions: PermissionsSchema,
  })
  .passthrough();

/**
 * Default config used before the real response arrives or when the endpoint is
 * unavailable. Defaults are deliberately permissive (everything that affects
 * navigation visibility defaults to enabled) so a transient fetch failure never
 * hides a feature the operator actually configured. Scanner-gated surfaces are
 * the exception: they default to disabled because showing an empty scanner tab
 * is a worse experience than briefly hiding it, and the data behind those tabs
 * is itself fetched with its own error handling.
 */
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  max_upload_size_bytes: 0,
  demo_mode: false,
  guest_access_enabled: true,
  scanners: {
    trivy_enabled: false,
    openscap_enabled: false,
    dependency_track_enabled: false,
  },
  search_engine: "database",
  storage_backend: "filesystem",
  auth: {
    oidc_enabled: false,
    ldap_enabled: false,
    sso_enabled: false,
  },
  permissions: {
    rules_exist: false,
    enforcement_enabled: false,
  },
};

export function parseSystemConfig(data: unknown): SystemConfig {
  const parsed = SystemConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      "System config response did not match the expected shape"
    );
  }
  const c = parsed.data;
  return {
    max_upload_size_bytes: c.max_upload_size_bytes,
    demo_mode: c.demo_mode,
    guest_access_enabled: c.guest_access_enabled,
    scanners: c.scanners,
    search_engine: c.search_engine,
    storage_backend: c.storage_backend,
    auth: c.auth,
    oidc_issuer: c.oidc_issuer,
    permissions: c.permissions,
  };
}

/** True when any vulnerability/compliance scanner integration is configured. */
export function anyScannerEnabled(config: SystemConfig): boolean {
  return (
    config.scanners.trivy_enabled ||
    config.scanners.openscap_enabled ||
    config.scanners.dependency_track_enabled
  );
}

export const systemConfigApi = {
  /**
   * Fetch public runtime configuration. Throws on network error or an
   * unparseable response so callers can decide whether to fall back to
   * `DEFAULT_SYSTEM_CONFIG`.
   */
  getConfig: async (): Promise<SystemConfig> => {
    const data = await apiFetch<unknown>("/api/v1/system/config", {
      method: "GET",
    });
    return parseSystemConfig(data);
  },
};

export default systemConfigApi;
