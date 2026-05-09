import '@/lib/sdk-client';
import {
  getCurrentUser as sdkGetCurrentUser,
  updateUser as sdkUpdateUser,
  listUserTokens as sdkListUserTokens,
  createApiToken as sdkCreateApiToken,
  revokeApiToken as sdkRevokeApiToken,
} from '@artifact-keeper/sdk';
import type {
  UserResponse as SdkUserResponse,
  AdminUserResponse,
  ApiTokenResponse,
  CreateApiTokenRequest as SdkCreateApiTokenRequest,
  CreateApiTokenResponse as SdkCreateApiTokenResponse,
  UpdateUserRequest as SdkUpdateUserRequest,
} from '@artifact-keeper/sdk';
import type { User } from '@/types';
import type { RepoSelector } from '@/lib/api/service-accounts';
import { assertData } from '@/lib/api/fetch';

export interface UpdateProfileRequest {
  display_name?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  scopes?: string[];
}

export interface CreateApiKeyRequest {
  name: string;
  expires_in_days?: number;
  scopes?: string[];
}

export interface CreateApiKeyResponse {
  id: string;
  token: string; // Full key, only shown once
  name: string;
}

export interface AccessToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  scopes?: string[];
  repo_selector?: RepoSelector;
  repository_ids?: string[];
}

export interface CreateAccessTokenRequest {
  name: string;
  expires_in_days?: number;
  scopes?: string[];
  repo_selector?: RepoSelector;
}

export interface CreateAccessTokenResponse {
  id: string;
  token: string; // Full token, only shown once
  name: string;
}

function adaptUser(sdk: SdkUserResponse | AdminUserResponse): User {
  // AdminUserResponse has extra fields (is_active, must_change_password, etc.);
  // include them when present so getCurrentUser keeps existing behavior.
  const is_active = 'is_active' in sdk ? sdk.is_active : undefined;
  const must_change_password = 'must_change_password' in sdk ? sdk.must_change_password : undefined;
  const auth_provider = 'auth_provider' in sdk ? sdk.auth_provider : undefined;
  const totp_enabled = 'totp_enabled' in sdk ? sdk.totp_enabled : undefined;
  return {
    id: sdk.id,
    username: sdk.username,
    email: sdk.email,
    display_name: sdk.display_name ?? undefined,
    is_admin: sdk.is_admin,
    is_active,
    must_change_password,
    auth_provider,
    totp_enabled,
  };
}

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

// SDK ApiTokenResponse doesn't expose repo_selector / repository_ids so the
// caller-visible AccessToken just carries forward the same data we have for
// API keys, with token_prefix mapped 1:1.
function adaptAccessToken(sdk: ApiTokenResponse): AccessToken {
  return {
    id: sdk.id,
    name: sdk.name,
    token_prefix: sdk.token_prefix,
    created_at: sdk.created_at,
    expires_at: sdk.expires_at ?? undefined,
    last_used_at: sdk.last_used_at ?? undefined,
    scopes: sdk.scopes,
  };
}

function adaptCreateApiKey(sdk: SdkCreateApiTokenResponse): CreateApiKeyResponse {
  return { id: sdk.id, token: sdk.token, name: sdk.name };
}

export const profileApi = {
  get: async (): Promise<User> => {
    const { data, error } = await sdkGetCurrentUser();
    if (error) throw error;
    return adaptUser(assertData(data, 'profileApi.get'));
  },

  update: async (reqData: UpdateProfileRequest): Promise<User> => {
    // getCurrentUser to get the user id, then updateUser
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const meData = assertData(me, 'profileApi.update.me');
    // SDK UpdateUserRequest doesn't model password change fields; the backend
    // still accepts them when present, so widen the body type for this one
    // call until the SDK exposes a profile-specific endpoint.
    const body = {
      display_name: reqData.display_name,
      email: reqData.email,
      current_password: reqData.current_password,
      new_password: reqData.new_password,
    } satisfies SdkUpdateUserRequest & {
      current_password?: string;
      new_password?: string;
    };
    const { data, error } = await sdkUpdateUser({
      path: { id: meData.id },
      body,
    });
    if (error) throw error;
    return adaptUser(assertData(data, 'profileApi.update'));
  },

  // API Keys
  listApiKeys: async (): Promise<ApiKey[]> => {
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const meData = assertData(me, 'profileApi.listApiKeys.me');
    const { data, error } = await sdkListUserTokens({ path: { id: meData.id } });
    if (error) throw error;
    // The SDK contract is { items: ApiTokenResponse[] } — use assertData to
    // surface a missing wrapper (empty body, network proxy strip, etc.) and
    // tolerate a wrapper with no `items` field as an empty list.
    const wrapper = assertData(data, 'profileApi.listApiKeys');
    return (wrapper.items ?? []).map(adaptApiKey);
  },

  createApiKey: async (reqData: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    // Omit `scopes` entirely when the caller didn't pass it — the backend
    // treats `[]` and "not provided" differently for token creation.
    const body: SdkCreateApiTokenRequest = {
      name: reqData.name,
      expires_in_days: reqData.expires_in_days,
      ...(reqData.scopes !== undefined ? { scopes: reqData.scopes } : {}),
    };
    const { data, error } = await sdkCreateApiToken({ body });
    if (error) throw error;
    return adaptCreateApiKey(assertData(data, 'profileApi.createApiKey'));
  },

  deleteApiKey: async (keyId: string): Promise<void> => {
    const { error } = await sdkRevokeApiToken({ path: { token_id: keyId } });
    if (error) throw error;
  },

  // Access Tokens
  listAccessTokens: async (): Promise<AccessToken[]> => {
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const meData = assertData(me, 'profileApi.listAccessTokens.me');
    const { data, error } = await sdkListUserTokens({ path: { id: meData.id } });
    if (error) throw error;
    const wrapper = assertData(data, 'profileApi.listAccessTokens');
    return (wrapper.items ?? []).map(adaptAccessToken);
  },

  createAccessToken: async (
    reqData: CreateAccessTokenRequest
  ): Promise<CreateAccessTokenResponse> => {
    // SDK CreateApiTokenRequest doesn't model repo_selector; include it via
    // `satisfies` so the backend still receives it.
    const body = {
      name: reqData.name,
      expires_in_days: reqData.expires_in_days,
      ...(reqData.scopes !== undefined ? { scopes: reqData.scopes } : {}),
      ...(reqData.repo_selector !== undefined ? { repo_selector: reqData.repo_selector } : {}),
    } satisfies Partial<SdkCreateApiTokenRequest> & { repo_selector?: unknown };
    const { data, error } = await sdkCreateApiToken({ body: body as SdkCreateApiTokenRequest });
    if (error) throw error;
    const result = assertData(data, 'profileApi.createAccessToken');
    return { id: result.id, token: result.token, name: result.name };
  },

  deleteAccessToken: async (tokenId: string): Promise<void> => {
    const { error } = await sdkRevokeApiToken({ path: { token_id: tokenId } });
    if (error) throw error;
  },
};

export default profileApi;
