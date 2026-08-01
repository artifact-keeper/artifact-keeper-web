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
import { unwrap } from '@/lib/sdk-utils';

export interface ListGroupsParams {
  page?: number;
  per_page?: number;
  search?: string;
}

// external_source ("oidc"|"saml"|"ldap"; null/absent=local) drives is_external.
// Typed optional in the SDK; `?? null` also covers backends predating #2874
// that omit the field entirely. auto_join defaults false; CreatedGroupRow
// lacks member_count so default 0.
function adaptGroup(sdk: GroupResponse | CreatedGroupRow): Group {
  const memberCount = 'member_count' in sdk ? sdk.member_count : 0;
  const externalSource = sdk.external_source ?? null;
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
  const externalSource = sdk.external_source ?? null;
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
    const data = await unwrap(listGroups({ query: params }));
    return adaptGroupList(assertData(data, 'groupsApi.list'));
  },

  get: async (groupId: string): Promise<Group> => {
    const data = await unwrap(getGroup({ path: { id: groupId } }));
    return adaptGroup(assertData(data, 'groupsApi.get'));
  },

  getDetail: async (groupId: string): Promise<GroupDetail> => {
    const data = await unwrap(getGroup({ path: { id: groupId } }));
    return adaptGroupDetail(assertData(data, 'groupsApi.getDetail'));
  },

  create: async (input: CreateGroupRequest): Promise<Group> => {
    const data = await unwrap(createGroup({ body: input }));
    return adaptGroup(assertData(data, 'groupsApi.create'));
  },

  update: async (groupId: string, input: CreateGroupRequest): Promise<Group> => {
    // PUT is a full replacement: the backend's CreateGroupRequest requires
    // `name` (omitting it fails body deserialization with 422, it is not
    // treated as "leave unchanged"). Callers editing only the description
    // must resend the current name.
    const data = await unwrap(updateGroup({
      path: { id: groupId },
      body: { name: input.name, description: input.description },
    }));
    return adaptGroup(assertData(data, 'groupsApi.update'));
  },

  delete: async (groupId: string): Promise<void> => {
    await unwrap(deleteGroup({ path: { id: groupId } }));
  },

  addMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    await unwrap(addMembers({
      path: { id: groupId },
      body: { user_ids: userIds },
    }));
  },

  removeMembers: async (groupId: string, userIds: string[]): Promise<void> => {
    await unwrap(removeMembers({
      path: { id: groupId },
      body: { user_ids: userIds },
    }));
  },
};

