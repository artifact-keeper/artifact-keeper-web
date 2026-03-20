import '@/lib/sdk-client';
import {
  getSystemStats,
  listUsers,
  healthCheck,
  listUserTokens as sdkListUserTokens,
  revokeUserApiToken as sdkRevokeUserApiToken,
} from '@artifact-keeper/sdk';
import type { AdminStats, User, HealthResponse } from '@/types';
import type { ApiKey } from '@/lib/api/profile';

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const { data, error } = await getSystemStats();
    if (error) throw error;
    return data as unknown as AdminStats;
  },

  listUsers: async (): Promise<User[]> => {
    const { data, error } = await listUsers();
    if (error) throw error;
    return (data as unknown as { items: User[] }).items;
  },

  getHealth: async (): Promise<HealthResponse> => {
    const { data, error } = await healthCheck();
    if (error) throw error;
    return data as unknown as HealthResponse;
  },

  listUserTokens: async (userId: string): Promise<ApiKey[]> => {
    const { data, error } = await sdkListUserTokens({ path: { id: userId } });
    if (error) throw error;
    return (data as unknown as { items?: ApiKey[] })?.items ?? [];
  },

  revokeUserToken: async (userId: string, tokenId: string): Promise<void> => {
    const { error } = await sdkRevokeUserApiToken({
      path: { id: userId, token_id: tokenId },
    });
    if (error) throw error;
  },
};

export default adminApi;
