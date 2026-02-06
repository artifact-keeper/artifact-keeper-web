import apiClient from '@/lib/api-client';
import type {
  PromoteArtifactRequest,
  BulkPromoteRequest,
  PromotionResponse,
  BulkPromotionResponse,
  PromotionHistoryResponse,
} from '@/types/promotion';
import type { Repository, PaginatedResponse, Artifact } from '@/types';

export const promotionApi = {
  /**
   * List all staging repositories
   */
  listStagingRepos: async (params?: {
    page?: number;
    per_page?: number;
    format?: string;
  }): Promise<PaginatedResponse<Repository>> => {
    const { data } = await apiClient.get<PaginatedResponse<Repository>>('/api/v1/repositories', {
      params: {
        ...params,
        repo_type: 'staging',
      },
    });
    return data;
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
    }
  ): Promise<PaginatedResponse<Artifact>> => {
    const { data } = await apiClient.get<PaginatedResponse<Artifact>>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/artifacts`,
      { params }
    );
    return data;
  },

  /**
   * List local (release) repositories that can be promotion targets
   */
  listReleaseRepos: async (params?: {
    format?: string;
  }): Promise<PaginatedResponse<Repository>> => {
    const { data } = await apiClient.get<PaginatedResponse<Repository>>('/api/v1/repositories', {
      params: {
        ...params,
        repo_type: 'local',
        per_page: 100,
      },
    });
    return data;
  },

  /**
   * Promote a single artifact from staging to release
   */
  promoteArtifact: async (
    repoKey: string,
    artifactId: string,
    request: PromoteArtifactRequest
  ): Promise<PromotionResponse> => {
    const { data } = await apiClient.post<PromotionResponse>(
      `/api/v1/promotion/repositories/${encodeURIComponent(repoKey)}/artifacts/${artifactId}/promote`,
      request
    );
    return data;
  },

  /**
   * Promote multiple artifacts from staging to release
   */
  promoteBulk: async (
    repoKey: string,
    request: BulkPromoteRequest
  ): Promise<BulkPromotionResponse> => {
    const { data } = await apiClient.post<BulkPromotionResponse>(
      `/api/v1/promotion/repositories/${encodeURIComponent(repoKey)}/promote`,
      request
    );
    return data;
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
    }
  ): Promise<PromotionHistoryResponse> => {
    const { data } = await apiClient.get<PromotionHistoryResponse>(
      `/api/v1/promotion/repositories/${encodeURIComponent(repoKey)}/promotion-history`,
      { params }
    );
    return data;
  },
};
