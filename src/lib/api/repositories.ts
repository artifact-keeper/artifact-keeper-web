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
    const { data, error } = await listRepositories({ query: params as Record<string, unknown> });
    if (error) throw error;
    return data as unknown as PaginatedResponse<Repository>;
  },

  get: async (key: string): Promise<Repository> => {
    const { data, error } = await getRepository({ path: { key } });
    if (error) throw error;
    return data as unknown as Repository;
  },

  create: async (input: CreateRepositoryRequest): Promise<Repository> => {
    const { data, error } = await createRepository({
      body: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        format: input.format,
        repo_type: input.repo_type,
        is_public: input.is_public ?? null,
        quota_bytes: input.quota_bytes ?? null,
        upstream_url: input.upstream_url ?? null,
      },
    });
    if (error) throw error;
    return data as unknown as Repository;
  },

  update: async (key: string, input: Partial<CreateRepositoryRequest>): Promise<Repository> => {
    const { data, error } = await updateRepository({
      path: { key },
      body: {
        name: input.name ?? null,
        description: input.description ?? null,
        is_public: input.is_public ?? null,
        quota_bytes: input.quota_bytes ?? null,
        key: input.key ?? null,
      },
    });
    if (error) throw error;
    return data as unknown as Repository;
  },

  delete: async (key: string): Promise<void> => {
    const { error } = await deleteRepository({ path: { key } });
    if (error) throw error;
  },

  // Virtual repository member management
  listMembers: async (repoKey: string): Promise<VirtualMembersResponse> => {
    const { data, error } = await listVirtualMembers({ path: { key: repoKey } });
    if (error) throw error;
    // SDK returns { items: [...] }, our type expects { members: [...] }
    const response = data as unknown as { items: VirtualRepoMember[] };
    return { members: response.items };
  },

  addMember: async (repoKey: string, memberKey: string, priority?: number): Promise<VirtualRepoMember> => {
    const { data, error } = await addVirtualMember({
      path: { key: repoKey },
      body: { member_key: memberKey, priority: priority ?? null },
    });
    if (error) throw error;
    return data as unknown as VirtualRepoMember;
  },

  removeMember: async (repoKey: string, memberKey: string): Promise<void> => {
    const { error } = await removeVirtualMember({ path: { key: repoKey, member_key: memberKey } });
    if (error) throw error;
  },

  reorderMembers: async (repoKey: string, members: ReorderMemberInput[]): Promise<VirtualMembersResponse> => {
    const { data, error } = await updateVirtualMembers({
      path: { key: repoKey },
      body: { members },
    });
    if (error) throw error;
    const response = data as unknown as { items: VirtualRepoMember[] };
    return { members: response.items };
  },
};

export default repositoriesApi;
