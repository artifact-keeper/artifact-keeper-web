import '@/lib/sdk-client';
import {
  listSyncPolicies,
  getSyncPolicy,
  createSyncPolicy,
  updateSyncPolicy,
  deleteSyncPolicy,
  togglePolicy,
} from '@artifact-keeper/sdk';
import type { SyncPolicyResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/**
 * A replication sync policy: declarative rule deciding which artifacts get
 * replicated to which peers, in what mode, at what priority.
 */
export interface SyncPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Convenience glob (mirrors `artifact_filter.include_paths`), e.g. `*.tar.gz`. */
  filter: string;
  replication_mode: string;
  priority: number;
  precedence: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSyncPolicyRequest {
  name: string;
  description?: string;
  filter?: string;
  replication_mode?: string;
  priority?: number;
  enabled?: boolean;
}

/**
 * Update payload. Note the SDK's `UpdateSyncPolicyPayload` has **no `filter`
 * convenience field** (unlike create) — the glob only exists as the
 * `artifact_filter.include_paths` shorthand, which the backend mirrors back to
 * `filter` on read. So callers updating the filter must set `artifact_filter`,
 * not `filter`; this type omits `filter` to make that impossible to get wrong.
 */
export interface UpdateSyncPolicyRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  replication_mode?: string;
  priority?: number;
  artifact_filter?: Record<string, unknown>;
}

/** Build the structured `artifact_filter` from the single-glob shorthand. */
export function filterToArtifactFilter(glob: string): Record<string, unknown> {
  const trimmed = glob.trim();
  return trimmed ? { include_paths: [trimmed] } : {};
}

function adapt(sdk: SyncPolicyResponse): SyncPolicy {
  return {
    id: sdk.id,
    name: sdk.name,
    description: sdk.description ?? "",
    enabled: sdk.enabled,
    filter: sdk.filter ?? "",
    replication_mode: sdk.replication_mode,
    priority: sdk.priority,
    precedence: sdk.precedence,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

const syncPoliciesApi = {
  list: async (): Promise<SyncPolicy[]> => {
    const { data, error } = await listSyncPolicies();
    if (error) throw error;
    return assertData(data, 'syncPoliciesApi.list').items.map(adapt);
  },

  get: async (id: string): Promise<SyncPolicy> => {
    const { data, error } = await getSyncPolicy({ path: { id } });
    if (error) throw error;
    return adapt(assertData(data, 'syncPoliciesApi.get'));
  },

  create: async (req: CreateSyncPolicyRequest): Promise<SyncPolicy> => {
    const { data, error } = await createSyncPolicy({ body: req });
    if (error) throw error;
    return adapt(assertData(data, 'syncPoliciesApi.create'));
  },

  update: async (id: string, req: UpdateSyncPolicyRequest): Promise<SyncPolicy> => {
    const { data, error } = await updateSyncPolicy({ path: { id }, body: req });
    if (error) throw error;
    return adapt(assertData(data, 'syncPoliciesApi.update'));
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await deleteSyncPolicy({ path: { id } });
    if (error) throw error;
  },

  /** Set a policy's enabled state; returns the updated policy. */
  toggle: async (id: string, enabled: boolean): Promise<SyncPolicy> => {
    const { data, error } = await togglePolicy({ path: { id }, body: { enabled } });
    if (error) throw error;
    return adapt(assertData(data, 'syncPoliciesApi.toggle'));
  },
};

export default syncPoliciesApi;
