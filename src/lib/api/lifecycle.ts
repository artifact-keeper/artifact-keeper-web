import apiClient from "@/lib/api-client";
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  UpdateLifecyclePolicyRequest,
  PolicyExecutionResult,
  ListPoliciesQuery,
} from "@/types/lifecycle";

const lifecycleApi = {
  list: async (params?: ListPoliciesQuery): Promise<LifecyclePolicy[]> => {
    const { data } = await apiClient.get("/api/v1/admin/lifecycle", { params });
    return data;
  },

  get: async (id: string): Promise<LifecyclePolicy> => {
    const { data } = await apiClient.get(`/api/v1/admin/lifecycle/${id}`);
    return data;
  },

  create: async (req: CreateLifecyclePolicyRequest): Promise<LifecyclePolicy> => {
    const { data } = await apiClient.post("/api/v1/admin/lifecycle", req);
    return data;
  },

  update: async (
    id: string,
    req: UpdateLifecyclePolicyRequest
  ): Promise<LifecyclePolicy> => {
    const { data } = await apiClient.put(`/api/v1/admin/lifecycle/${id}`, req);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/lifecycle/${id}`);
  },

  execute: async (id: string): Promise<PolicyExecutionResult> => {
    const { data } = await apiClient.post(
      `/api/v1/admin/lifecycle/${id}/execute`
    );
    return data;
  },

  preview: async (id: string): Promise<PolicyExecutionResult> => {
    const { data } = await apiClient.post(
      `/api/v1/admin/lifecycle/${id}/preview`
    );
    return data;
  },

  executeAll: async (): Promise<PolicyExecutionResult[]> => {
    const { data } = await apiClient.post(
      "/api/v1/admin/lifecycle/execute-all"
    );
    return data;
  },
};

export default lifecycleApi;
