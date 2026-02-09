/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listRepositories as sdkListRepositories,
  listArtifacts as sdkListArtifacts,
  promoteArtifact as sdkPromoteArtifact,
  promoteArtifactsBulk as sdkPromoteArtifactsBulk,
  promotionHistory as sdkPromotionHistory,
} from '@artifact-keeper/sdk';
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
    const { data, error } = await sdkListRepositories({
      query: {
        ...params,
        repo_type: 'staging',
      } as any,
    });
    if (error) throw error;
    return data as any;
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
    const { data, error } = await sdkListArtifacts({
      path: { key: repoKey },
      query: params as any,
    });
    if (error) throw error;
    return data as any;
  },

  /**
   * List local (release) repositories that can be promotion targets
   */
  listReleaseRepos: async (params?: {
    format?: string;
  }): Promise<PaginatedResponse<Repository>> => {
    const { data, error } = await sdkListRepositories({
      query: {
        ...params,
        repo_type: 'local',
        per_page: 100,
      } as any,
    });
    if (error) throw error;
    return data as any;
  },

  /**
   * Promote a single artifact from staging to release
   */
  promoteArtifact: async (
    repoKey: string,
    artifactId: string,
    request: PromoteArtifactRequest
  ): Promise<PromotionResponse> => {
    const { data, error } = await sdkPromoteArtifact({
      path: { key: repoKey, artifact_id: artifactId },
      body: request as any,
    });
    if (error) throw error;
    return data as any;
  },

  /**
   * Promote multiple artifacts from staging to release
   */
  promoteBulk: async (
    repoKey: string,
    request: BulkPromoteRequest
  ): Promise<BulkPromotionResponse> => {
    const { data, error } = await sdkPromoteArtifactsBulk({
      path: { key: repoKey },
      body: request as any,
    });
    if (error) throw error;
    return data as any;
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
    const { data, error } = await sdkPromotionHistory({
      path: { key: repoKey },
      query: params as any,
    });
    if (error) throw error;
    return data as any;
  },
};
