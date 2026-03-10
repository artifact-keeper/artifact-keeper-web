import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("peersApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getIdentity returns identity", async () => {
    const data = { peer_id: "p1", name: "us-east" };
    mockGetIdentity.mockResolvedValue({ data, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.getIdentity()).toEqual(data);
  });

  it("getIdentity throws on error", async () => {
    mockGetIdentity.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getIdentity()).rejects.toBe("fail");
  });

  it("list returns peers", async () => {
    const data = { items: [{ id: "p1" }], total: 1 };
    mockListPeers.mockResolvedValue({ data, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListPeers.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.list()).rejects.toBe("fail");
  });

  it("get returns a single peer", async () => {
    const peer = { id: "p1" };
    mockGetPeer.mockResolvedValue({ data: peer, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.get("p1")).toEqual(peer);
  });

  it("get throws on error", async () => {
    mockGetPeer.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.get("p1")).rejects.toBe("fail");
  });

  it("register returns new peer", async () => {
    const peer = { id: "p2" };
    mockRegisterPeer.mockResolvedValue({ data: peer, error: undefined });
    const { peersApi } = await import("../replication");
    expect(
      await peersApi.register({ name: "eu-west", endpoint_url: "https://eu.example.com", api_key: "key" })
    ).toEqual(peer);
  });

  it("register throws on error", async () => {
    mockRegisterPeer.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.register({ name: "x", endpoint_url: "x", api_key: "x" })).rejects.toBe("fail");
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
    await expect(peersApi.heartbeat("p1", { cache_used_bytes: 0 })).rejects.toBe("fail");
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

  it("assignRepository calls SDK", async () => {
    mockAssignRepo.mockResolvedValue({ error: undefined });
    const { peersApi } = await import("../replication");
    await peersApi.assignRepository("p1", { repository_id: "r1" });
    expect(mockAssignRepo).toHaveBeenCalled();
  });

  it("assignRepository throws on error", async () => {
    mockAssignRepo.mockResolvedValue({ error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.assignRepository("p1", { repository_id: "r1" })).rejects.toBe("fail");
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
    await expect(peersApi.unassignRepository("p1", "r1")).rejects.toBe("fail");
  });

  it("getConnections returns connections", async () => {
    const data = [{ id: "c1" }];
    mockListPeerConnections.mockResolvedValue({ data, error: undefined });
    const { peersApi } = await import("../replication");
    expect(await peersApi.getConnections("p1")).toEqual(data);
  });

  it("getConnections throws on error", async () => {
    mockListPeerConnections.mockResolvedValue({ data: undefined, error: "fail" });
    const { peersApi } = await import("../replication");
    await expect(peersApi.getConnections("p1")).rejects.toBe("fail");
  });
});
