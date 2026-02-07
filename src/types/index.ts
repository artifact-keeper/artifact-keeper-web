export * from './groups';
export * from './migration';
export * from './permissions';
export * from './packages';
export * from './builds';
export * from './search';
export * from './tree';
export * from './security';
export * from './analytics';
export * from './lifecycle';
export * from './telemetry';
export * from './monitoring';
export * from './sbom';
export * from './promotion';

export type {
  PeerInstance,
  PeerIdentity,
  PeerConnection,
  ReplicationMode,
  RegisterPeerRequest,
  AssignRepoRequest as PeerAssignRepoRequest,
} from '@/lib/api/replication';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  is_active?: boolean;
  must_change_password?: boolean;
  totp_enabled?: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  must_change_password: boolean;
  totp_required?: boolean;
  totp_token?: string;
}

export interface CreateUserResponse {
  user: User;
  generated_password?: string;
}

export interface Repository {
  id: string;
  key: string;
  name: string;
  description?: string;
  format: RepositoryFormat;
  repo_type: RepositoryType;
  is_public: boolean;
  storage_used_bytes: number;
  quota_bytes?: number;
  // For remote repositories
  upstream_url?: string;
  // For virtual repositories
  member_repos?: VirtualRepoMember[];
  created_at: string;
  updated_at: string;
}

export type RepositoryFormat =
  | 'maven'
  | 'gradle'
  | 'pypi'
  | 'npm'
  | 'docker'
  | 'helm'
  | 'rpm'
  | 'debian'
  | 'go'
  | 'nuget'
  | 'rubygems'
  | 'conan'
  | 'cargo'
  | 'generic'
  | 'podman'
  | 'buildx'
  | 'oras'
  | 'wasm_oci'
  | 'helm_oci'
  | 'poetry'
  | 'conda'
  | 'yarn'
  | 'bower'
  | 'pnpm'
  | 'chocolatey'
  | 'powershell'
  | 'terraform'
  | 'opentofu'
  | 'alpine'
  | 'conda_native'
  | 'composer'
  | 'hex'
  | 'cocoapods'
  | 'swift'
  | 'pub'
  | 'sbt'
  | 'chef'
  | 'puppet'
  | 'ansible'
  | 'gitlfs'
  | 'vscode'
  | 'jetbrains'
  | 'huggingface'
  | 'mlmodel'
  | 'cran'
  | 'vagrant'
  | 'opkg'
  | 'p2'
  | 'bazel';

export type RepositoryType = 'local' | 'remote' | 'virtual' | 'staging';

export interface CreateRepositoryRequest {
  key: string;
  name: string;
  description?: string;
  format: RepositoryFormat;
  repo_type: RepositoryType;
  is_public?: boolean;
  quota_bytes?: number;
  // For remote repositories
  upstream_url?: string;
  // For virtual repositories - array of member repo keys with priorities
  member_repos?: VirtualRepoMemberInput[];
}

export interface VirtualRepoMemberInput {
  repo_key: string;
  priority: number;
}

export interface VirtualRepoMember {
  id: string;
  virtual_repo_id: string;
  member_repo_id: string;
  member_repo_key: string;
  priority: number;
  created_at: string;
}

export interface VirtualMembersResponse {
  members: VirtualRepoMember[];
}

export interface Artifact {
  id: string;
  repository_key: string;
  path: string;
  name: string;
  version?: string;
  size_bytes: number;
  checksum_sha256: string;
  content_type: string;
  download_count: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface HealthResponse {
  status: string;
  version: string;
  checks: {
    database: { status: string; message?: string };
    storage: { status: string; message?: string };
    security_scanner?: { status: string; message?: string };
    meilisearch?: { status: string; message?: string };
  };
}

export interface AdminStats {
  total_repositories: number;
  total_artifacts: number;
  total_storage_bytes: number;
  total_users: number;
}

export interface ApiError {
  code: string;
  message: string;
}
