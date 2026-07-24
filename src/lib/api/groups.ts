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
  GroupDetailResponse,
  GroupListResponse,
  CreatedGroupRow,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { assertData } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { Group, GroupDetail, GroupMember, CreateGroupRequest } from '@/types/groups';
import type { Group, GroupDetail, CreateGroupRequest } from '@/types/groups';

export interface ListGroupsParams {
  page?: number;
  per_page?: number;
  search?: string;
}

// external_source ("oidc"|"saml"|"ldap"; null=local) drives is_external, read defensively since the 1.5.x SDK type lacks the field.
// auto_join defaults false; CreatedGroupRow lacks member_count so default 0.
function adaptGroup(sdk: GroupResponse | CreatedGroupRow): Group {
  const memberCount = 'member_count' in sdk ? sdk.member_count : 0;
  const externalSource =
    (sdk as { external_source?: string | null }).external_source ?? null;
  return {
    id: sdk.id,
    name: sdk.name,
    description: sdk.description ?? undefined,
    auto_join: false,
    member_count: memberCount,
    is_external: externalSource != null,
    external_source: externalSource,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptGroupDetail(sdk: GroupDetailResponse): GroupDetail {
  const externalSource =
    (sdk as { external_source?: string | null }).external_source ?? null;
  return {
    id: sdk.id,
    name: sdk.name,
    description: sdk.description ?? undefined,
    auto_join: false,
    member_count: sdk.member_count,
    is_external: externalSource != null,
    external_source: externalSource,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
    members: sdk.members.map((m) => ({
      user_id: m.user_id,
      username: m.username,
      display_name: m.display_name ?? undefined,
      joined_at: m.joined_at,
    })),
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

  getDetail: async (groupId: string): Promise<GroupDetail> => {
    const { data, error } = await getGroup({ path: { id: groupId } });
    if (error) throw error;
    return adaptGroupDetail(assertData(data, 'groupsApi.getDetail'));
  },

  create: async (input: CreateGroupRequest): Promise<Group> => {
    const { data, error } = await createGroup({ body: input });
    if (error) throw error;
    return adaptGroup(assertData(data, 'groupsApi.create'));
  },

  update: async (groupId: string, input: Partial<CreateGroupRequest>): Promise<Group> => {
    // SDK updateGroup requires the full CreateGroupRequest (with `name`); the
    // existing API exposes Partial<> for description-only updates. Build a
    // body type that allows omitting `name` (sending '' would blank the group
    // name), then cast at the SDK boundary.
    type UpdateGroupBodyPartial = Omit<CreateGroupRequest, 'name'> & { name?: string };
    const body: UpdateGroupBodyPartial = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    // SDK marks `name` required for PUT, but the backend treats omission as
    // "leave unchanged", which we want for description-only edits.
    const { data, error } = await updateGroup({
      path: { id: groupId },
      body: body as CreateGroupRequest,
    });
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
