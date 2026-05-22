import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  IdentityResponse as SdkIdentityResponse,
  PeerInstanceResponse as SdkPeerInstanceResponse,
  PeerResponse as SdkPeerResponse,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetIdentity = vi.fn();
const mockListPeers = vi.fn();
const mockGetPeer = vi.fn();
const mockRegisterPeer = vi.fn();
const mockUnregisterPeer = vi.fn();
const mockHeartbeat = vi.fn();
const mockTriggerSync = vi.fn();
const mockGetAssignedRepos = vi.fn();
const mockAssignRepo = vi.fn();
const mockUnassignRepo = vi.fn();
const mockListPeerConnections = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getIdentity: (...args: unknown[]) => mockGetIdentity(...args),
  listPeers: (...args: unknown[]) => mockListPeers(...args),
  getPeer: (...args: unknown[]) => mockGetPeer(...args),
  registerPeer: (...args: unknown[]) => mockRegisterPeer(...args),
  unregisterPeer: (...args: unknown[]) => mockUnregisterPeer(...args),
  heartbeat: (...args: unknown[]) => mockHeartbeat(...args),
  triggerSync: (...args: unknown[]) => mockTriggerSync(...args),
  getAssignedRepos: (...args: unknown[]) => mockGetAssignedRepos(...args),
  assignRepo: (...args: unknown[]) => mockAssignRepo(...args),
  unassignRepo: (...args: unknown[]) => mockUnassignRepo(...args),
  listPeerConnections: (...args: unknown[]) => mockListPeerConnections(...args),
}));

const SDK_IDENTITY: SdkIdentityResponse = {
  peer_id: "p1",
  name: "us-east",
  endpoint_url: "https://us.example.com",
};

const SDK_PEER: SdkPeerInstanceResponse = {
  id: "p1",
  name: "us-east",
  endpoint_url: "https://us.example.com",
  status: "online",
  region: "us-east-1",
  cache_size_bytes: 1_000_000,
  cache_usage_percent: 50,
  cache_used_bytes: 500_000,
  is_local: false,
  last_heartbeat_at: "2026-05-01T00:00:00Z",
  last_sync_at: "2026-05-01T00:00:00Z",
  created_at: "2026-04-01T00:00:00Z",
};

const SDK_CONNECTION: SdkPeerResponse = {
  id: "c1",
  target_peer_id: "p2",
  status: "active",
  latency_ms: 12,
  bandwidth_estimate_bps: 1_000_000,
  shared_artifacts_count: 100,
  shared_chunks_count: 200,
  bytes_transferred_total: 1_000_000_000,
  transfer_success_count: 50,
  transfer_failure_count: 1,
  last_probed_at: "2026-05-01T00:00:00Z",
  last_transfer_at: "2026-05-01T00:00:00Z",
};

