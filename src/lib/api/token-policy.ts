import { z } from 'zod';
import { ApiError, apiErrorMessage, apiFetch, narrowEnum } from '@/lib/api/fetch';

/**
 * Instance-wide API token expiration policy (backend artifact-keeper#3460,
 * #3625). The endpoints are not in the generated SDK yet (backend 1.10.0,
 * artifact-keeper#3460), so this module uses the shared `apiFetch` wrapper
 * with zod validation at the trust boundary — same pattern as `audit.ts` and
 * `downloads.ts`.
 *
 * The policy is evaluated at mint time only: turning it on never invalidates
 * a token that already exists. The two `non_expiring_*` counters the read
 * endpoint returns are the inventory an operator has to rotate deliberately,
 * which is why the card surfaces them as a to-do rather than a warning about
 * the change itself.
 */

/** Where the effective policy comes from. */
export const TOKEN_POLICY_SOURCES = ['environment', 'database'] as const;
export type TokenPolicySource = (typeof TOKEN_POLICY_SOURCES)[number];

const TOKEN_POLICY_SOURCE_SET = new Set<TokenPolicySource>(TOKEN_POLICY_SOURCES);

/** Hard backend ceiling on any token expiration (`ABSOLUTE_MAX_EXPIRY_DAYS`). */
export const TOKEN_POLICY_MAX_DAYS = 3650;

/** The policy itself, as stored and as served by the admin API. */
export interface ApiTokenExpiryPolicy {
  /** When false the policy is entirely inert (historical behaviour). */
  require_expiration: boolean;
  /** Minimum acceptable `expires_in_days` while enforcing (inclusive). */
  min_days: number;
  /** Maximum acceptable `expires_in_days` while enforcing (inclusive). */
  max_days: number;
  /**
   * Applied when an enforced request omits `expires_in_days`. `null` means
   * such requests are rejected outright instead.
   */
  default_days: number | null;
  /** Whether service-account token mints are subject to the policy. */
  apply_to_service_accounts: boolean;
}

/** `GET`/`PUT /api/v1/admin/settings/token-policy` response. */
export interface TokenPolicySettings {
  policy: ApiTokenExpiryPolicy;
  /**
   * `environment` when the `API_TOKEN_EXPIRATION_*` env vars pin the policy
   * (in which case `PUT` is refused with a 409), `database` otherwise.
   */
  source: TokenPolicySource;
  /** Whether `PUT` can change the policy at all right now. */
  editable: boolean;
  /** Live never-expiring tokens held by regular users. */
  non_expiring_user_tokens: number;
  /** Live never-expiring tokens held by service accounts. */
  non_expiring_service_account_tokens: number;
}

const policySchema = z.object({
  require_expiration: z.boolean(),
  min_days: z.number().int(),
  max_days: z.number().int(),
  // Absent and explicit null both mean "no default" (the backend serializes
  // `Option<i64>`; an older build may omit the key entirely).
  default_days: z.number().int().nullish(),
  apply_to_service_accounts: z.boolean(),
});

const settingsSchema = z.object({
  policy: policySchema,
  source: z.string(),
  editable: z.boolean(),
  non_expiring_user_tokens: z.number(),
  non_expiring_service_account_tokens: z.number(),
});

function adaptSettings(raw: unknown): TokenPolicySettings {
  const parsed = settingsSchema.parse(raw);
  return {
    policy: {
      require_expiration: parsed.policy.require_expiration,
      min_days: parsed.policy.min_days,
      max_days: parsed.policy.max_days,
      default_days: parsed.policy.default_days ?? null,
      apply_to_service_accounts: parsed.policy.apply_to_service_accounts,
    },
    // `source` only drives the "pinned by environment" badge; `editable` is
    // what actually gates the form, so an unmodelled value degrades to
    // `database` (no badge) rather than claiming a pin we can't verify.
    source: narrowEnum(
      parsed.source,
      TOKEN_POLICY_SOURCE_SET,
      'database',
      `tokenPolicyApi: unknown policy source "${parsed.source}" — defaulting to 'database'.`,
    ),
    editable: parsed.editable,
    non_expiring_user_tokens: parsed.non_expiring_user_tokens,
    non_expiring_service_account_tokens: parsed.non_expiring_service_account_tokens,
  };
}

const TOKEN_POLICY_PATH = '/api/v1/admin/settings/token-policy';

/** Query key for the admin token-policy read. */
export const TOKEN_POLICY_QUERY_KEY = ['admin', 'token-policy'] as const;

export const tokenPolicyApi = {
  get: async (): Promise<TokenPolicySettings> => {
    return adaptSettings(await apiFetch<unknown>(TOKEN_POLICY_PATH));
  },

  update: async (policy: ApiTokenExpiryPolicy): Promise<TokenPolicySettings> => {
    const raw = await apiFetch<unknown>(TOKEN_POLICY_PATH, {
      method: 'PUT',
      body: JSON.stringify({ policy }),
    });
    return adaptSettings(raw);
  },
};

// ---------------------------------------------------------------------------
// Token-create responses (#3460 / web #854)
// ---------------------------------------------------------------------------

/**
 * The expiry information every token-create response carries since backend
 * 1.10.0. The pinned `@artifact-keeper/sdk` predates both fields, so the
 * SDK-backed callers (`profile.ts`) read them off the untyped response the
 * same way the `apiFetch`-backed ones (`service-accounts.ts`) do.
 */
export interface TokenExpiryInfo {
  /** ISO-8601 instant the token expires, or null when it never does. */
  expires_at: string | null;
  /**
   * True when the instance policy shaped the mint — it applied a default or
   * enforced the permitted range on the value the caller asked for.
   */
  policy_applied: boolean;
}

const expiryInfoSchema = z.object({
  expires_at: z.string().nullish(),
  policy_applied: z.boolean().nullish(),
});

/**
 * Read `expires_at` / `policy_applied` off a token-create response. A backend
 * that predates 1.10.0 sends neither, which reads as "never expires, no
 * policy" — the historical behaviour — instead of failing the mint.
 */
export function readTokenExpiryInfo(response: unknown): TokenExpiryInfo {
  const parsed = expiryInfoSchema.safeParse(response);
  if (!parsed.success) return { expires_at: null, policy_applied: false };
  return {
    expires_at: parsed.data.expires_at ?? null,
    policy_applied: parsed.data.policy_applied ?? false,
  };
}

/**
 * True when `error` is the 409 the backend answers a `PUT` with while the
 * policy is pinned by the `API_TOKEN_EXPIRATION_*` environment variables.
 * That is a read-only state, not something to retry.
 */
export function isPolicyPinnedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/**
 * The policy field a 400 from `PUT` is about, read off the backend's message
 * (`min_days must be at least 1`, `max_days (…) must be >= min_days (…)`,
 * `default_days (…) must fall within …`). Returns null when the message names
 * no field, so the caller falls back to a card-level error.
 */
export function policyErrorField(
  error: unknown,
): 'min_days' | 'max_days' | 'default_days' | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const match = /\b(min_days|max_days|default_days)\b/.exec(
    apiErrorMessage(error) ?? error.body,
  );
  return (match?.[1] as 'min_days' | 'max_days' | 'default_days') ?? null;
}
