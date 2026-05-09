import '@/lib/sdk-client';
import { listPackages, getPackage, getPackageVersions } from '@artifact-keeper/sdk';
import type {
  PackageResponse,
  PackageListResponse,
  PackageVersionsResponse,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { assertData } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { Package, PackageVersion } from '@/types/packages';
import type { Package, PackageVersion } from '@/types/packages';

export interface ListPackagesParams {
  page?: number;
  per_page?: number;
  repository_key?: string;
  format?: string;
  search?: string;
}

// SDK PackageResponse uses `description: string | null | undefined`; the local
// Package uses `description?: string | undefined`. Adapt the optional field.
function adaptPackage(sdk: PackageResponse): Package {
  return {
    id: sdk.id,
    repository_key: sdk.repository_key,
    name: sdk.name,
    version: sdk.version,
    format: sdk.format,
    description: sdk.description ?? undefined,
    size_bytes: sdk.size_bytes,
    download_count: sdk.download_count,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
    metadata: sdk.metadata,
  };
}

function adaptPackageList(sdk: PackageListResponse): PaginatedResponse<Package> {
  return {
    items: sdk.items.map(adaptPackage),
    pagination: sdk.pagination,
  };
}

export const packagesApi = {
  list: async (params: ListPackagesParams = {}): Promise<PaginatedResponse<Package>> => {
    const { data, error } = await listPackages({ query: params });
    if (error) throw error;
    return adaptPackageList(assertData(data, 'packages.list'));
  },

  get: async (packageId: string): Promise<Package> => {
    const { data, error } = await getPackage({ path: { id: packageId } });
    if (error) throw error;
    return adaptPackage(assertData(data, 'packages.get'));
  },

  getVersions: async (packageId: string): Promise<PackageVersion[]> => {
    const { data, error } = await getPackageVersions({ path: { id: packageId } });
    if (error) throw error;
    const response: PackageVersionsResponse = assertData(data, 'packages.getVersions');
    return response.versions;
  },
};

export default packagesApi;
