import { apiFetch } from './fetch';

export interface ServiceAccount {
  id: string;
  username: string;
  display_name?: string;
  is_active: boolean;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceAccountDetail {
  id: string;
  username: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceAccountRequest {
  name: string;
  description?: string;
}

export interface UpdateServiceAccountRequest {
  display_name?: string;
  is_active?: boolean;
}

export interface ServiceAccountToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
  is_expired: boolean;
}

export interface CreateTokenRequest {
  name: string;
  scopes: string[];
  expires_in_days?: number;
  description?: string;
  repository_ids?: string[];
}

export interface CreateTokenResponse {
  id: string;
  token: string;
  name: string;
}

export const serviceAccountsApi = {
  list: async (): Promise<ServiceAccount[]> => {
    const data = await apiFetch<{ items: ServiceAccount[] }>(
      '/api/v1/service-accounts'
    );
    return data.items;
  },

  get: async (id: string): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>(`/api/v1/service-accounts/${id}`);
  },

  create: async (
    req: CreateServiceAccountRequest
  ): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>('/api/v1/service-accounts', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update: async (
    id: string,
    req: UpdateServiceAccountRequest
  ): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>(`/api/v1/service-accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/service-accounts/${id}`, {
      method: 'DELETE',
    });
  },

  listTokens: async (id: string): Promise<ServiceAccountToken[]> => {
    const data = await apiFetch<{ items: ServiceAccountToken[] }>(
      `/api/v1/service-accounts/${id}/tokens`
    );
    return data.items;
  },

  createToken: async (
    id: string,
    req: CreateTokenRequest
  ): Promise<CreateTokenResponse> => {
    return apiFetch<CreateTokenResponse>(
      `/api/v1/service-accounts/${id}/tokens`,
      {
        method: 'POST',
        body: JSON.stringify(req),
      }
    );
  },

  revokeToken: async (id: string, tokenId: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/service-accounts/${id}/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  },
};

export default serviceAccountsApi;