describe("peersApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getIdentity returns identity", async () => {
    mockGetIdentity.mockResolvedValue({ data: SDK_IDENTITY, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.getIdentity()).toEqual({
      peer_id: "p1",
      name: "us-east",
      endpoint_url: "https://us.example.com",
    });
  });

  it("getIdentity throws Empty response body when SDK returns no data (#359)", async () => {
    mockGetIdentity.mockResolvedValue({ data: undefined, error: undefined });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getIdentity()).rejects.toThrow(/Empty response body/);
  });

  it("getIdentity throws on error", async () => {
    mockGetIdentity.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getIdentity()).rejects.toBe("fail");
  });

  it("list returns peers", async () => {
    mockListPeers.mockResolvedValue({
      data: { items: [SDK_PEER], total: 1 },
      error: undefined,
    });
    const { peersApi } = await import("../replication");
    const out = await peersApi.list();
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe("p1");
    expect(out.items[0].status).toBe("online");
  });

  it("list normalizes optional+nullable fields to null (#359)", async () => {
    mockListPeers.mockResolvedValue({
      data: {
        items: [
          {
            ...SDK_PEER,
            region: undefined,
            last_heartbeat_at: undefined,
            last_sync_at: undefined,
          },
        ],
        total: 1,
      },
      error: undefined,
    });
    const { peersApi } = await import("../replication");
    const out = await peersApi.list();
    expect(out.items[0].region).toBeNull();
    expect(out.items[0].last_heartbeat_at).toBeNull();
    expect(out.items[0].last_sync_at).toBeNull();
  });

  it("list narrows unknown peer status to fallback (#359)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListPeers.mockResolvedValue({
      data: {
        items: [{ ...SDK_PEER, status: "exotic" }],
        total: 1,
      },
      error: undefined,
    });
    const { peersApi } = await import("../replication");
    const out = await peersApi.list();
    expect(out.items[0].status).toBe("offline");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("list throws on error", async () => {
    mockListPeers.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.list()).rejects.toBe("fail");
  });

  it("get returns a single peer", async () => {
    mockGetPeer.mockResolvedValue({ data: SDK_PEER, error: undefined });
    const { peersApi } = await import("../replication");
    const out = await peersApi.get("p1");
    expect(out.id).toBe("p1");
  });

  it("get throws on error", async () => {
    mockGetPeer.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.get("p1")).rejects.toBe("fail");
  });

  it("register returns new peer", async () => {
    mockRegisterPeer.mockResolvedValue({ data: SDK_PEER, error: undefined });
    const { peersApi } = await import("../replication");
    const out = await peersApi.register({
      name: "us-east",
      endpoint_url: "https://us.example.com",
      api_key: "secret",
    });
    expect(out.id).toBe("p1");
  });

  it("register forwards local body fields to SDK (#359)", async () => {
    mockRegisterPeer.mockResolvedValue({ data: SDK_PEER, error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.register({
      name: "eu-west",
      endpoint_url: "https://eu.example.com",
      region: "eu-west-1",
      api_key: "secret",
    });
    expect(mockRegisterPeer).toHaveBeenCalledWith({
      body: {
        name: "eu-west",
        endpoint_url: "https://eu.example.com",
        region: "eu-west-1",
        api_key: "secret",
        sync_filter: {},
      },
    });
  });

  it("register throws on error", async () => {
    mockRegisterPeer.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(
      peersApi.register({ name: "x", endpoint_url: "x", api_key: "x" }),
    ).rejects.toBe("fail");
  });

  it("unregister calls SDK", async () => {
    mockUnregisterPeer.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.unregister("p1");
    expect(mockUnregisterPeer).toHaveBeenCalled();
  });

  it("unregister throws on error", async () => {
    mockUnregisterPeer.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.unregister("p1")).rejects.toBe("fail");
  });

  it("heartbeat calls SDK", async () => {
    mockHeartbeat.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.heartbeat("p1", { cache_used_bytes: 100 });
    expect(mockHeartbeat).toHaveBeenCalled();
  });

  it("heartbeat throws on error", async () => {
    mockHeartbeat.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(
      peersApi.heartbeat("p1", { cache_used_bytes: 0 }),
    ).rejects.toBe("fail");
  });

  it("triggerSync calls SDK", async () => {
    mockTriggerSync.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.triggerSync("p1");
    expect(mockTriggerSync).toHaveBeenCalled();
  });

  it("triggerSync throws on error", async () => {
    mockTriggerSync.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.triggerSync("p1")).rejects.toBe("fail");
  });

  it("getRepositories returns repo IDs", async () => {
    const data = ["repo1", "repo2"];
    mockGetAssignedRepos.mockResolvedValue({ data, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.getRepositories("p1")).toEqual(data);
  });

  it("getRepositories throws on error", async () => {
    mockGetAssignedRepos.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getRepositories("p1")).rejects.toBe("fail");
  });

  it("assignRepository calls SDK with adapted body", async () => {
    mockAssignRepo.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.assignRepository("p1", {
      repository_id: "r1",
      sync_enabled: true,
      replication_mode: "push",
      replication_schedule: "0 * * * *",
    });
    expect(mockAssignRepo).toHaveBeenCalledWith({
      path: { id: "p1" },
      body: {
        repository_id: "r1",
        sync_enabled: true,
        replication_mode: "push",
        replication_schedule: "0 * * * *",
      },
    });
  });

  it("assignRepository throws on error", async () => {
    mockAssignRepo.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(
      peersApi.assignRepository("p1", { repository_id: "r1" }),
    ).rejects.toBe("fail");
  });

  it("unassignRepository calls SDK", async () => {
    mockUnassignRepo.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.unassignRepository("p1", "r1");
    expect(mockUnassignRepo).toHaveBeenCalled();
  });

  it("unassignRepository throws on error", async () => {
    mockUnassignRepo.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(
      peersApi.unassignRepository("p1", "r1"),
    ).rejects.toBe("fail");
  });

  it("getConnections returns connections", async () => {
    mockListPeerConnections.mockResolvedValue({
      data: [SDK_CONNECTION],
      error: undefined,
    });
    const { peersApi } = await import("../replication");
    const out = await peersApi.getConnections("p1");
    expect(out[0].id).toBe("c1");
    expect(out[0].target_peer_id).toBe("p2");
    expect(out[0].latency_ms).toBe(12);
  });

  it("getConnections coerces missing latency/bandwidth to 0 (#359)", async () => {
    mockListPeerConnections.mockResolvedValue({
      data: [
        {
          ...SDK_CONNECTION,
          latency_ms: undefined,
          bandwidth_estimate_bps: undefined,
        },
      ],
      error: undefined,
    });
    const { peersApi } = await import("../replication");
    const out = await peersApi.getConnections("p1");
    expect(out[0].latency_ms).toBe(0);
    expect(out[0].bandwidth_estimate_bps).toBe(0);
  });

  it("getConnections throws on error", async () => {
    mockListPeerConnections.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getConnections("p1")).rejects.toBe("fail");
  });
});
