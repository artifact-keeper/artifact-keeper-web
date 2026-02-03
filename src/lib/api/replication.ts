import apiClient from "@/lib/api-client";

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
    const { data } = await apiClient.get("/api/v1/peers/identity");
    return data;
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
    const { data } = await apiClient.get("/api/v1/peers", { params });
    return data;
  },

  /** Get a single peer */
  get: async (id: string): Promise<PeerInstance> => {
    const { data } = await apiClient.get(`/api/v1/peers/${id}`);
    return data;
  },

  /** Register a new peer */
  register: async (req: RegisterPeerRequest): Promise<PeerInstance> => {
    const { data } = await apiClient.post("/api/v1/peers", req);
    return data;
  },

  /** Unregister a peer */
  unregister: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/peers/${id}`);
  },

  /** Send heartbeat */
  heartbeat: async (
    id: string,
    req: { cache_used_bytes: number; status?: string }
  ): Promise<void> => {
    await apiClient.post(`/api/v1/peers/${id}/heartbeat`, req);
  },

  /** Trigger sync for a peer */
  triggerSync: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/peers/${id}/sync`);
  },

  /** Get repositories assigned to a peer */
  getRepositories: async (id: string): Promise<string[]> => {
    const { data } = await apiClient.get(`/api/v1/peers/${id}/repositories`);
    return data;
  },

  /** Assign a repository to a peer */
  assignRepository: async (
    peerId: string,
    req: AssignRepoRequest
  ): Promise<void> => {
    await apiClient.post(`/api/v1/peers/${peerId}/repositories`, req);
  },

  /** Unassign a repository from a peer */
  unassignRepository: async (
    peerId: string,
    repoId: string
  ): Promise<void> => {
    await apiClient.delete(`/api/v1/peers/${peerId}/repositories/${repoId}`);
  },

  /** Get peer connections */
  getConnections: async (
    id: string,
    params?: { status?: string }
  ): Promise<PeerConnection[]> => {
    const { data } = await apiClient.get(`/api/v1/peers/${id}/connections`, {
      params,
    });
    return data;
  },
};

export default peersApi;
