import apiClient from "@/lib/api-client";
import type {
  ServiceHealthEntry,
  AlertState,
  HealthLogQuery,
  SuppressRequest,
} from "@/types/monitoring";

const monitoringApi = {
  getHealthLog: async (
    params?: HealthLogQuery
  ): Promise<ServiceHealthEntry[]> => {
    const { data } = await apiClient.get(
      "/api/v1/admin/monitoring/health-log",
      { params }
    );
    return data;
  },

  getAlerts: async (): Promise<AlertState[]> => {
    const { data } = await apiClient.get("/api/v1/admin/monitoring/alerts");
    return data;
  },

  suppressAlert: async (req: SuppressRequest): Promise<void> => {
    await apiClient.post("/api/v1/admin/monitoring/alerts/suppress", req);
  },

  triggerCheck: async (): Promise<ServiceHealthEntry[]> => {
    const { data } = await apiClient.post("/api/v1/admin/monitoring/check");
    return data;
  },
};

export default monitoringApi;
