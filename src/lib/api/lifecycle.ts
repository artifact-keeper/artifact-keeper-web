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
  PolicyExclusions,
  PolicyExecutionResult,
  ListPoliciesQuery,
} from '@/types/lifecycle';
import { assertData } from '@/lib/api/fetch';
import { toUserMessage } from '@/lib/error-utils';
import { unwrap } from '@/lib/sdk-utils';

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

/**
 * Read `bytes_matched` off an execution result.
 *
 * The field is not in the generated SDK yet (backend 1.10.0,
 * artifact-keeper#2024), so it is read through a narrowed cast rather than a
 * double-cast of the whole response — the rest of the shape stays typed. A
 * backend that predates the field yields `null`, not `0`: a dry run against
 * an older server genuinely does not know how much it would reclaim, and
 * rendering that as "0 B" would read as "nothing to clean up".
 */
function readBytesMatched(sdk: SdkPolicyExecutionResult): number | null {
  const { bytes_matched: raw } = sdk as SdkPolicyExecutionResult & {
    bytes_matched?: unknown;
  };
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
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
    bytes_matched: readBytesMatched(sdk),
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

/**
 * Top-level `config` key carrying a policy's exclusion ("keep") list
 * (backend 1.10.0, artifact-keeper#2024). Accepted by every policy type.
 */
const EXCLUDE_CONFIG_KEY = 'exclude';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge exclusion lists into a policy `config` for the wire.
 *
 * Empty lists are omitted, and when both are empty the config is returned
 * untouched — so a policy with no exclusions posts exactly the config it
 * posted before this feature (the backend treats an absent block and empty
 * arrays identically), and an `exclude` block typed by hand into the raw
 * config survives. When the editor does hold entries it is authoritative: it
 * covers both lists, so it replaces any `exclude` already in the config
 * rather than merging into it. A non-object config is passed through for the
 * backend to refuse with its own message.
 */
export function withExclusions(
  config: Record<string, unknown>,
  exclusions: PolicyExclusions
): Record<string, unknown> {
  const exclude: Record<string, string[]> = {};
  if (exclusions.versions.length > 0) exclude.versions = exclusions.versions;
  if (exclusions.version_patterns.length > 0) {
    exclude.version_patterns = exclusions.version_patterns;
  }
  if (Object.keys(exclude).length === 0 || !isPlainObject(config)) return config;
  return { ...config, [EXCLUDE_CONFIG_KEY]: exclude };
}

/** Which control a rejected `config` key belongs to. */
export type LifecycleConfigErrorField =
  | 'config'
  | 'exclude_versions'
  | 'exclude_version_patterns';

export interface LifecycleConfigError {
  /** The key the backend named, e.g. `excludes` or `exclude.version_patterns`. */
  key: string;
  /** The form control the message should be rendered under. */
  field: LifecycleConfigErrorField;
  /** The backend's own message text. */
  message: string;
}

// `unknown config key '<k>' for policy_type '<t>'` (a bad top-level key) and
// `unknown key 'exclude.<k>'` (a bad key inside the exclude block) — the two
// shapes `validate_policy_config` / `parse_exclusions` reject with.
const UNKNOWN_KEY_PATTERNS = [
  /unknown config key '([^']+)'/i,
  /unknown key '([^']+)'/i,
];

// Errors that name an exclusion list without quoting it: a bad element type,
// an empty entry, or a regex the backend's engine rejected.
const EXCLUDE_FIELD_KEYS: ReadonlyArray<[string, LifecycleConfigErrorField]> = [
  ['exclude.version_patterns', 'exclude_version_patterns'],
  ['exclude.versions', 'exclude_versions'],
];

/**
 * Turn a rejected create/update into a field-level error.
 *
 * Backend 1.10.0 stopped ignoring unrecognised `config` keys and now refuses
 * the write naming the offending key (artifact-keeper#2024) — a misspelt
 * `excludes` used to validate cleanly and then delete the releases it was
 * written to protect. Matching on the named key lets the form point at the
 * control that produced it instead of only toasting the sentence.
 *
 * Returns `null` for anything else, so callers keep their generic handling.
 */
export function parseLifecycleConfigError(error: unknown): LifecycleConfigError | null {
  const message = toUserMessage(error, '');
  if (!message) return null;

  for (const pattern of UNKNOWN_KEY_PATTERNS) {
    const key = pattern.exec(message)?.[1];
    if (key) {
      const match = EXCLUDE_FIELD_KEYS.find(([name]) => name === key);
      return { key, field: match ? match[1] : 'config', message };
    }
  }

  for (const [key, field] of EXCLUDE_FIELD_KEYS) {
    if (message.includes(key)) return { key, field, message };
  }

  return null;
}

export const lifecycleApi = {
  list: async (params?: ListPoliciesQuery): Promise<LifecyclePolicy[]> => {
    const data = await unwrap(sdkListLifecyclePolicies({ query: params }));
    return assertData(data, 'lifecycleApi.list').map(adaptLifecyclePolicy);
  },

  get: async (id: string): Promise<LifecyclePolicy> => {
    const data = await unwrap(sdkGetLifecyclePolicy({ path: { id } }));
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.get'));
  },

  create: async (req: CreateLifecyclePolicyRequest): Promise<LifecyclePolicy> => {
    const data = await unwrap(sdkCreateLifecyclePolicy({
      body: adaptCreateRequest(req),
    }));
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.create'));
  },

  update: async (
    id: string,
    req: UpdateLifecyclePolicyRequest
  ): Promise<LifecyclePolicy> => {
    const data = await unwrap(sdkUpdateLifecyclePolicy({
      path: { id },
      body: adaptUpdateRequest(req),
    }));
    return adaptLifecyclePolicy(assertData(data, 'lifecycleApi.update'));
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

