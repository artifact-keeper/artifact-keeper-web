import '@/lib/sdk-client';
import {
  getSystemStats,
  listUsers,
  healthCheck,
  listUserTokens as sdkListUserTokens,
  revokeUserApiToken as sdkRevokeUserApiToken,
} from '@artifact-keeper/sdk';
import type {
  SystemStats,
  AdminUserResponse,
  HealthResponse as SdkHealthResponse,
  CheckStatus,
  ApiTokenResponse,
} from '@artifact-keeper/sdk';
import type { AdminStats, User, HealthResponse } from '@/types';
import type { ApiKey } from '@/lib/api/profile';
import { assertData } from '@/lib/api/fetch';
import { unwrap } from '@/lib/sdk-utils';

// SystemStats has a strict superset of AdminStats fields; pass through directly.
function adaptStats(sdk: SystemStats): AdminStats {
  return {
    total_repositories: sdk.total_repositories,
    total_artifacts: sdk.total_artifacts,
    total_storage_bytes: sdk.total_storage_bytes,
    total_users: sdk.total_users,
  };
}

function adaptUser(sdk: AdminUserResponse): User {
  return {
    id: sdk.id,
    username: sdk.username,
    email: sdk.email,
    display_name: sdk.display_name ?? undefined,
    is_admin: sdk.is_admin,
    is_active: sdk.is_active,
    must_change_password: sdk.must_change_password,
    auth_provider: sdk.auth_provider,
  };
}

function adaptCheck(c: CheckStatus | null | undefined): { status: string; message?: string } | undefined {
  if (!c) return undefined;
  return { status: c.status, message: c.message ?? undefined };
}

// On a non-2xx /health response the SDK returns the parsed body as `error`.
// A degraded backend still includes the version and check details, so detect
// the HealthResponse shape and use it rather than discarding the version.
function isSdkHealthResponse(value: unknown): value is SdkHealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === 'string' && typeof v.checks === 'object' && v.checks !== null;
}

function adaptHealth(sdk: SdkHealthResponse): HealthResponse {
  const database = adaptCheck(sdk.checks.database) ?? { status: 'unknown' };
  const storage = adaptCheck(sdk.checks.storage) ?? { status: 'unknown' };
  // Backend 1.2.x renamed the search-engine health check from `meilisearch`
  // to `opensearch`, and the 1.2.x SDK types now model `opensearch` natively.
  // Older backends still report `meilisearch` at runtime, so read that legacy
  // field via passthrough and fall back to it. Either field maps onto the
  // single local `opensearch` check so the dashboard "Search Engine" card
  // keeps rendering across both backend versions.
  const legacyChecks = sdk.checks as typeof sdk.checks & {
    meilisearch?: CheckStatus | null;
  };
  const searchEngine = adaptCheck(sdk.checks.opensearch ?? legacyChecks.meilisearch);
  return {
    status: sdk.status,
    version: sdk.version,
    commit: sdk.commit ?? undefined,
    dirty: sdk.dirty ?? undefined,
    checks: {
      database,
      storage,
      security_scanner: adaptCheck(sdk.checks.security_scanner),
      opensearch: searchEngine,
      meilisearch: searchEngine,
    },
  };
}

// SDK ApiTokenResponse → local ApiKey: SDK uses `token_prefix`, local uses
// `key_prefix`; SDK uses `null | undefined` for optional fields, local uses
// just `undefined`.
function adaptApiKey(sdk: ApiTokenResponse): ApiKey {
  return {
    id: sdk.id,
    name: sdk.name,
    key_prefix: sdk.token_prefix,
    created_at: sdk.created_at,
    expires_at: sdk.expires_at ?? undefined,
    last_used_at: sdk.last_used_at ?? undefined,
    scopes: sdk.scopes,
  };
}

export interface ListUsersParams {
  page?: number;
  perPage?: number;
  /** Server-side filter on username, email, or display name (ILIKE). */
  search?: string;
}

export interface ListUsersResult {
  items: User[];
  /** Total matching users across all pages, from the pagination envelope. */
  total: number;
}

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const data = await unwrap(getSystemStats());
    return adaptStats(assertData(data, 'adminApi.getStats'));
  },

  listUsers: async (params: ListUsersParams = {}): Promise<User[]> => {
    const result = await adminApi.listUsersPage(params);
    return result.items;
  },

  listUsersPage: async (params: ListUsersParams = {}): Promise<ListUsersResult> => {
    const data = await unwrap(listUsers({
      query: {
        page: params.page,
        per_page: params.perPage,
        search: params.search?.trim() || undefined,
      },
    }));
    const response = assertData(data, 'adminApi.listUsersPage');
    return {
      items: response.items.map(adaptUser),
      total: response.pagination.total,
    };
  },

  getHealth: async (): Promise<HealthResponse> => {
    const { data, error } = await healthCheck();
    // The backend returns 503 with a full HealthResponse body (including the
    // version) when a dependency is degraded. The SDK surfaces that body as
    // `error`. Adapt it so the reported version stays visible even when the
    // service is unhealthy (#456).
    if (error) {
      if (isSdkHealthResponse(error)) {
        return adaptHealth(error);
      }
      throw error;
    }
    return adaptHealth(assertData(data, 'adminApi.getHealth'));
  },

  listUserTokens: async (userId: string): Promise<ApiKey[]> => {
    const data = await unwrap(sdkListUserTokens({ path: { id: userId } }));
    return (data?.items ?? []).map(adaptApiKey);
  },

  revokeUserToken: async (userId: string, tokenId: string): Promise<void> => {
    await unwrap(sdkRevokeUserApiToken({
      path: { id: userId, token_id: tokenId },
    }));
  },
};

