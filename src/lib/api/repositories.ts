/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listRepositories,
  getRepository,
  createRepository,
  updateRepository,
  deleteRepository,
  listVirtualMembers,
  addVirtualMember,
  removeVirtualMember,
  updateVirtualMembers,
} from '@artifact-keeper/sdk';
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
    const { data, error } = await listRepositories({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Repository>;
  },

  get: async (key: string): Promise<Repository> => {
    const { data, error } = await getRepository({ path: { key } });
    if (error) throw error;
    return data as any as Repository;
  },

  create: async (data: CreateRepositoryRequest): Promise<Repository> => {
    const { data: result, error } = await createRepository({ body: data as any });
    if (error) throw error;
    return result as any as Repository;
  },

  update: async (key: string, data: Partial<CreateRepositoryRequest>): Promise<Repository> => {
    const { data: result, error } = await updateRepository({ path: { key }, body: data as any });
    if (error) throw error;
    return result as any as Repository;
  },

  delete: async (key: string): Promise<void> => {
    const { error } = await deleteRepository({ path: { key } });
    if (error) throw error;
  },

  // Virtual repository member management
  listMembers: async (repoKey: string): Promise<VirtualMembersResponse> => {
    const { data, error } = await listVirtualMembers({ path: { key: repoKey } });
    if (error) throw error;
    return data as any as VirtualMembersResponse;
  },

  addMember: async (repoKey: string, memberKey: string, priority?: number): Promise<VirtualRepoMember> => {
    const { data, error } = await addVirtualMember({
      path: { key: repoKey },
      body: { member_key: memberKey, priority } as any,
    });
    if (error) throw error;
    return data as any as VirtualRepoMember;
  },

  removeMember: async (repoKey: string, memberKey: string): Promise<void> => {
    const { error } = await removeVirtualMember({ path: { key: repoKey, member_key: memberKey } });
    if (error) throw error;
  },

  reorderMembers: async (repoKey: string, members: ReorderMemberInput[]): Promise<VirtualMembersResponse> => {
    const { data, error } = await updateVirtualMembers({
      path: { key: repoKey },
      body: { members } as any,
    });
    if (error) throw error;
    return data as any as VirtualMembersResponse;
  },
};

export default repositoriesApi;
