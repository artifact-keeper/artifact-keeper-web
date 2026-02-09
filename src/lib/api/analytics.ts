/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const { data, error } = await sdkGetStorageTrend({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  getStorageBreakdown: async (): Promise<RepositoryStorageBreakdown[]> => {
    const { data, error } = await sdkGetStorageBreakdown();
    if (error) throw error;
    return data as any;
  },

  getGrowthSummary: async (
    params?: DateRangeQuery
  ): Promise<GrowthSummary> => {
    const { data, error } = await sdkGetGrowthSummary({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  getStaleArtifacts: async (
    params?: StaleQuery
  ): Promise<StaleArtifact[]> => {
    const { data, error } = await sdkGetStaleArtifacts({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  getDownloadTrends: async (
    params?: DateRangeQuery
  ): Promise<DownloadTrend[]> => {
    const { data, error } = await sdkGetDownloadTrends({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  getRepositoryTrend: async (
    repositoryId: string,
    params?: DateRangeQuery
  ): Promise<RepositorySnapshot[]> => {
    const { data, error } = await sdkGetRepositoryTrend({
      path: { id: repositoryId },
      query: params as any,
    });
    if (error) throw error;
    return data as any;
  },

  captureSnapshot: async (): Promise<void> => {
    const { error } = await sdkCaptureSnapshot();
    if (error) throw error;
  },
};

export default analyticsApi;
