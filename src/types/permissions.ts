export type PermissionTarget = 'user' | 'group';

export type PermissionAction = 'read' | 'write' | 'delete' | 'admin';

export interface RepositoryPattern {
  /** Glob pattern for matching repository keys (e.g., "npm-*", "docker-prod-*") */
  pattern: string;
  /** Whether pattern includes nested paths */
  include_nested?: boolean;
}

export interface PermissionAssignment {
  id: string;
  /** Type of target receiving the permission */
  target_type: PermissionTarget;
  /** ID of the user or group */
  target_id: string;
  /** Name of the user or group for display */
  target_name: string;
  /** Specific repository ID (null for pattern-based or global) */
  repository_id?: string;
  /** Repository key for display */
  repository_key?: string;
  /** Pattern for matching multiple repositories */
  repository_pattern?: RepositoryPattern;
  /** Granted permission actions */
  actions: PermissionAction[];
  /** Whether this is a global (all repos) permission */
  is_global: boolean;
  /** Role name if assigned via role */
  role_name?: string;
  /** When the permission was granted */
  created_at: string;
  /** Who granted the permission */
  granted_by?: string;
}

export interface PermissionSummary {
  /** Entity this summary is for */
  entity_type: 'user' | 'repository';
  entity_id: string;
  entity_name: string;
  /** Direct permission assignments */
  direct_permissions: PermissionAssignment[];
  /** Permissions inherited from groups */
  inherited_permissions: PermissionAssignment[];
  /** Computed effective actions (union of all permissions) */
  effective_actions: PermissionAction[];
  /** Whether the entity has admin-level access */
  is_admin: boolean;
}

export interface CreatePermissionRequest {
  target_type: PermissionTarget;
  target_id: string;
  repository_id?: string;
  repository_pattern?: string;
  actions: PermissionAction[];
}

export interface UpdatePermissionRequest {
  actions: PermissionAction[];
}

export interface PermissionCheckRequest {
  user_id: string;
  repository_id: string;
  actions: PermissionAction[];
}

export interface PermissionCheckResponse {
  allowed: boolean;
  granted_actions: PermissionAction[];
  denied_actions: PermissionAction[];
  reason?: string;
}
