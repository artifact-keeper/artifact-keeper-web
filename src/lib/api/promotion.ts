import '@/lib/sdk-client';
import {
  listRepositories as sdkListRepositories,
  listArtifacts as sdkListArtifacts,
  promoteArtifact as sdkPromoteArtifact,
  promoteArtifactsBulk as sdkPromoteArtifactsBulk,
  promotionHistory as sdkPromotionHistory,
} from '@artifact-keeper/sdk';
import type {
  PromoteArtifactRequest as SdkPromoteArtifactRequest,
  BulkPromoteRequest as SdkBulkPromoteRequest,
  PromotionResponse as SdkPromotionResponse,
  BulkPromotionResponse as SdkBulkPromotionResponse,
  PromotionHistoryResponse as SdkPromotionHistoryResponse,
  PromotionHistoryEntry as SdkPromotionHistoryEntry,
  PolicyViolation as SdkPolicyViolation,
} from '@artifact-keeper/sdk';
import type {
  RepositoryResponse as SdkRepositoryResponse,
  RepositoryListResponse as SdkRepositoryListResponse,
  ArtifactResponse as SdkArtifactResponse,
  ArtifactListResponse as SdkArtifactListResponse,
} from '@artifact-keeper/sdk';
import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';
import { assertData, narrowEnum } from '@/lib/api/fetch';
import type {
  PromoteArtifactRequest,
  BulkPromoteRequest,
  PromotionResponse,
  BulkPromotionResponse,
  PromotionHistoryResponse,
  PromotionHistoryEntry,
  PolicyViolation,
  RejectArtifactRequest,
  RejectArtifactResponse,
  PromotionHistoryStatus,
} from '@/types/promotion';
import type {
  Repository,
  RepositoryFormat,
  RepositoryType,
  PaginatedResponse,
  Artifact,
} from '@/types';

const REPO_TYPES = new Set<RepositoryType>(['local', 'remote', 'virtual', 'staging']);

