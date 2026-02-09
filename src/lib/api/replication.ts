/* eslint-disable @typescript-eslint/no-explicit-any */
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

export interface PeerInstance {
  id: string;
  name: string;
  endpoint_url: string;
  status: "online" | "offline" | "syncing" | "degraded";
  region?: string;
  cache_size_bytes: number;
  cache_used_bytes: number;
  api_key: string;
  is_local: boolean;
  last_heartbeat_at?: string;
  last_sync_at?: string;
  sync_filter?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ReplicationMode = "push" | "pull" | "mirror" | "none";

export interface PeerIdentity {
  peer_id: string;
  name: string;
  endpoint_url: string;
  api_key: string;
}

export interface PeerConnection {
  id: string;
  source_peer_id: string;
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

export const peersApi = {
  /** Get this instance's identity */
  getIdentity: async (): Promise<PeerIdentity> => {
    const { data, error } = await sdkGetIdentity();
    if (error) throw error;
    return data as any;
  },

  /** List all peer instances */
  list: async (
    params?: {
      status?: string;
      region?: string;
      page?: number;
      per_page?: number;
    }
  ): Promise<{ items: PeerInstance[]; total: number }> => {
    const { data, error } = await sdkListPeers({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  /** Get a single peer */
  get: async (id: string): Promise<PeerInstance> => {
    const { data, error } = await sdkGetPeer({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  /** Register a new peer */
  register: async (req: RegisterPeerRequest): Promise<PeerInstance> => {
    const { data, error } = await sdkRegisterPeer({ body: req as any });
    if (error) throw error;
    return data as any;
  },

  /** Unregister a peer */
  unregister: async (id: string): Promise<void> => {
    const { error } = await sdkUnregisterPeer({ path: { id } });
    if (error) throw error;
  },

  /** Send heartbeat */
  heartbeat: async (
    id: string,
    req: { cache_used_bytes: number; status?: string }
  ): Promise<void> => {
    const { error } = await sdkHeartbeat({ path: { id }, body: req as any });
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
    return data as any;
  },

  /** Assign a repository to a peer */
  assignRepository: async (
    peerId: string,
    req: AssignRepoRequest
  ): Promise<void> => {
    const { error } = await sdkAssignRepo({ path: { id: peerId }, body: req as any });
    if (error) throw error;
  },

  /** Unassign a repository from a peer */
  unassignRepository: async (
    peerId: string,
    repoId: string
  ): Promise<void> => {
    const { error } = await sdkUnassignRepo({ path: { id: peerId, repo_id: repoId } });
    if (error) throw error;
  },

  /** Get peer connections */
  getConnections: async (
    id: string,
    params?: { status?: string }
  ): Promise<PeerConnection[]> => {
    const { data, error } = await sdkListPeerConnections({ path: { id }, query: params as any });
    if (error) throw error;
    return data as any;
  },
};

export default peersApi;
