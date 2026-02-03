import apiClient from "@/lib/api-client";
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
    const { data } = await apiClient.get("/api/v1/admin/analytics/storage/trend", { params });
    return data;
  },

  getStorageBreakdown: async (): Promise<RepositoryStorageBreakdown[]> => {
    const { data } = await apiClient.get("/api/v1/admin/analytics/storage/breakdown");
    return data;
  },

  getGrowthSummary: async (
    params?: DateRangeQuery
  ): Promise<GrowthSummary> => {
    const { data } = await apiClient.get("/api/v1/admin/analytics/storage/growth", { params });
    return data;
  },

  getStaleArtifacts: async (
    params?: StaleQuery
  ): Promise<StaleArtifact[]> => {
    const { data } = await apiClient.get("/api/v1/admin/analytics/artifacts/stale", { params });
    return data;
  },

  getDownloadTrends: async (
    params?: DateRangeQuery
  ): Promise<DownloadTrend[]> => {
    const { data } = await apiClient.get("/api/v1/admin/analytics/downloads/trend", { params });
    return data;
  },

  getRepositoryTrend: async (
    repositoryId: string,
    params?: DateRangeQuery
  ): Promise<RepositorySnapshot[]> => {
    const { data } = await apiClient.get(
      `/api/v1/admin/analytics/repositories/${repositoryId}/trend`,
      { params }
    );
    return data;
  },

  captureSnapshot: async (): Promise<void> => {
    await apiClient.post("/api/v1/admin/analytics/snapshot");
  },
};

export default analyticsApi;
