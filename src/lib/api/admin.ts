import '@/lib/sdk-client';
import { getSystemStats, listUsers, healthCheck } from '@artifact-keeper/sdk';
import type { AdminStats, User, HealthResponse } from '@/types';

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
};

export default adminApi;
