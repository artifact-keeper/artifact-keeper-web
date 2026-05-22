import '@/lib/sdk-client';
import {
  getIdentity as sdkGetIdentity,
  listPeers as sdkListPeers,
  getPeer as sdkGetPeer,
  registerPeer as sdkRegisterPeer,
  unregisterPeer as sdkUnregisterPeer,
  heartbeat as sdkHeartbeat,
  triggerSync as sdkTriggerSync,
  getAssignedRepos as sdkGetAssignedRepos,
  assignRepo as sdkAssignRepo,
  unassignRepo as sdkUnassignRepo,
  listPeerConnections as sdkListPeerConnections,
} from '@artifact-keeper/sdk';
import type {
  IdentityResponse as SdkIdentityResponse,
  PeerInstanceResponse as SdkPeerInstanceResponse,
  PeerInstanceListResponse as SdkPeerInstanceListResponse,
  PeerResponse as SdkPeerResponse,
  RegisterPeerRequest as SdkRegisterPeerRequest,
  AssignRepoRequest as SdkAssignRepoRequest,
} from '@artifact-keeper/sdk';
import { assertData, narrowEnum } from '@/lib/api/fetch';

export type PeerStatus = 'online' | 'offline' | 'syncing' | 'degraded';

const PEER_STATUSES = new Set<PeerStatus>([
  'online',
  'offline',
  'syncing',
  'degraded',
]);

// Local PeerInstance is intentionally a subset of SdkPeerInstanceResponse:
// api_key / sync_filter / updated_at were declared on the local type
// pre-#359 but never populated (the SDK doesn't return them) and never
// read by any consumer (`grep -rn '\.api_key\|\.sync_filter\|\.updated_at'`
// returns hits only against form state, not PeerInstance reads). Dropped
// to align the type with what's actually on the wire.
export interface PeerInstance {
  id: string;
  name: string;
  endpoint_url: string;
  status: PeerStatus;
  region: string | null;
  cache_size_bytes: number;
  cache_used_bytes: number;
  is_local: boolean;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
  created_at: string;
}

export type ReplicationMode = 'push' | 'pull' | 'mirror' | 'none';

export interface PeerIdentity {
  peer_id: string;
  name: string;
  endpoint_url: string;
  /** Filled in only by the dedicated /identity endpoint when the backend exposes it. */
  api_key?: string;
}

// Local PeerConnection mirrors the SDK shape's commonly-read fields.
// `source_peer_id` was declared on the local type pre-#359 but doesn't
// exist in SdkPeerResponse (which is per-target only) and is never read
// by any consumer — dropped.
export interface PeerConnection {
  id: string;
  target_peer_id: string;
  status: string;
  latency_ms: number;
  bandwidth_estimate_bps: number;
  shared_artifacts_count: number;
  bytes_transferred_total: number;
  transfer_success_count: number;
  transfer_failure_count: number;
}

export interface RegisterPeerRequest {
  name: string;
  endpoint_url: string;
  region?: string;
  api_key: string;
}

export interface AssignRepoRequest {
  repository_id: string;
  sync_enabled?: boolean;
  replication_mode?: ReplicationMode;
  replication_schedule?: string;
}

// SDK ⇄ local adapters. Status fields use narrowEnum; nullable fields
// normalize undefined → null to match the local type.

function adaptPeerInstance(sdk: SdkPeerInstanceResponse): PeerInstance {
  return {
    id: sdk.id,
    name: sdk.name,
    endpoint_url: sdk.endpoint_url,
    status: narrowEnum(
      sdk.status,
      PEER_STATUSES,
      'offline',
      `peersApi: unknown peer status "${sdk.status}" — falling back to "offline".`,
    ),
    region: sdk.region ?? null,
    cache_size_bytes: sdk.cache_size_bytes,
    cache_used_bytes: sdk.cache_used_bytes,
    is_local: sdk.is_local,
    last_heartbeat_at: sdk.last_heartbeat_at ?? null,
    last_sync_at: sdk.last_sync_at ?? null,
    created_at: sdk.created_at,
  };
}

function adaptPeerInstanceList(
  sdk: SdkPeerInstanceListResponse,
): { items: PeerInstance[]; total: number } {
  return {
    items: sdk.items.map(adaptPeerInstance),
    total: sdk.total,
  };
}

