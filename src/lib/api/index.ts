export { default as apiClient } from '@/lib/api-client';
export { default as authApi } from './auth';
export { default as repositoriesApi } from './repositories';
export { default as artifactsApi } from './artifacts';
export { default as adminApi } from './admin';
export { default as groupsApi } from './groups';
export { default as migrationApi } from './migration';
export { default as permissionsApi } from './permissions';
export { default as packagesApi } from './packages';
export { default as buildsApi } from './builds';
export { default as searchApi } from './search';
export { default as treeApi } from './tree';
export { default as profileApi } from './profile';
export { default as webhooksApi } from './webhooks';
export { default as securityApi } from './security';
export { default as peersApi } from './replication';
export { default as analyticsApi } from './analytics';
export { default as lifecycleApi } from './lifecycle';
export { default as telemetryApi } from './telemetry';
export { default as monitoringApi } from './monitoring';

export type { LoginCredentials } from './auth';
export type { ListRepositoriesParams } from './repositories';
export type { ListArtifactsParams } from './artifacts';
export type { Group, CreateGroupRequest, GroupMember, ListGroupsParams } from './groups';
export type {
  Permission,
  CreatePermissionRequest,
  ListPermissionsParams,
  PermissionAction,
  PermissionTargetType,
  PermissionPrincipalType,
} from './permissions';
export type { Package, PackageVersion, ListPackagesParams } from './packages';
export type {
  Build,
  BuildModule,
  BuildArtifact,
  BuildArtifactDiff,
  BuildDiff,
  BuildStatus,
  ListBuildsParams,
} from './builds';
export type {
  SearchResult,
  QuickSearchParams,
  AdvancedSearchParams,
  ChecksumSearchParams,
} from './search';
export type { TreeNode, TreeNodeType, GetChildrenParams } from './tree';
export type {
  UpdateProfileRequest,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  AccessToken,
  CreateAccessTokenRequest,
  CreateAccessTokenResponse,
} from './profile';
export type {
  Webhook,
  WebhookDelivery,
  WebhookEvent,
  CreateWebhookRequest,
  WebhookTestResult,
  ListWebhooksParams,
  ListDeliveriesParams,
} from './webhooks';
export type {
  ScanListResponse,
  FindingListResponse,
  ListScansParams,
  ListFindingsParams,
} from './security';
export type {
  PeerInstance,
  PeerIdentity,
  PeerConnection,
  ReplicationMode,
  RegisterPeerRequest,
  AssignRepoRequest,
} from './replication';
