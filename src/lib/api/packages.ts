import '@/lib/sdk-client';
import { listPackages, getPackage, getPackageVersions } from '@artifact-keeper/sdk';
import type {
  PackageResponse,
  PackageListResponse,
  PackageVersionsResponse,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { apiFetch, assertData } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { Package, PackageVersion } from '@/types/packages';
import type { Package, PackageVersion } from '@/types/packages';
import { unwrap } from '@/lib/sdk-utils';

export interface GetPackageParams {
  /**
   * Virtual-repo context for the detail lookup. When it names a virtual
   * repository that contains the package, the response reports the virtual
   * key instead of the owning member's, so the detail view agrees with the
   * aggregated listing (backend artifact-keeper#3532).
   */
  repository_key?: string;
}

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
    const data = await unwrap(listPackages({ query: params }));
    return adaptPackageList(assertData(data, 'packages.list'));
  },

  get: async (packageId: string, params: GetPackageParams = {}): Promise<Package> => {
    // `?repository_key=` is not in the generated SDK yet (backend 1.10.0,
    // artifact-keeper#3532) — `GetPackageData.query` is typed `never` — so the
    // virtual-repo context goes through `apiFetch`. Without the param the
    // generated operation is still the one used.
    if (params.repository_key) {
      const query = new URLSearchParams({ repository_key: params.repository_key });
      const data = await apiFetch<PackageResponse>(
        `/api/v1/packages/${encodeURIComponent(packageId)}?${query.toString()}`,
      );
      return adaptPackage(assertData(data, 'packages.get'));
    }
    const data = await unwrap(getPackage({ path: { id: packageId } }));
    return adaptPackage(assertData(data, 'packages.get'));
  },

  getVersions: async (
    packageId: string,
    params: GetPackageParams = {},
  ): Promise<PackageVersion[]> => {
    // Same virtual-repo context as `get`: a token scoped only to the virtual
    // repository reads the member's versions through it (backend
    // artifact-keeper#4808). `GetPackageVersionsData.query` is typed `never`
    // in the pinned SDK, so the context goes through `apiFetch`.
    if (params.repository_key) {
      const query = new URLSearchParams({ repository_key: params.repository_key });
      const response = await apiFetch<PackageVersionsResponse>(
        `/api/v1/packages/${encodeURIComponent(packageId)}/versions?${query.toString()}`,
      );
      return assertData(response, 'packages.getVersions').versions;
    }
    const data = await unwrap(getPackageVersions({ path: { id: packageId } }));
    const response: PackageVersionsResponse = assertData(data, 'packages.getVersions');
    return response.versions;
  },
};

