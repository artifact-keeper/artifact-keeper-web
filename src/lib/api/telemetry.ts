import apiClient from "@/lib/api-client";
import type {
  CrashReport,
  TelemetrySettings,
  CrashListResponse,
  SubmitResponse,
} from "@/types/telemetry";

const telemetryApi = {
  getSettings: async (): Promise<TelemetrySettings> => {
    const { data } = await apiClient.get("/api/v1/admin/telemetry/settings");
    return data;
  },

  updateSettings: async (
    settings: TelemetrySettings
  ): Promise<TelemetrySettings> => {
    const { data } = await apiClient.post(
      "/api/v1/admin/telemetry/settings",
      settings
    );
    return data;
  },

  listCrashes: async (params?: {
    page?: number;
    per_page?: number;
  }): Promise<CrashListResponse> => {
    const { data } = await apiClient.get("/api/v1/admin/telemetry/crashes", {
      params,
    });
    return data;
  },

  listPending: async (): Promise<CrashReport[]> => {
    const { data } = await apiClient.get(
      "/api/v1/admin/telemetry/crashes/pending"
    );
    return data;
  },

  getCrash: async (id: string): Promise<CrashReport> => {
    const { data } = await apiClient.get(
      `/api/v1/admin/telemetry/crashes/${id}`
    );
    return data;
  },

  submitCrashes: async (ids: string[]): Promise<SubmitResponse> => {
    const { data } = await apiClient.post(
      "/api/v1/admin/telemetry/crashes/submit",
      { ids }
    );
    return data;
  },

  deleteCrash: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/telemetry/crashes/${id}`);
  },
};

export default telemetryApi;
