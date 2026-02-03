import apiClient from '@/lib/api-client';
import type { PaginatedResponse } from '@/types';

// Re-export types from the canonical types/ module
export type { BuildStatus, Build, BuildModule, BuildDiff, BuildArtifact, BuildArtifactDiff } from '@/types/builds';
import type { Build, BuildStatus, BuildDiff } from '@/types/builds';

export interface ListBuildsParams {
  page?: number;
  per_page?: number;
  status?: BuildStatus;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const buildsApi = {
  list: async (params: ListBuildsParams = {}): Promise<PaginatedResponse<Build>> => {
    const response = await apiClient.get<PaginatedResponse<Build>>('/api/v1/builds', {
      params,
    });
    return response.data;
  },

  get: async (buildId: string): Promise<Build> => {
    const response = await apiClient.get<Build>(`/api/v1/builds/${buildId}`);
    return response.data;
  },

  create: async (data: { name: string; build_number: number; agent?: string; started_at?: string; vcs_url?: string; vcs_revision?: string; vcs_branch?: string; vcs_message?: string; metadata?: Record<string, unknown> }): Promise<Build> => {
    const response = await apiClient.post<Build>('/api/v1/builds', data);
    return response.data;
  },

  updateStatus: async (buildId: string, data: { status: string; finished_at?: string }): Promise<Build> => {
    const response = await apiClient.put<Build>(`/api/v1/builds/${buildId}/status`, data);
    return response.data;
  },

  diff: async (buildIdA: string, buildIdB: string): Promise<BuildDiff> => {
    const response = await apiClient.get<BuildDiff>('/api/v1/builds/diff', {
      params: {
        build_a: buildIdA,
        build_b: buildIdB,
      },
    });
    return response.data;
  },
};

export default buildsApi;
