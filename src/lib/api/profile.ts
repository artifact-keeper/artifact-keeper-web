/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  getCurrentUser as sdkGetCurrentUser,
  updateUser as sdkUpdateUser,
  listUserTokens as sdkListUserTokens,
  createApiToken as sdkCreateApiToken,
  revokeApiToken as sdkRevokeApiToken,
} from '@artifact-keeper/sdk';
import type { User } from '@/types';

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
  api_key: ApiKey;
  key: string; // Full key, only shown once
}

export interface AccessToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  scopes?: string[];
}

export interface CreateAccessTokenRequest {
  name: string;
  expires_in_days?: number;
  scopes?: string[];
}

export interface CreateAccessTokenResponse {
  access_token: AccessToken;
  token: string; // Full token, only shown once
}

export const profileApi = {
  get: async (): Promise<User> => {
    const { data, error } = await sdkGetCurrentUser();
    if (error) throw error;
    return data as any;
  },

  update: async (reqData: UpdateProfileRequest): Promise<User> => {
    // getCurrentUser to get the user id, then updateUser
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const userId = (me as any).id;
    const { data, error } = await sdkUpdateUser({ path: { id: userId }, body: reqData as any });
    if (error) throw error;
    return data as any;
  },

  // API Keys
  listApiKeys: async (): Promise<ApiKey[]> => {
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const userId = (me as any).id;
    const { data, error } = await sdkListUserTokens({ path: { id: userId } });
    if (error) throw error;
    return (data as any)?.api_keys ?? [];
  },

  createApiKey: async (reqData: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    const { data, error } = await sdkCreateApiToken({ body: reqData as any });
    if (error) throw error;
    return data as any;
  },

  deleteApiKey: async (keyId: string): Promise<void> => {
    const { error } = await sdkRevokeApiToken({ path: { token_id: keyId } });
    if (error) throw error;
  },

  // Access Tokens
  listAccessTokens: async (): Promise<AccessToken[]> => {
    const { data: me, error: meError } = await sdkGetCurrentUser();
    if (meError) throw meError;
    const userId = (me as any).id;
    const { data, error } = await sdkListUserTokens({ path: { id: userId } });
    if (error) throw error;
    return (data as any)?.access_tokens ?? [];
  },

  createAccessToken: async (
    reqData: CreateAccessTokenRequest
  ): Promise<CreateAccessTokenResponse> => {
    const { data, error } = await sdkCreateApiToken({ body: reqData as any });
    if (error) throw error;
    return data as any;
  },

  deleteAccessToken: async (tokenId: string): Promise<void> => {
    const { error } = await sdkRevokeApiToken({ path: { token_id: tokenId } });
    if (error) throw error;
  },
};

export default profileApi;
