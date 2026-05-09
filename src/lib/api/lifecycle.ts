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
  LifecyclePolicy as SdkLifecyclePolicy,
  PolicyExecutionResult as SdkPolicyExecutionResult,
  CreatePolicyRequest as SdkCreatePolicyRequest,
  UpdatePolicyRequest as SdkUpdatePolicyRequest,
} from '@artifact-keeper/sdk';
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  UpdateLifecyclePolicyRequest,
  PolicyExecutionResult,
  ListPoliciesQuery,
} from '@/types/lifecycle';
import { assertData } from '@/lib/api/fetch';

// SDK ⇄ local shape adapters. The SDK types declare optional+nullable
// (`?: string | null`) for fields the local types declare as
// required-but-nullable (`: string | null`); these adapters normalize
// undefined → null so callers see a stable shape (#206 / #359).

function adaptLifecyclePolicy(sdk: SdkLifecyclePolicy): LifecyclePolicy {
  return {
    id: sdk.id,
    repository_id: sdk.repository_id ?? null,
    name: sdk.name,
    description: sdk.description ?? null,
    enabled: sdk.enabled,
    policy_type: sdk.policy_type,
    config: sdk.config,
    priority: sdk.priority,
    last_run_at: sdk.last_run_at ?? null,
    last_run_items_removed: sdk.last_run_items_removed ?? null,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptPolicyExecutionResult(
  sdk: SdkPolicyExecutionResult
): PolicyExecutionResult {
  return {
    policy_id: sdk.policy_id,
    policy_name: sdk.policy_name,
    dry_run: sdk.dry_run,
    artifacts_matched: sdk.artifacts_matched,
    artifacts_removed: sdk.artifacts_removed,
    bytes_freed: sdk.bytes_freed,
    errors: sdk.errors,
  };
}

// SDK type leak: the generated `createLifecyclePolicy` / `updateLifecyclePolicy`
// declare their bodies as `CreatePolicyRequest` / `UpdatePolicyRequest`, which
// belong to the *security policies* endpoints (block_on_fail, max_severity, …)
// and have nothing to do with lifecycle policies. The actual backend accepts
// the local `CreateLifecyclePolicyRequest` shape (policy_type, config, …);
// we double-cast through `unknown` to bypass the wrong SDK type while still
// handing the SDK call a typed object. Track removal in #359 once the
// generator is rebuilt against the corrected OpenAPI spec.
function adaptCreateRequest(req: CreateLifecyclePolicyRequest): SdkCreatePolicyRequest {
  return req as unknown as SdkCreatePolicyRequest;
}
function adaptUpdateRequest(req: UpdateLifecyclePolicyRequest): SdkUpdatePolicyRequest {
  return req as unknown as SdkUpdatePolicyRequest;
}

const lifecycleApi = {
  list: async (params?: ListPoliciesQuery): Promise<LifecyclePolicy[]> => {
    const { data, error } = await sdkListLifecyclePolicies({ query: params });
    if (error) throw error;
    return assertData(data, 'lifecycleApi.list').map(adaptLifecyclePolicy);
  },

  get: async (id: string): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkGetLifecyclePolicy({ path: { id } });
    if (error) throw error;
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.get'));
  },

  create: async (req: CreateLifecyclePolicyRequest): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkCreateLifecyclePolicy({
      body: adaptCreateRequest(req),
    });
    if (error) throw error;
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.create'));
  },

  update: async (
    id: string,
    req: UpdateLifecyclePolicyRequest
  ): Promise<LifecyclePolicy> => {
    const { data, error } = await sdkUpdateLifecyclePolicy({
      path: { id },
      body: adaptUpdateRequest(req),
    });
    if (error) throw error;
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.update'));
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLifecyclePolicy({ path: { id } });
    if (error) throw error;
  },

  execute: async (id: string): Promise<PolicyExecutionResult> => {
    const { data, error } = await sdkExecutePolicy({ path: { id } });
    if (error) throw error;
    return adaptPolicyExecutionResult(assertData(data, 'lifecycleApi.execute'));
  },

  preview: async (id: string): Promise<PolicyExecutionResult> => {
    const { data, error } = await sdkPreviewPolicy({ path: { id } });
    if (error) throw error;
    return adaptPolicyExecutionResult(assertData(data, 'lifecycleApi.preview'));
  },

  executeAll: async (): Promise<PolicyExecutionResult[]> => {
    const { data, error } = await sdkExecuteAllPolicies();
    if (error) throw error;
    return assertData(data, 'lifecycleApi.executeAll').map(adaptPolicyExecutionResult);
  },
};

export default lifecycleApi;