function adaptPeerConnection(sdk: SdkPeerResponse): PeerConnection {
  // SDK declares latency_ms / bandwidth_estimate_bps as optional+nullable;
  // the connection table renders them as numeric metrics. Coerce undefined
  // → 0 so the UI doesn't render "undefined ms".
  return {
    id: sdk.id,
    target_peer_id: sdk.target_peer_id,
    status: sdk.status,
    latency_ms: sdk.latency_ms ?? 0,
    bandwidth_estimate_bps: sdk.bandwidth_estimate_bps ?? 0,
    shared_artifacts_count: sdk.shared_artifacts_count,
    bytes_transferred_total: sdk.bytes_transferred_total,
    transfer_success_count: sdk.transfer_success_count,
    transfer_failure_count: sdk.transfer_failure_count,
  };
}

function adaptIdentity(sdk: SdkIdentityResponse): PeerIdentity {
  return {
    peer_id: sdk.peer_id,
    name: sdk.name,
    endpoint_url: sdk.endpoint_url,
  };
}

function adaptRegisterRequest(req: RegisterPeerRequest): SdkRegisterPeerRequest {
  return {
    name: req.name,
    endpoint_url: req.endpoint_url,
    region: req.region,
    api_key: req.api_key,
    sync_filter: {},
  };
}

function adaptAssignRequest(req: AssignRepoRequest): SdkAssignRepoRequest {
  return {
    repository_id: req.repository_id,
    sync_enabled: req.sync_enabled,
    replication_mode: req.replication_mode,
    replication_schedule: req.replication_schedule,
  };
}

export const peersApi = {
  /** Get this instance's identity */
  getIdentity: async (): Promise<PeerIdentity> => {
    const { data, error } = await sdkGetIdentity();
    if (error) throw error;
    return adaptIdentity(assertData(data, 'peersApi.getIdentity'));
  },

  /** List all peer instances */
  list: async (params?: {
    status?: string;
    region?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ items: PeerInstance[]; total: number }> => {
    const { data, error } = await sdkListPeers({ query: params });
    if (error) throw error;
    return adaptPeerInstanceList(assertData(data, 'peersApi.list'));
  },

  /** Get a single peer */
  get: async (id: string): Promise<PeerInstance> => {
    const { data, error } = await sdkGetPeer({ path: { id } });
    if (error) throw error;
    return adaptPeerInstance(assertData(data, 'peersApi.get'));
  },

  /** Register a new peer */
  register: async (req: RegisterPeerRequest): Promise<PeerInstance> => {
    const { data, error } = await sdkRegisterPeer({
      body: adaptRegisterRequest(req),
    });
    if (error) throw error;
    return adaptPeerInstance(assertData(data, 'peersApi.register'));
  },

  /** Unregister a peer */
  unregister: async (id: string): Promise<void> => {
    const { error } = await sdkUnregisterPeer({ path: { id } });
    if (error) throw error;
  },

  /** Send heartbeat */
  heartbeat: async (
    id: string,
    req: { cache_used_bytes: number; status?: string },
  ): Promise<void> => {
    const { error } = await sdkHeartbeat({
      path: { id },
      body: { cache_used_bytes: req.cache_used_bytes, status: req.status },
    });
    if (error) throw error;
  },

  /** Trigger sync for a peer */
  triggerSync: async (id: string): Promise<void> => {
    const { error } = await sdkTriggerSync({ path: { id } });
    if (error) throw error;
  },

  /** Get repositories assigned to a peer */
  getRepositories: async (id: string): Promise<string[]> => {
    const { data, error } = await sdkGetAssignedRepos({ path: { id } });
    if (error) throw error;
    return assertData(data, 'peersApi.getRepositories');
  },

  /** Assign a repository to a peer */
  assignRepository: async (
    peerId: string,
    req: AssignRepoRequest,
  ): Promise<void> => {
    const { error } = await sdkAssignRepo({
      path: { id: peerId },
      body: adaptAssignRequest(req),
    });
    if (error) throw error;
  },

  /** Unassign a repository from a peer */
  unassignRepository: async (peerId: string, repoId: string): Promise<void> => {
    const { error } = await sdkUnassignRepo({
      path: { id: peerId, repo_id: repoId },
    });
    if (error) throw error;
  },

  /** Get peer connections */
  getConnections: async (
    id: string,
    params?: { status?: string },
  ): Promise<PeerConnection[]> => {
    const { data, error } = await sdkListPeerConnections({
      path: { id },
      query: params,
    });
    if (error) throw error;
    return assertData(data, 'peersApi.getConnections').map(adaptPeerConnection);
  },
};

export default peersApi;
