/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMembers,
  removeMembers,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';

// Re-export types from the canonical types/ module
export type { Group, GroupMember, CreateGroupRequest } from '@/types/groups';
import type { Group, CreateGroupRequest } from '@/types/groups';

export interface ListGroupsParams {
  page?: number;
  per_page?: number;
  search?: string;
}

export const groupsApi = {
  list: async (params: ListGroupsParams = {}): Promise<PaginatedResponse<Group>> => {
    const { data, error } = await listGroups({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Group>;
  },

  get: async (groupId: string): Promise<Group> => {
    const { data, error } = await getGroup({ path: { id: groupId } });
    if (error) throw error;
    return data as any as Group;
  },

  create: async (data: CreateGroupRequest): Promise<Group> => {
    const { data: result, error } = await createGroup({ body: data as any });
    if (error) throw error;
    return result as any as Group;
  },

  update: async (groupId: string, data: Partial<CreateGroupRequest>): Promise<Group> => {
    const { data: result, error } = await updateGroup({ path: { id: groupId }, body: data as any });
    if (error) throw error;
    return result as any as Group;
  },

  delete: async (groupId: string): Promise<void> => {
    const { error } = await deleteGroup({ path: { id: groupId } });
    if (error) throw error;
  },

  addMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    const { error } = await addMembers({
      path: { id: groupId },
      body: { user_ids: userIds } as any,
    });
    if (error) throw error;
  },

  removeMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    const { error } = await removeMembers({
      path: { id: groupId },
      body: { user_ids: userIds } as any,
    });
    if (error) throw error;
  },
};

export default groupsApi;
