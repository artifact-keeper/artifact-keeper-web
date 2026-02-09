/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listPermissions,
  getPermission,
  createPermission,
  updatePermission,
  deletePermission,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';

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

export const permissionsApi = {
  list: async (params: ListPermissionsParams = {}): Promise<PaginatedResponse<Permission>> => {
    const { data, error } = await listPermissions({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Permission>;
  },

  get: async (permissionId: string): Promise<Permission> => {
    const { data, error } = await getPermission({ path: { id: permissionId } });
    if (error) throw error;
    return data as any as Permission;
  },

  create: async (data: CreatePermissionRequest): Promise<Permission> => {
    const { data: result, error } = await createPermission({ body: data as any });
    if (error) throw error;
    return result as any as Permission;
  },

  update: async (
    permissionId: string,
    data: Partial<CreatePermissionRequest>
  ): Promise<Permission> => {
    const { data: result, error } = await updatePermission({
      path: { id: permissionId },
      body: data as any,
    });
    if (error) throw error;
    return result as any as Permission;
  },

  delete: async (permissionId: string): Promise<void> => {
    const { error } = await deletePermission({ path: { id: permissionId } });
    if (error) throw error;
  },
};

export default permissionsApi;
