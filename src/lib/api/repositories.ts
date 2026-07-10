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
  getCacheTtl,
  setCacheTtl,
} from '@artifact-keeper/sdk';
import type {
  RepositoryResponse,
  RepositoryListResponse,
  CreateRepositoryRequest as SdkCreateRepositoryRequest,
  UpdateRepositoryRequest as SdkUpdateRepositoryRequest,
  VirtualMemberResponse,
  VirtualMembersListResponse,
  CacheTtlResponse,
} from '@artifact-keeper/sdk';
import { apiFetch, assertData, narrowEnum } from '@/lib/api/fetch';
import type {
  Repository,
  CreateRepositoryRequest,
  PaginatedResponse,
  VirtualRepoMember,
  VirtualMembersResponse,
  RepositoryFormat,
  RepositoryType,
} from '@/types';

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

export interface UpstreamAuthPayload {
  auth_type: string;
  username?: string;
  password?: string;
}

/**
 * A single routing rule for path rewriting on remote/proxy repositories.
 * Mirrors the backend `RoutingRule` struct: a regex `path_pattern` matched
 * against the request path and a `rewrite_to` template that may reference
 * capture groups with `$1`, `$2`, and so on.
 */
export interface RoutingRule {
  path_pattern: string;
  rewrite_to: string;
}

export interface RoutingRulesResponse {
  repository_key: string;
  rules: RoutingRule[];
}

/**
 * Package age policy for a repository (issue #265, backend
 * artifact-keeper/artifact-keeper#709).
 *
 * When enabled, freshly published artifacts pulled through a remote repository
 * are held in quarantine for `duration_minutes` after their release. This gives
 * a window for a compromised upstream release to be flagged before it can be
 * served, mitigating supply-chain attacks (e.g. the Trivy incident).
 *
 * Stored server-side in `repository_config` under `quarantine_enabled` and
 * `quarantine_duration_minutes`. These fields are written via the repository
 * update endpoint but are not part of the SDK-generated `UpdateRepositoryRequest`
 * yet, so this module sends them through `apiFetch` directly.
 */
export interface AgePolicyPayload {
  enabled: boolean;
  duration_minutes: number;
}

const REPO_TYPES = new Set<RepositoryType>(['local', 'remote', 'virtual', 'staging']);

const REPO_FORMATS = new Set<RepositoryFormat>([
  'maven',
  'gradle',
  'pypi',
  'npm',
  'docker',
  'helm',
  'rpm',
  'debian',
  'go',
  'nuget',
  'rubygems',
  'conan',
  'cargo',
  'generic',
  'podman',
  'buildx',
  'oras',
  'wasm_oci',
  'helm_oci',
  'poetry',
  'conda',
  'yarn',
  'bower',
  'pnpm',
  'chocolatey',
  'powershell',
  'terraform',
  'opentofu',
  'alpine',
  'conda_native',
  'composer',
  'hex',
  'cocoapods',
  'swift',
  'pub',
  'sbt',
  'chef',
  'puppet',
  'ansible',
  'gitlfs',
  'vscode',
  'jetbrains',
  'huggingface',
  'mlmodel',
  'cran',
  'vagrant',
  'opkg',
  'p2',
  'bazel',
  'protobuf',
  'incus',
  'lxc',
]);

