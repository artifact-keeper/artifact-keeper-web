/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listLifecyclePolicies as sdkListLifecyclePolicies,
  getLifecyclePolicy as sdkGetLifecyclePolicy,
  createLifecyclePolicy as sdkCreateLifecyclePolicy,
  updateLifecyclePolicy as sdkUpdateLifecyclePolicy,
  deleteLifecyclePolicy as sdkDeleteLifecyclePolicy,
  executePolicy as sdkExecutePolicy,
  previewPolicy as sdkPreviewPolicy,
  executeAllPolicies as sdkExecuteAllPolicies,
} from '@artifact-keeper/sdk';
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  UpdateLifecyclePolicyRequest,
  PolicyExecutionResult,
  ListPoliciesQuery,
} from "@/types/lifecycle";

const lifecycleApi = {
  list: async (params?: ListPoliciesQuery): Promise<LifecyclePolicy[]> => {
    const { data, error } = await sdkListLifecyclePolicies({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  get: async (id: string): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkGetLifecyclePolicy({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  create: async (req: CreateLifecyclePolicyRequest): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkCreateLifecyclePolicy({ body: req as any });
    if (error) throw error;
    return data as any;
  },

  update: async (
    id: string,
    req: UpdateLifecyclePolicyRequest
  ): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkUpdateLifecyclePolicy({ path: { id }, body: req as any });
    if (error) throw error;
    return data as any;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLifecyclePolicy({ path: { id } });
    if (error) throw error;
  },

  execute: async (id: string): Promise<PolicyExecutionResult> => {
    const { data, error } = await sdkExecutePolicy({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  preview: async (id: string): Promise<PolicyExecutionResult> => {
    const { data, error } = await sdkPreviewPolicy({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  executeAll: async (): Promise<PolicyExecutionResult[]> => {
    const { data, error } = await sdkExecuteAllPolicies();
    if (error) throw error;
    return data as any;
  },
};

export default lifecycleApi;
