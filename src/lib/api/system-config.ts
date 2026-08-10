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
  /**
   * Whether the login page should offer the local username/password form
   * (backend issue #2621). True when no SSO provider is enabled; with SSO
   * enabled it is true only when the operator set `ALLOW_LOCAL_ADMIN_LOGIN`
   * and did not set `SSO_DISABLE_ADMIN_BREAK_GLASS` (which takes precedence,
   * backend #2018).
   *
   * Display-only, and deliberately NARROWER than the login-time policy in
   * `api::handlers::auth::local_login_gate`. Under SSO a verified admin keeps
   * a break-glass password path by default (backend #443) that this flag never
   * advertises, so `false` means "do not offer the form", not "the server will
   * reject every local credential". That asymmetry is why `?fallback=local`
   * remains a real recovery path for admins. The flag never grants access on
   * its own: the login endpoint enforces its own policy server-side.
   */
  local_login_enabled: boolean;
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
  // Added by the backend in artifact-keeper#2729. Older backends omit it, so
  // it is optional and defaults to true: assuming local login works costs at
  // worst a rejected sign-in attempt (the backend enforces the policy itself),
  // while assuming it is disabled would hide the only form those deployments
  // have and lock the operator out.
  local_login_enabled: z.boolean().default(true),
});

const PermissionsSchema = z.object({
  rules_exist: z.boolean(),
  enforcement_enabled: z.boolean(),
});

/**
 * Values substituted for the security-posture fields when the backend leaves
 * them out.
 *
 * `scanners`, `search_engine`, `storage_backend` and `permissions` became
 * admin-only in backend #1960: they are `Option<T>` with
 * `skip_serializing_if = "Option::is_none"` and the handler sets every one to
 * `None` for anonymous and non-admin callers, so they are absent from the JSON
 * rather than null. Treating them as required made the whole parse fail for
 * every unauthenticated caller, which took the public-safe fields (`auth`,
 * upload limits, guest access) down with them.
 *
 * The object-valued entries are getters so each parse gets its own instance
 * and no consumer can mutate a shared default.
 */
const ADMIN_ONLY_FALLBACKS = {
  scanners: (): ScannersConfig => ({
    trivy_enabled: false,
    openscap_enabled: false,
    dependency_track_enabled: false,
  }),
  search_engine: "database",
  storage_backend: "filesystem",
  permissions: (): PermissionsConfig => ({
    rules_exist: false,
    enforcement_enabled: false,
  }),
};

// `.passthrough()` keeps the parser forward-compatible: a backend that adds new
// config fields in a later release will not fail validation here, the new
// fields are simply ignored until the web app models them. (`plugin_signing`,
// the fifth admin-only field, is unmodeled and lands here.)
const SystemConfigSchema = z
  .object({
    max_upload_size_bytes: z.number(),
    demo_mode: z.boolean(),
    guest_access_enabled: z.boolean(),
    scanners: ScannersSchema.default(ADMIN_ONLY_FALLBACKS.scanners),
    search_engine: z.string().default(ADMIN_ONLY_FALLBACKS.search_engine),
    storage_backend: z.string().default(ADMIN_ONLY_FALLBACKS.storage_backend),
    auth: AuthSchema,
    oidc_issuer: z.string().optional(),
    permissions: PermissionsSchema.default(ADMIN_ONLY_FALLBACKS.permissions),
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
  scanners: ADMIN_ONLY_FALLBACKS.scanners(),
  search_engine: ADMIN_ONLY_FALLBACKS.search_engine,
  storage_backend: ADMIN_ONLY_FALLBACKS.storage_backend,
  auth: {
    oidc_enabled: false,
    ldap_enabled: false,
    sso_enabled: false,
    // Permissive for the same reason as the schema default: if the config
    // endpoint is unreachable the login page must still render a usable form.
    local_login_enabled: true,
  },
  permissions: ADMIN_ONLY_FALLBACKS.permissions(),
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

/**
 * How long to wait for the config endpoint before giving up.
 *
 * `apiFetch` sets no timeout, so a request that hangs rather than fails (a
 * proxy black-holing the connection, a half-open socket, stalled ingress)
 * never settles. The login page blocks its form decision on this query, so an
 * unbounded request means a permanent spinner. Timing out turns that hang into
 * an ordinary error, and the provider then falls back to
 * `DEFAULT_SYSTEM_CONFIG`, which is permissive. Failing open on a slow network
 * is the safe direction here: the backend enforces the login policy itself.
 */
export const SYSTEM_CONFIG_TIMEOUT_MS = 10_000;

export const systemConfigApi = {
  /**
   * Fetch public runtime configuration. Throws on network error, timeout, or an
   * unparseable response so callers can decide whether to fall back to
   * `DEFAULT_SYSTEM_CONFIG`.
   */
  getConfig: async (): Promise<SystemConfig> => {
    const data = await apiFetch<unknown>("/api/v1/system/config", {
      method: "GET",
      signal: AbortSignal.timeout(SYSTEM_CONFIG_TIMEOUT_MS),
    });
    return parseSystemConfig(data);
  },
};

