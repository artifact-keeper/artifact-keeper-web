import '@/lib/sdk-client';
import { client } from '@artifact-keeper/sdk/client';
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
import { unwrap } from '@/lib/sdk-utils';

const LIFECYCLE_URL = '/api/v1/admin/lifecycle';

function adaptScope(sdk: SdkLifecyclePolicy): Pick<
  LifecyclePolicy, 'applies_to_all' | 'repository_ids' | 'scope_source'
> {
  // Only old responses with BOTH fields absent may use the legacy projection.
  // A partial/malformed explicit scope must never be displayed as global.
  if (!('applies_to_all' in sdk) && !('repository_ids' in sdk)) {
    return {
      applies_to_all: sdk.repository_id == null,
      repository_ids: sdk.repository_id ? [sdk.repository_id] : [],
      scope_source: 'legacy',
    };
  }
  if (
    !('applies_to_all' in sdk) || typeof sdk.applies_to_all !== 'boolean' ||
    !('repository_ids' in sdk) || !Array.isArray(sdk.repository_ids) ||
    !sdk.repository_ids.every((id: unknown) => typeof id === 'string') ||
    (sdk.applies_to_all && sdk.repository_ids.length > 0)
  ) {
    throw new Error('Invalid lifecycle policy repository scope');
  }
  return {
    applies_to_all: sdk.applies_to_all,
    repository_ids: sdk.repository_ids,
    scope_source: 'explicit',
  };
}

// Use the configured SDK transport for not-yet-generated endpoints so cookie
// auth, CSRF, token refresh and remote-instance routing remain unchanged.
async function requireAssignmentSupport(): Promise<true> {
  const result = await client.get<{ 200: unknown }>({
    url: `${LIFECYCLE_URL}/capabilities`,
  });
  if (result.error) throw result.error;
  if (!result.response?.ok) {
    throw new Error(
      `Cannot verify cleanup policy assignment support (HTTP ${result.response?.status ?? 'unknown'}). Upgrade the backend before creating or assigning policies.`,
    );
  }
  const data = result.data;
  if (
    data === null || typeof data !== 'object' ||
    !('explicit_repository_assignment' in data) ||
    data.explicit_repository_assignment !== true
  ) {
    throw new Error('This backend does not confirm explicit cleanup policy assignment support. Upgrade the backend before creating or assigning policies.');
  }
  return true;
}

async function changeAssignment(
  id: string, repositoryId: string, method: 'PUT' | 'DELETE'
): Promise<LifecyclePolicy> {
  // Recheck at write time, not just from a possibly stale UI capability cache.
  await requireAssignmentSupport();
  const result = await client.request<{ 200: SdkLifecyclePolicy }>({
    url: `${LIFECYCLE_URL}/${encodeURIComponent(id)}/repositories/${encodeURIComponent(repositoryId)}`,
    method,
  });
  if (result.error) throw result.error;
  if (!result.response?.ok) {
    throw new Error(`Cleanup policy assignment failed (HTTP ${result.response?.status ?? 'unknown'})`);
  }
  const policy = adaptLifecyclePolicy(assertData(result.data, 'lifecycleApi.assignment'));
  if (policy.scope_source !== 'explicit') {
    throw new Error('The backend returned a legacy policy after an assignment change. Refresh and verify the policy scope.');
  }
  return policy;
}

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
    ...adaptScope(sdk),
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
// an adapter update rather than silently drifting. Scope fields extend SDK 1.7
// until it is generated from the explicit-assignment OpenAPI schema.
function adaptCreateRequest(
  req: CreateLifecyclePolicyRequest,
): SdkCreateLifecyclePolicyRequest & Pick<CreateLifecyclePolicyRequest, 'applies_to_all' | 'repository_ids'> {
  return {
    name: req.name,
    policy_type: req.policy_type,
    config: req.config,
    applies_to_all: req.applies_to_all,
    repository_ids: req.repository_ids,
    description: req.description,
    priority: req.priority,
  };
}
function adaptUpdateRequest(
  req: UpdateLifecyclePolicyRequest,
): SdkUpdateLifecyclePolicyRequest & Pick<UpdateLifecyclePolicyRequest, 'applies_to_all' | 'repository_ids'> {
  return {
    name: req.name,
    description: req.description,
    enabled: req.enabled,
    config: req.config,
    priority: req.priority,
    applies_to_all: req.applies_to_all,
    repository_ids: req.repository_ids,
  };
}

export const lifecycleApi = {
  assignmentSupport: requireAssignmentSupport,
  attach: (id: string, repositoryId: string) => changeAssignment(id, repositoryId, 'PUT'),
  detach: (id: string, repositoryId: string) => changeAssignment(id, repositoryId, 'DELETE'),

  list: async (params?: ListPoliciesQuery): Promise<LifecyclePolicy[]> => {
    const data = await unwrap(sdkListLifecyclePolicies({ query: params }));
    return assertData(data, 'lifecycleApi.list').map(adaptLifecyclePolicy);
  },

  get: async (id: string): Promise<LifecyclePolicy> => {
    const data = await unwrap(sdkGetLifecyclePolicy({ path: { id } }));
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.get'));
  },

  create: async (req: CreateLifecyclePolicyRequest): Promise<LifecyclePolicy> => {
    await requireAssignmentSupport();
    const data = await unwrap(sdkCreateLifecyclePolicy({
      body: adaptCreateRequest(req),
    }));
    const policy = adaptLifecyclePolicy(assertData(data, 'lifecycleApi.create'));
    if (policy.scope_source !== 'explicit') {
      throw new Error('The backend returned a legacy policy after creation. Verify its scope in Lifecycle administration before continuing.');
    }
    return policy;
  },

  update: async (
    id: string,
    req: UpdateLifecyclePolicyRequest
  ): Promise<LifecyclePolicy> => {
    const changesScope = req.applies_to_all !== undefined || req.repository_ids !== undefined;
    if (changesScope) {
      await requireAssignmentSupport();
    }
    const data = await unwrap(sdkUpdateLifecyclePolicy({
      path: { id },
      body: adaptUpdateRequest(req),
    }));
    const policy = adaptLifecyclePolicy(assertData(data, 'lifecycleApi.update'));
    if (changesScope && policy.scope_source !== 'explicit') {
      throw new Error('The backend returned a legacy policy after a scope change. Refresh and verify the policy scope.');
    }
    return policy;
  },

  delete: async (id: string): Promise<void> => {
    await unwrap(sdkDeleteLifecyclePolicy({ path: { id } }));
  },

  execute: async (id: string): Promise<PolicyExecutionResult> => {
    const data = await unwrap(sdkExecutePolicy({ path: { id } }));
    return adaptPolicyExecutionResult(assertData(data, 'lifecycleApi.execute'));
  },

  preview: async (id: string): Promise<PolicyExecutionResult> => {
    const data = await unwrap(sdkPreviewPolicy({ path: { id } }));
    return adaptPolicyExecutionResult(assertData(data, 'lifecycleApi.preview'));
  },

  executeAll: async (): Promise<PolicyExecutionResult[]> => {
    const data = await unwrap(sdkExecuteAllPolicies());
    return assertData(data, 'lifecycleApi.executeAll').map(adaptPolicyExecutionResult);
  },
};