function adaptRepository(sdk: SdkRepositoryResponse): Repository {
  return {
    id: sdk.id,
    key: sdk.key,
    name: sdk.name,
    description: sdk.description ?? undefined,
    // Promotion only renders format as a passthrough string; it doesn't
    // gate behavior on the union value. The full RepositoryFormat list
    // is maintained in repositoriesApi.adaptRepository — we coerce here
    // because the local type's union is the source of truth and a stray
    // SDK value should still typecheck. If promotion ever narrows on
    // format (e.g. format-specific UI), import the canonical Set.
    format: sdk.format as RepositoryFormat,
    repo_type: narrowEnum(sdk.repo_type, REPO_TYPES, 'local'),
    is_public: sdk.is_public,
    storage_used_bytes: sdk.storage_used_bytes,
    quota_bytes: sdk.quota_bytes ?? undefined,
    upstream_url: sdk.upstream_url ?? undefined,
    upstream_auth_type: sdk.upstream_auth_type ?? undefined,
    upstream_auth_configured: sdk.upstream_auth_configured,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptRepositoryList(
  sdk: SdkRepositoryListResponse,
): PaginatedResponse<Repository> {
  return {
    items: sdk.items.map(adaptRepository),
    pagination: sdk.pagination,
  };
}

function adaptArtifact(sdk: SdkArtifactResponse): Artifact {
  return {
    id: sdk.id,
    repository_key: sdk.repository_key,
    path: sdk.path,
    name: sdk.name,
    version: sdk.version ?? undefined,
    size_bytes: sdk.size_bytes,
    checksum_sha256: sdk.checksum_sha256,
    content_type: sdk.content_type,
    download_count: sdk.download_count,
    created_at: sdk.created_at,
    metadata: sdk.metadata ?? undefined,
  };
}

function adaptArtifactList(
  sdk: SdkArtifactListResponse,
): PaginatedResponse<Artifact> {
  return {
    items: sdk.items.map(adaptArtifact),
    pagination: sdk.pagination,
  };
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
const SEVERITIES = new Set<Severity>([
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

const HISTORY_STATUSES = new Set<PromotionHistoryStatus>([
  'promoted',
  'rejected',
  'pending_approval',
]);

// SDK ⇄ local adapters. The SDK's PolicyViolation has only `rule`, `message`,
// `severity` (string); local declares `severity` as a strict union and adds
// optional `details`. The SDK's PromotionHistoryEntry stores `policy_result`
// as an opaque key/value bag; the local type declares it as a typed
// `PolicyEvaluationResult` that the UI never actually destructures
// (consumers only check `policy_result?.violations?.length` etc.). We
// preserve that lazy access pattern by passing through the bag verbatim
// (cast through `unknown` to satisfy the typed slot — see comment).

function adaptPolicyViolation(sdk: SdkPolicyViolation): PolicyViolation {
  return {
    rule: sdk.rule,
    severity: narrowEnum(
      sdk.severity,
      SEVERITIES,
      'info',
      `promotionApi: unknown violation severity "${sdk.severity}" — falling back to "info".`,
    ),
    message: sdk.message,
  };
}

function adaptPromotionResponse(sdk: SdkPromotionResponse): PromotionResponse {
  return {
    promoted: sdk.promoted,
    source: sdk.source,
    target: sdk.target,
    promotion_id: sdk.promotion_id ?? undefined,
    policy_violations: sdk.policy_violations.map(adaptPolicyViolation),
    message: sdk.message ?? undefined,
  };
}

function adaptBulkPromotionResponse(
  sdk: SdkBulkPromotionResponse,
): BulkPromotionResponse {
  return {
    total: sdk.total,
    promoted: sdk.promoted,
    failed: sdk.failed,
    results: sdk.results.map(adaptPromotionResponse),
  };
}

// SDK type leak: SdkPromotionHistoryEntry.policy_result is
// `{[key: string]: unknown} | null`, but the local PromotionHistoryEntry
// declares `policy_result?: PolicyEvaluationResult`. The local type is
// nominally typed but the consumer (`promotion/page.tsx` /
// `approvals/page.tsx`) only does `policy_result?.violations?.length`
// and `policy_result?.passed` — both of which work on the bag. Cast
// through `unknown` to bridge the lie at the boundary. Track removal
// in #359 once the SDK exposes a typed PolicyEvaluationResult.
function adaptPromotionHistoryEntry(
  sdk: SdkPromotionHistoryEntry,
): PromotionHistoryEntry {
  return {
    id: sdk.id,
    artifact_id: sdk.artifact_id,
    artifact_path: sdk.artifact_path,
    source_repo_key: sdk.source_repo_key,
    target_repo_key: sdk.target_repo_key,
    promoted_by: sdk.promoted_by ?? undefined,
    promoted_by_username: sdk.promoted_by_username ?? undefined,
    policy_result:
      sdk.policy_result == null
        ? undefined
        : (sdk.policy_result as unknown as PromotionHistoryEntry['policy_result']),
    notes: sdk.notes ?? undefined,
    status: narrowEnum(
      sdk.status,
      HISTORY_STATUSES,
      'pending_approval',
      `promotionApi: unknown history status "${sdk.status}" — falling back to "pending_approval".`,
    ),
    rejection_reason: sdk.rejection_reason ?? undefined,
    created_at: sdk.created_at,
  };
}

function adaptPromotionHistory(
  sdk: SdkPromotionHistoryResponse,
): PromotionHistoryResponse {
  return {
    items: sdk.items.map(adaptPromotionHistoryEntry),
    pagination: sdk.pagination,
  };
}

function adaptPromoteRequest(
  req: PromoteArtifactRequest,
): SdkPromoteArtifactRequest {
  return {
    target_repository: req.target_repository,
    skip_policy_check: req.skip_policy_check,
    notes: req.notes,
  };
}

function adaptBulkPromoteRequest(
  req: BulkPromoteRequest,
): SdkBulkPromoteRequest {
  return {
    target_repository: req.target_repository,
    artifact_ids: req.artifact_ids,
    skip_policy_check: req.skip_policy_check,
    notes: req.notes,
  };
}

export const promotionApi = {
  /**
   * List all staging repositories
   */
  listStagingRepos: async (params?: {
    page?: number;
    per_page?: number;
    format?: string;
  }): Promise<PaginatedResponse<Repository>> => {
    const { data, error } = await sdkListRepositories({
      query: { ...params, type: 'staging' },
    });
    if (error) throw error;
    return adaptRepositoryList(
      assertData(data, 'promotionApi.listStagingRepos'),
    );
  },

  /**
   * List artifacts in a staging repository
   */
  listStagingArtifacts: async (
    repoKey: string,
    params?: {
      page?: number;
      per_page?: number;
      path_prefix?: string;
    },
  ): Promise<PaginatedResponse<Artifact>> => {
    const { data, error } = await sdkListArtifacts({
      path: { key: repoKey },
      query: params,
    });
    if (error) throw error;
    return adaptArtifactList(
      assertData(data, 'promotionApi.listStagingArtifacts'),
    );
  },

  /**
   * List local (release) repositories that can be promotion targets
   */
  listReleaseRepos: async (params?: {
    format?: string;
  }): Promise<PaginatedResponse<Repository>> => {
    const { data, error } = await sdkListRepositories({
      query: { ...params, type: 'local', per_page: 100 },
    });
    if (error) throw error;
    return adaptRepositoryList(
      assertData(data, 'promotionApi.listReleaseRepos'),
    );
  },

  /**
   * Promote a single artifact from staging to release
   */
  promoteArtifact: async (
    repoKey: string,
    artifactId: string,
    request: PromoteArtifactRequest,
  ): Promise<PromotionResponse> => {
    const { data, error } = await sdkPromoteArtifact({
      path: { key: repoKey, artifact_id: artifactId },
      body: adaptPromoteRequest(request),
    });
    if (error) throw error;
    return adaptPromotionResponse(
      assertData(data, 'promotionApi.promoteArtifact'),
    );
  },

  /**
   * Promote multiple artifacts from staging to release
   */
  promoteBulk: async (
    repoKey: string,
    request: BulkPromoteRequest,
  ): Promise<BulkPromotionResponse> => {
    const { data, error } = await sdkPromoteArtifactsBulk({
      path: { key: repoKey },
      body: adaptBulkPromoteRequest(request),
    });
    if (error) throw error;
    return adaptBulkPromotionResponse(
      assertData(data, 'promotionApi.promoteBulk'),
    );
  },

  /**
   * Get promotion history for a repository
   */
  getPromotionHistory: async (
    repoKey: string,
    params?: {
      page?: number;
      per_page?: number;
      artifact_id?: string;
      status?: string;
    },
  ): Promise<PromotionHistoryResponse> => {
    const { data, error } = await sdkPromotionHistory({
      path: { key: repoKey },
      query: params,
    });
    if (error) throw error;
    return adaptPromotionHistory(
      assertData(data, 'promotionApi.getPromotionHistory'),
    );
  },

  /**
   * Reject a staging artifact (raw fetch — endpoint not in SDK).
   */
  rejectArtifact: async (
    repoKey: string,
    artifactId: string,
    request: RejectArtifactRequest,
  ): Promise<RejectArtifactResponse> => {
    const baseUrl = getActiveInstanceBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/v1/promotion/repositories/${encodeURIComponent(repoKey)}/artifacts/${encodeURIComponent(artifactId)}/reject`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.message || body.error || `Rejection failed: ${response.status}`,
      );
    }
    return response.json();
  },
};
