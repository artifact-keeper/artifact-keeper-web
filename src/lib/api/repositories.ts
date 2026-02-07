import apiClient from '@/lib/api-client';
import type { Repository, CreateRepositoryRequest, PaginatedResponse, VirtualRepoMember, VirtualMembersResponse } from '@/types';

export interface ListRepositoriesParams {
  page?: number;
  per_page?: number;
  format?: string;
  repo_type?: string;
}

export interface ReorderMemberInput {
  member_key: string;
  priority: number;
}

export const repositoriesApi = {
  list: async (params: ListRepositoriesParams = {}): Promise<PaginatedResponse<Repository>> => {
    const response = await apiClient.get<PaginatedResponse<Repository>>('/api/v1/repositories', {
      params,
    });
    return response.data;
  },

  get: async (key: string): Promise<Repository> => {
    const response = await apiClient.get<Repository>(`/api/v1/repositories/${key}`);
    return response.data;
  },

  create: async (data: CreateRepositoryRequest): Promise<Repository> => {
    const response = await apiClient.post<Repository>('/api/v1/repositories', data);
    return response.data;
  },

  update: async (key: string, data: Partial<CreateRepositoryRequest>): Promise<Repository> => {
    const response = await apiClient.put<Repository>(`/api/v1/repositories/${key}`, data);
    return response.data;
  },

  delete: async (key: string): Promise<void> => {
    await apiClient.delete(`/api/v1/repositories/${key}`);
  },

  // Virtual repository member management
  listMembers: async (repoKey: string): Promise<VirtualMembersResponse> => {
    const response = await apiClient.get<VirtualMembersResponse>(`/api/v1/repositories/${repoKey}/members`);
    return response.data;
  },

  addMember: async (repoKey: string, memberKey: string, priority?: number): Promise<VirtualRepoMember> => {
    const response = await apiClient.post<VirtualRepoMember>(`/api/v1/repositories/${repoKey}/members`, {
      member_key: memberKey,
      priority,
    });
    return response.data;
  },

  removeMember: async (repoKey: string, memberKey: string): Promise<void> => {
    await apiClient.delete(`/api/v1/repositories/${repoKey}/members/${memberKey}`);
  },

  reorderMembers: async (repoKey: string, members: ReorderMemberInput[]): Promise<VirtualMembersResponse> => {
    const response = await apiClient.put<VirtualMembersResponse>(`/api/v1/repositories/${repoKey}/members`, {
      members,
    });
    return response.data;
  },
};

export default repositoriesApi;
