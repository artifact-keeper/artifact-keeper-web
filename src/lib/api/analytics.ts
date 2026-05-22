import '@/lib/sdk-client';
import {
  getStorageTrend as sdkGetStorageTrend,
  getStorageBreakdown as sdkGetStorageBreakdown,
  getGrowthSummary as sdkGetGrowthSummary,
  getStaleArtifacts as sdkGetStaleArtifacts,
  getDownloadTrends as sdkGetDownloadTrends,
  getRepositoryTrend as sdkGetRepositoryTrend,
  captureSnapshot as sdkCaptureSnapshot,
} from '@artifact-keeper/sdk';
import type {
  StorageSnapshot as SdkStorageSnapshot,
  RepositorySnapshot as SdkRepositorySnapshot,
  RepositoryStorageBreakdown as SdkRepositoryStorageBreakdown,
  StaleArtifact as SdkStaleArtifact,
  GrowthSummary as SdkGrowthSummary,
  DownloadTrend as SdkDownloadTrend,
} from '@artifact-keeper/sdk';
import type {
  StorageSnapshot,
  RepositorySnapshot,
  RepositoryStorageBreakdown,
  StaleArtifact,
  GrowthSummary,
  DownloadTrend,
  DateRangeQuery,
  StaleQuery,
} from '@/types/analytics';
import { assertData } from '@/lib/api/fetch';

// SDK ⇄ local shape adapters. The SDK declares optional+nullable
// (`?: string | null`) for several fields the local types declare as
// required-but-nullable (`: string | null`); these adapters normalize
// undefined → null so callers see a stable contract (#206 / #359).

function adaptStorageSnapshot(sdk: SdkStorageSnapshot): StorageSnapshot {
  return {
    snapshot_date: sdk.snapshot_date,
    total_repositories: sdk.total_repositories,
    total_artifacts: sdk.total_artifacts,
    total_storage_bytes: sdk.total_storage_bytes,
    total_downloads: sdk.total_downloads,
    total_users: sdk.total_users,
  };
}

function adaptRepositorySnapshot(sdk: SdkRepositorySnapshot): RepositorySnapshot {
  return {
    repository_id: sdk.repository_id,
    repository_name: sdk.repository_name ?? null,
    repository_key: sdk.repository_key ?? null,
    snapshot_date: sdk.snapshot_date,
    artifact_count: sdk.artifact_count,
    storage_bytes: sdk.storage_bytes,
    download_count: sdk.download_count,
  };
}

function adaptRepositoryStorageBreakdown(
  sdk: SdkRepositoryStorageBreakdown,
): RepositoryStorageBreakdown {
  return {
    repository_id: sdk.repository_id,
    repository_key: sdk.repository_key,
    repository_name: sdk.repository_name,
    format: sdk.format,
    artifact_count: sdk.artifact_count,
    storage_bytes: sdk.storage_bytes,
    download_count: sdk.download_count,
    last_upload_at: sdk.last_upload_at ?? null,
  };
}

function adaptStaleArtifact(sdk: SdkStaleArtifact): StaleArtifact {
  return {
    artifact_id: sdk.artifact_id,
    repository_key: sdk.repository_key,
    name: sdk.name,
    path: sdk.path,
    size_bytes: sdk.size_bytes,
    created_at: sdk.created_at,
    last_downloaded_at: sdk.last_downloaded_at ?? null,
    days_since_download: sdk.days_since_download,
    download_count: sdk.download_count,
  };
}

function adaptGrowthSummary(sdk: SdkGrowthSummary): GrowthSummary {
  return {
    period_start: sdk.period_start,
    period_end: sdk.period_end,
    storage_bytes_start: sdk.storage_bytes_start,
    storage_bytes_end: sdk.storage_bytes_end,
    storage_growth_bytes: sdk.storage_growth_bytes,
    storage_growth_percent: sdk.storage_growth_percent,
    artifacts_start: sdk.artifacts_start,
    artifacts_end: sdk.artifacts_end,
    artifacts_added: sdk.artifacts_added,
    downloads_in_period: sdk.downloads_in_period,
  };
}

function adaptDownloadTrend(sdk: SdkDownloadTrend): DownloadTrend {
  return {
    date: sdk.date,
    download_count: sdk.download_count,
  };
}

const analyticsApi = {
  getStorageTrend: async (
    params?: DateRangeQuery,
  ): Promise<StorageSnapshot[]> => {
    const { data, error } = await sdkGetStorageTrend({ query: params });
    if (error) throw error;
    return assertData(data, 'analyticsApi.getStorageTrend').map(adaptStorageSnapshot);
  },

  getStorageBreakdown: async (): Promise<RepositoryStorageBreakdown[]> => {
    const { data, error } = await sdkGetStorageBreakdown();
    if (error) throw error;
    return assertData(data, 'analyticsApi.getStorageBreakdown').map(
      adaptRepositoryStorageBreakdown,
    );
  },

  getGrowthSummary: async (
    params?: DateRangeQuery,
  ): Promise<GrowthSummary> => {
    const { data, error } = await sdkGetGrowthSummary({ query: params });
    if (error) throw error;
    return adaptGrowthSummary(assertData(data, 'analyticsApi.getGrowthSummary'));
  },

  getStaleArtifacts: async (
    params?: StaleQuery,
  ): Promise<StaleArtifact[]> => {
    const { data, error } = await sdkGetStaleArtifacts({ query: params });
    if (error) throw error;
    return assertData(data, 'analyticsApi.getStaleArtifacts').map(adaptStaleArtifact);
  },

  getDownloadTrends: async (
    params?: DateRangeQuery,
  ): Promise<DownloadTrend[]> => {
    const { data, error } = await sdkGetDownloadTrends({ query: params });
    if (error) throw error;
    return assertData(data, 'analyticsApi.getDownloadTrends').map(adaptDownloadTrend);
  },

  getRepositoryTrend: async (
    repositoryId: string,
    params?: DateRangeQuery,
  ): Promise<RepositorySnapshot[]> => {
    const { data, error } = await sdkGetRepositoryTrend({
      path: { id: repositoryId },
      query: params,
    });
    if (error) throw error;
    return assertData(data, 'analyticsApi.getRepositoryTrend').map(
      adaptRepositorySnapshot,
    );
  },

  captureSnapshot: async (): Promise<void> => {
    const { error } = await sdkCaptureSnapshot();
    if (error) throw error;
  },
};

export default analyticsApi;
