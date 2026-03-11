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
  StorageSnapshot,
  RepositorySnapshot,
  RepositoryStorageBreakdown,
  StaleArtifact,
  GrowthSummary,
  DownloadTrend,
  DateRangeQuery,
  StaleQuery,
} from "@/types/analytics";

const analyticsApi = {
  getStorageTrend: async (
    params?: DateRangeQuery
  ): Promise<StorageSnapshot[]> => {
    const { data, error } = await sdkGetStorageTrend({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  getStorageBreakdown: async (): Promise<RepositoryStorageBreakdown[]> => {
    const { data, error } = await sdkGetStorageBreakdown();
    if (error) throw error;
    return data as never;
  },

  getGrowthSummary: async (
    params?: DateRangeQuery
  ): Promise<GrowthSummary> => {
    const { data, error } = await sdkGetGrowthSummary({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  getStaleArtifacts: async (
    params?: StaleQuery
  ): Promise<StaleArtifact[]> => {
    const { data, error } = await sdkGetStaleArtifacts({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  getDownloadTrends: async (
    params?: DateRangeQuery
  ): Promise<DownloadTrend[]> => {
    const { data, error } = await sdkGetDownloadTrends({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  getRepositoryTrend: async (
    repositoryId: string,
    params?: DateRangeQuery
  ): Promise<RepositorySnapshot[]> => {
    const { data, error } = await sdkGetRepositoryTrend({
      path: { id: repositoryId },
      query: params as never,
    });
    if (error) throw error;
    return data as never;
  },

  captureSnapshot: async (): Promise<void> => {
    const { error } = await sdkCaptureSnapshot();
    if (error) throw error;
  },
};

export default analyticsApi;
