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
  CreateLifecyclePolicyRequest as SdkCreateLifecyclePolicyRequest,
  UpdateLifecyclePolicyRequest as SdkUpdateLifecyclePolicyRequest,
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
  // INTENTIONAL DROP: SDK exposes `cron_schedule?: string | null` but no
  // current consumer reads it and the local LifecyclePolicy type omits the
  // field. If a future "next run" UI surfaces this, add it to the local
  // type AND to the body of this adapter — don't just forward through.
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

// SDK 1.5.0 (#359) split the lifecycle request schemas out from the *security
// policies* schemas (block_on_fail, max_severity, …): `createLifecyclePolicy` /
// `updateLifecyclePolicy` now correctly declare their bodies as
// `CreateLifecyclePolicyRequest` / `UpdateLifecyclePolicyRequest`, so the old
// double-cast-through-`unknown` workaround is gone. Fields are still forwarded
// explicitly (typed as the local request shape) so adding a local field forces
// an adapter update rather than silently drifting.
function adaptCreateRequest(req: CreateLifecyclePolicyRequest): SdkCreateLifecyclePolicyRequest {
  return {
    name: req.name,
    policy_type: req.policy_type,
    config: req.config,
    repository_id: req.repository_id,
    description: req.description,
    priority: req.priority,
  };
}
function adaptUpdateRequest(req: UpdateLifecyclePolicyRequest): SdkUpdateLifecyclePolicyRequest {
  return {
    name: req.name,
    description: req.description,
    enabled: req.enabled,
    config: req.config,
    priority: req.priority,
  };
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
