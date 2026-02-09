/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import { listPackages, getPackage, getPackageVersions } from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';

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

export const packagesApi = {
  list: async (params: ListPackagesParams = {}): Promise<PaginatedResponse<Package>> => {
    const { data, error } = await listPackages({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Package>;
  },

  get: async (packageId: string): Promise<Package> => {
    const { data, error } = await getPackage({ path: { id: packageId } });
    if (error) throw error;
    return data as any as Package;
  },

  getVersions: async (packageId: string): Promise<PackageVersion[]> => {
    const { data, error } = await getPackageVersions({ path: { id: packageId } });
    if (error) throw error;
    return (data as any).versions as PackageVersion[];
  },
};

export default packagesApi;