function adaptRepository(sdk: RepositoryResponse): Repository {
  // The backend ships `versioning_enabled` (artifact-keeper#2367) on the
  // repository response, but the generated SDK type doesn't carry it until
  // the SDK regenerates from the upgraded OpenAPI spec. Read it off the
  // runtime object via a narrowed cast (same approach as the artifact cache
  // fields in artifacts.ts); collapse to a direct access after SDK regen.
  const sdkAny = sdk as RepositoryResponse & { versioning_enabled?: boolean };
  return {
    id: sdk.id,
    key: sdk.key,
    name: sdk.name,
    description: sdk.description ?? undefined,
    // SDK uses `format: string`; the local RepositoryFormat is a long narrow union.
    // Warn on unknown values so a newly-added backend format is observable rather
    // than silently coerced. 'generic' is the safe default the UI can render.
    format: narrowEnum(
      sdk.format,
      REPO_FORMATS,
      'generic',
      `repositoriesApi: unknown repository format "${sdk.format}" — defaulting to 'generic'. ` +
        `This likely means the backend added a format the SDK hasn't picked up yet.`,
    ),
    repo_type: narrowEnum(sdk.repo_type, REPO_TYPES, 'local'),
    is_public: sdk.is_public,
    // Default false: a backend that predates #2367 simply has no versioning.
    versioning_enabled: sdkAny.versioning_enabled ?? false,
    storage_used_bytes: sdk.storage_used_bytes,
    quota_bytes: sdk.quota_bytes ?? undefined,
    upstream_url: sdk.upstream_url ?? undefined,
    upstream_auth_type: sdk.upstream_auth_type ?? undefined,
    upstream_auth_configured: sdk.upstream_auth_configured,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptRepositoryList(sdk: RepositoryListResponse): PaginatedResponse<Repository> {
  return {
    items: sdk.items.map(adaptRepository),
    pagination: sdk.pagination,
  };
}

function adaptVirtualMember(sdk: VirtualMemberResponse): VirtualRepoMember {
  return {
    id: sdk.id,
    virtual_repo_id: '',
    member_repo_id: sdk.member_repo_id,
    member_repo_key: sdk.member_repo_key,
    priority: sdk.priority,
    created_at: sdk.created_at,
  };
}

function adaptVirtualMembersList(sdk: VirtualMembersListResponse): VirtualMembersResponse {
  return { members: sdk.members.map(adaptVirtualMember) };
}

export const repositoriesApi = {
  list: async (params: ListRepositoriesParams = {}): Promise<PaginatedResponse<Repository>> => {
    const { data, error } = await listRepositories({ query: params });
    if (error) throw error;
    return adaptRepositoryList(assertData(data, 'repositoriesApi.list'));
  },

  get: async (key: string): Promise<Repository> => {
    const { data, error } = await getRepository({ path: { key } });
    if (error) throw error;
    return adaptRepository(assertData(data, 'repositoriesApi.get'));
  },

  create: async (input: CreateRepositoryRequest): Promise<Repository> => {
    const body: SdkCreateRepositoryRequest = {
      key: input.key,
      name: input.name,
      description: input.description,
      format: input.format,
      repo_type: input.repo_type,
      is_public: input.is_public,
      quota_bytes: input.quota_bytes,
      upstream_url: input.upstream_url,
      member_repos: input.member_repos,
      // #407: forward upstream auth so the create dialog actually persists
      // basic/bearer credentials. Previously these were dropped here, so the
      // form appeared to save but `repository_config` stayed empty and the
      // repo returned 401 on first proxy hit. The SDK type supports these
      // fields directly on CreateRepositoryRequest, so no separate
      // updateUpstreamAuth round-trip is needed.
      upstream_auth_type: input.upstream_auth_type,
      upstream_username: input.upstream_username,
      upstream_password: input.upstream_password,
    };
    const { data, error } = await createRepository({ body });
    if (error) throw error;
    return adaptRepository(assertData(data, 'repositoriesApi.create'));
  },

  update: async (key: string, input: Partial<CreateRepositoryRequest>): Promise<Repository> => {
    // `versioning_enabled` (artifact-keeper#2367) is accepted by the backend
    // update endpoint but is not on the generated SDK request type yet, so
    // widen the body via a narrowed cast (mirrors adaptRepository above).
    // When omitted the backend leaves the flag unchanged.
    const body: SdkUpdateRepositoryRequest & { versioning_enabled?: boolean } = {
      name: input.name,
      description: input.description,
      is_public: input.is_public,
      quota_bytes: input.quota_bytes,
      key: input.key,
      versioning_enabled: input.versioning_enabled,
    };
    const { data, error } = await updateRepository({ path: { key }, body });
    if (error) throw error;
    return adaptRepository(assertData(data, 'repositoriesApi.update'));
  },

  delete: async (key: string): Promise<void> => {
    const { error } = await deleteRepository({ path: { key } });
    if (error) throw error;
  },

  // Virtual repository member management
  listMembers: async (repoKey: string): Promise<VirtualMembersResponse> => {
    const { data, error } = await listVirtualMembers({ path: { key: repoKey } });
    if (error) throw error;
    return adaptVirtualMembersList(assertData(data, 'repositoriesApi.listMembers'));
  },

  addMember: async (repoKey: string, memberKey: string, priority?: number): Promise<VirtualRepoMember> => {
    const { data, error } = await addVirtualMember({
      path: { key: repoKey },
      body: { member_key: memberKey, priority },
    });
    if (error) throw error;
    return adaptVirtualMember(assertData(data, 'repositoriesApi.addMember'));
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
    return adaptVirtualMembersList(assertData(data, 'repositoriesApi.reorderMembers'));
  },

  // Upstream authentication management
  updateUpstreamAuth: async (repoKey: string, payload: UpstreamAuthPayload): Promise<void> => {
    await apiFetch<void>(`/api/v1/repositories/${encodeURIComponent(repoKey)}/upstream-auth`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  testUpstream: async (repoKey: string): Promise<{ success: boolean; message?: string }> => {
    return apiFetch(`/api/v1/repositories/${encodeURIComponent(repoKey)}/test-upstream`, {
      method: 'POST',
    });
  },

  // Routing rules management (issue #263). The generated SDK does not yet expose
  // these endpoints, so they go through the shared apiFetch wrapper, the same
  // pattern used for upstream-auth and test-upstream above.
  getRoutingRules: async (repoKey: string): Promise<RoutingRulesResponse> => {
    return apiFetch<RoutingRulesResponse>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/routing-rules`
    );
  },

  setRoutingRules: async (
    repoKey: string,
    rules: RoutingRule[]
  ): Promise<RoutingRulesResponse> => {
    return apiFetch<RoutingRulesResponse>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/routing-rules`,
      {
        method: 'POST',
        body: JSON.stringify({ rules }),
      }
    );
  },

  deleteRoutingRules: async (repoKey: string): Promise<void> => {
    await apiFetch<void>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/routing-rules`,
      { method: 'DELETE' }
    );
  },

  // Release target configuration for staging repositories (issue #260).
  // Persisted via PATCH /repositories/{key} with the `release_repository_key`
  // field. Pass an empty string to remove an existing link. The generated SDK's
  // UpdateRepositoryRequest may not carry this field yet, so it is sent through
  // apiFetch to guarantee it reaches the backend.
  setReleaseTarget: async (
    repoKey: string,
    releaseRepositoryKey: string
  ): Promise<Repository> => {
    const sdk = await apiFetch<RepositoryResponse>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ release_repository_key: releaseRepositoryKey }),
      }
    );
    return adaptRepository(sdk);
  },

  /**
   * Configure the package age policy (quarantine-on-release) for a repository.
   *
   * Sends `quarantine_enabled` and `quarantine_duration_minutes` to the
   * repository update endpoint. Uses `apiFetch` rather than the SDK because
   * those fields are not in the generated `UpdateRepositoryRequest` yet.
   *
   * When `enabled` is false, the duration is still sent so the stored value is
   * preserved and re-enabling does not lose the previously configured window.
   */
  updateAgePolicy: async (repoKey: string, payload: AgePolicyPayload): Promise<void> => {
    await apiFetch<void>(`/api/v1/repositories/${encodeURIComponent(repoKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        quarantine_enabled: payload.enabled,
        quarantine_duration_minutes: payload.duration_minutes,
      }),
    });
  },

  /**
   * Read the proxy cache TTL for a repository (#448).
   *
   * The backend's GET endpoint is permissive: it returns 200 with the
   * effective TTL (falling back to the default of 86400s = 24h when no value
   * is stored) for *any* repo type, even though writes are gated to Remote.
   * The UI gates the section on `repository.repo_type === 'remote'`, but
   * keeping the read here unconditional preserves the contract documented in
   * artifact-keeper#917 and matches what the existing UI probes already do
   * for other repo types.
   */
  getCacheTtl: async (repoKey: string): Promise<CacheTtlResponse> => {
    const { data, error } = await getCacheTtl({ path: { key: repoKey } });
    if (error) throw error;
    return assertData(data, 'repositoriesApi.getCacheTtl');
  },

  /**
   * Set the proxy cache TTL for a Remote (proxy) repository (#448).
   *
   * Backend rejects writes against non-Remote repos with 400; callers should
   * gate the UI on `repository.repo_type === 'remote'` rather than relying
   * on the server-side rejection alone, so operators don't compose changes
   * that fail at save time.
   */
  setCacheTtl: async (repoKey: string, cacheTtlSeconds: number): Promise<CacheTtlResponse> => {
    const { data, error } = await setCacheTtl({
      path: { key: repoKey },
      body: { cache_ttl_seconds: cacheTtlSeconds },
    });
    if (error) throw error;
    return assertData(data, 'repositoriesApi.setCacheTtl');
  },
};

export default repositoriesApi;
