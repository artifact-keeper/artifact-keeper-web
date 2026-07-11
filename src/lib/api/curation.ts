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
import type { CurationPackageResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/**
 * A package awaiting curation review in a staging repository. Curation gates
 * artifacts proxied from upstreams so they can be approved or blocked before
 * promotion (supply-chain control).
 *
 * SDK 1.5.0 renamed the curation endpoints' payload from the generic
 * `PackageResponse` to the purpose-built `CurationPackageResponse` and, in the
 * process, changed its shape to the fields the curation queue actually carries:
 * the upstream coordinate (`package_name` / `version` / `upstream_path`), the
 * source/target repos, and a per-row `status`. The generic package fields
 * (`repository_key`, `size_bytes`, `download_count`, `created_at`,
 * `updated_at`, `description`) are no longer served for curation rows.
 */
export interface CurationPackage {
  id: string;
  name: string;
  version: string;
  format: string;
  /** Per-package curation state: `pending` | `approved` | `blocked`. */
  status: string;
  metadata: Record<string, unknown>;
  staging_repo_id: string;
  remote_repo_id: string;
  /** Path of the package on the upstream it was proxied from. */
  upstream_path: string;
  /** When the package first entered the curation queue, RFC 3339. */
  first_seen_at: string;
}

export interface ListCurationParams {
  /** `pending` | `approved` | `blocked` (server-side filter). */
  status?: string;
  limit?: number;
  offset?: number;
}

function adaptPackage(sdk: CurationPackageResponse): CurationPackage {
  return {
    id: sdk.id,
    name: sdk.package_name,
    version: sdk.version,
    format: sdk.format,
    status: sdk.status,
    metadata: sdk.metadata ?? {},
    staging_repo_id: sdk.staging_repo_id,
    remote_repo_id: sdk.remote_repo_id,
    upstream_path: sdk.upstream_path,
    first_seen_at: sdk.first_seen_at,
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
