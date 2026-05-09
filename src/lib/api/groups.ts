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
import type {
  GroupResponse,
  GroupListResponse,
  CreatedGroupRow,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { assertData } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { Group, GroupMember, CreateGroupRequest } from '@/types/groups';
import type { Group, CreateGroupRequest } from '@/types/groups';

export interface ListGroupsParams {
  page?: number;
  per_page?: number;
  search?: string;
}

// SDK GroupResponse / CreatedGroupRow don't surface auto_join or is_external.
// Default them to false so the local Group contract is satisfied; pages that
// rely on real values for these will need a backend/SDK update.
// CreatedGroupRow (returned from createGroup) lacks member_count — default 0.
function adaptGroup(sdk: GroupResponse | CreatedGroupRow): Group {
  const memberCount = 'member_count' in sdk ? sdk.member_count : 0;
  return {
    id: sdk.id,
    name: sdk.name,
    description: sdk.description ?? undefined,
    auto_join: false,
    member_count: memberCount,
    is_external: false,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptGroupList(sdk: GroupListResponse): PaginatedResponse<Group> {
  return {
    items: sdk.items.map(adaptGroup),
    pagination: sdk.pagination,
  };
}

export const groupsApi = {
  list: async (params: ListGroupsParams = {}): Promise<PaginatedResponse<Group>> => {
    const { data, error } = await listGroups({ query: params });
    if (error) throw error;
    return adaptGroupList(assertData(data, 'groupsApi.list'));
  },

  get: async (groupId: string): Promise<Group> => {
    const { data, error } = await getGroup({ path: { id: groupId } });
    if (error) throw error;
    return adaptGroup(assertData(data, 'groupsApi.get'));
  },

  create: async (input: CreateGroupRequest): Promise<Group> => {
    const { data, error } = await createGroup({ body: input });
    if (error) throw error;
    return adaptGroup(assertData(data, 'groupsApi.create'));
  },

  update: async (groupId: string, input: Partial<CreateGroupRequest>): Promise<Group> => {
    // SDK updateGroup requires the full CreateGroupRequest (with `name`); the
    // existing API exposes Partial<> for compatibility with callers that only
    // change description. Coerce missing name to '' — the backend ignores it
    // when not present in the original schema. Pages that pass name-less
    // updates rely on this and break under stricter typing — leave behavior
    // unchanged for this refactor.
    const body: CreateGroupRequest = {
      name: input.name ?? '',
      description: input.description,
    };
    const { data, error } = await updateGroup({ path: { id: groupId }, body });
    if (error) throw error;
    return adaptGroup(assertData(data, 'groupsApi.update'));
  },

  delete: async (groupId: string): Promise<void> => {
    const { error } = await deleteGroup({ path: { id: groupId } });
    if (error) throw error;
  },

  addMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    const { error } = await addMembers({
      path: { id: groupId },
      body: { user_ids: userIds },
    });
    if (error) throw error;
  },

  removeMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    const { error } = await removeMembers({
      path: { id: groupId },
      body: { user_ids: userIds },
    });
    if (error) throw error;
  },
};

export default groupsApi;
