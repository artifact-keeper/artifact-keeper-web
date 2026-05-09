import '@/lib/sdk-client';
import {
  listPermissions,
  getPermission,
  createPermission,
  updatePermission,
  deletePermission,
} from '@artifact-keeper/sdk';
import type {
  PermissionResponse,
  PermissionListResponse,
  CreatedPermissionRow,
  CreatePermissionRequest as SdkCreatePermissionRequest,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { assertData } from '@/lib/api/fetch';

export type PermissionAction = 'read' | 'write' | 'delete' | 'admin';
export type PermissionTargetType = 'repository' | 'group' | 'artifact';
export type PermissionPrincipalType = 'user' | 'group';

export interface Permission {
  id: string;
  principal_type: PermissionPrincipalType;
  principal_id: string;
  principal_name?: string;
  target_type: PermissionTargetType;
  target_id: string;
  target_name?: string;
  actions: PermissionAction[];
  created_at: string;
  updated_at: string;
}

export interface CreatePermissionRequest {
  principal_type: PermissionPrincipalType;
  principal_id: string;
  target_type: PermissionTargetType;
  target_id: string;
  actions: PermissionAction[];
}

export interface ListPermissionsParams {
  page?: number;
  per_page?: number;
  principal_type?: PermissionPrincipalType;
  principal_id?: string;
  target_type?: PermissionTargetType;
  target_id?: string;
}

const PRINCIPAL_TYPES = new Set<PermissionPrincipalType>(['user', 'group']);
const TARGET_TYPES = new Set<PermissionTargetType>(['repository', 'group', 'artifact']);
const ACTIONS = new Set<PermissionAction>(['read', 'write', 'delete', 'admin']);

function narrowPrincipal(v: string): PermissionPrincipalType {
  if (PRINCIPAL_TYPES.has(v as PermissionPrincipalType)) {
    return v as PermissionPrincipalType;
  }
  // A new backend principal_type variant (e.g. 'service_account') would otherwise
  // silently flatten to 'user' and show up under the wrong ACL row. Surface it
  // so the regression is observable.
  console.warn(
    `permissionsApi: unknown principal_type "${v}" — defaulting to 'user'. ` +
      `This likely means the backend introduced a new principal kind the web hasn't picked up yet.`
  );
  return 'user';
}
function narrowTarget(v: string): PermissionTargetType {
  if (TARGET_TYPES.has(v as PermissionTargetType)) {
    return v as PermissionTargetType;
  }
  console.warn(
    `permissionsApi: unknown target_type "${v}" — defaulting to 'repository'. ` +
      `This likely means the backend introduced a new permission target kind.`
  );
  return 'repository';
}
function narrowActions(actions: string[]): PermissionAction[] {
  const narrowed = actions.filter((a): a is PermissionAction =>
    ACTIONS.has(a as PermissionAction)
  );
  if (narrowed.length !== actions.length) {
    const dropped = actions.filter((a) => !ACTIONS.has(a as PermissionAction));
    console.warn(
      `permissionsApi: dropping unknown action(s) ${JSON.stringify(dropped)} — ` +
        `the backend may have added a new permission action.`
    );
  }
  return narrowed;
}

function adaptPermission(sdk: PermissionResponse | CreatedPermissionRow): Permission {
  const created_at = sdk.created_at;
  // CreatedPermissionRow lacks updated_at and *_name fields; default updated_at
  // to created_at and leave name fields undefined.
  const updated_at = 'updated_at' in sdk ? sdk.updated_at : created_at;
  const principal_name = 'principal_name' in sdk ? (sdk.principal_name ?? undefined) : undefined;
  const target_name = 'target_name' in sdk ? (sdk.target_name ?? undefined) : undefined;
  return {
    id: sdk.id,
    principal_type: narrowPrincipal(sdk.principal_type),
    principal_id: sdk.principal_id,
    principal_name,
    target_type: narrowTarget(sdk.target_type),
    target_id: sdk.target_id,
    target_name,
    actions: narrowActions(sdk.actions),
    created_at,
    updated_at,
  };
}

function adaptPermissionList(sdk: PermissionListResponse): PaginatedResponse<Permission> {
  return {
    items: sdk.items.map(adaptPermission),
    pagination: sdk.pagination,
  };
}

function toSdkRequest(req: CreatePermissionRequest): SdkCreatePermissionRequest {
  return {
    principal_type: req.principal_type,
    principal_id: req.principal_id,
    target_type: req.target_type,
    target_id: req.target_id,
    actions: req.actions,
  };
}

export const permissionsApi = {
  list: async (params: ListPermissionsParams = {}): Promise<PaginatedResponse<Permission>> => {
    const { data, error } = await listPermissions({ query: params });
    if (error) throw error;
    return adaptPermissionList(assertData(data, 'permissionsApi.list'));
  },

  get: async (permissionId: string): Promise<Permission> => {
    const { data, error } = await getPermission({ path: { id: permissionId } });
    if (error) throw error;
    return adaptPermission(assertData(data, 'permissionsApi.get'));
  },

  create: async (input: CreatePermissionRequest): Promise<Permission> => {
    const { data, error } = await createPermission({ body: toSdkRequest(input) });
    if (error) throw error;
    return adaptPermission(assertData(data, 'permissionsApi.create'));
  },

  update: async (
    permissionId: string,
    input: CreatePermissionRequest
  ): Promise<Permission> => {
    const { data, error } = await updatePermission({
      path: { id: permissionId },
      body: toSdkRequest(input),
    });
    if (error) throw error;
    return adaptPermission(assertData(data, 'permissionsApi.update'));
  },

  delete: async (permissionId: string): Promise<void> => {
    const { error } = await deletePermission({ path: { id: permissionId } });
    if (error) throw error;
  },
};

export default permissionsApi;
