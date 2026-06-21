import '@/lib/sdk-client';
import {
  listCurationPackages,
  getCurationPackage,
  approvePackage,
  blockPackage,
  bulkApprove,
  bulkBlock,
  reEvaluate,
} from '@artifact-keeper/sdk';
import type { PackageResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/**
 * A package awaiting curation review in a staging repository. Curation gates
 * artifacts proxied from upstreams so they can be approved or blocked before
 * promotion (supply-chain control).
 */
export interface CurationPackage {
  id: string;
  name: string;
  version: string;
  format: string;
  repository_key: string;
  description: string | null;
  size_bytes: number;
  download_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListCurationParams {
  /** `pending` | `approved` | `blocked` (server-side filter). */
  status?: string;
  limit?: number;
  offset?: number;
}

function adaptPackage(sdk: PackageResponse): CurationPackage {
  return {
    id: sdk.id,
    name: sdk.name,
    version: sdk.version,
    format: sdk.format,
    repository_key: sdk.repository_key,
    description: sdk.description ?? null,
    size_bytes: sdk.size_bytes,
    download_count: sdk.download_count,
    metadata: sdk.metadata ?? {},
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

const curationApi = {
  /** List packages in a staging repo's curation queue. */
  listPackages: async (
    stagingRepoId: string,
    params: ListCurationParams = {},
  ): Promise<CurationPackage[]> => {
    const { data, error } = await listCurationPackages({
      query: { staging_repo_id: stagingRepoId, ...params },
    });
    if (error) throw error;
    return assertData(data, 'curationApi.listPackages').map(adaptPackage);
  },

  getPackage: async (id: string): Promise<CurationPackage> => {
    const { data, error } = await getCurationPackage({ path: { id } });
    if (error) throw error;
    return adaptPackage(assertData(data, 'curationApi.getPackage'));
  },

  approve: async (id: string): Promise<CurationPackage> => {
    const { data, error } = await approvePackage({ path: { id } });
    if (error) throw error;
    return adaptPackage(assertData(data, 'curationApi.approve'));
  },

  block: async (id: string): Promise<CurationPackage> => {
    const { data, error } = await blockPackage({ path: { id } });
    if (error) throw error;
    return adaptPackage(assertData(data, 'curationApi.block'));
  },

  /** Approve many packages at once; returns the number affected. */
  bulkApprove: async (ids: string[], reason: string): Promise<number> => {
    const { data, error } = await bulkApprove({ body: { ids, reason } });
    if (error) throw error;
    return assertData(data, 'curationApi.bulkApprove');
  },

  /** Block many packages at once; returns the number affected. */
  bulkBlock: async (ids: string[], reason: string): Promise<number> => {
    const { data, error } = await bulkBlock({ body: { ids, reason } });
    if (error) throw error;
    return assertData(data, 'curationApi.bulkBlock');
  },

  /** Re-run curation rules over a staging repo; returns the number re-evaluated. */
  reEvaluate: async (stagingRepoId: string, defaultAction: string): Promise<number> => {
    const { data, error } = await reEvaluate({
      body: { staging_repo_id: stagingRepoId, default_action: defaultAction },
    });
    if (error) throw error;
    return assertData(data, 'curationApi.reEvaluate');
  },
};

export default curationApi;
