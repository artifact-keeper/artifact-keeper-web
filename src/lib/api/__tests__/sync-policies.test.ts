import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listSyncPolicies: vi.fn(),
  getSyncPolicy: vi.fn(),
  createSyncPolicy: vi.fn(),
  updateSyncPolicy: vi.fn(),
  deleteSyncPolicy: vi.fn(),
  togglePolicy: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listSyncPolicies: (...a: unknown[]) => m.listSyncPolicies(...a),
  getSyncPolicy: (...a: unknown[]) => m.getSyncPolicy(...a),
  createSyncPolicy: (...a: unknown[]) => m.createSyncPolicy(...a),
  updateSyncPolicy: (...a: unknown[]) => m.updateSyncPolicy(...a),
  deleteSyncPolicy: (...a: unknown[]) => m.deleteSyncPolicy(...a),
  togglePolicy: (...a: unknown[]) => m.togglePolicy(...a),
}));

import syncPoliciesApi from "../sync-policies";

const SDK = {
  id: "sp1",
  name: "mirror-releases",
  description: "",
  enabled: true,
  filter: "*.tar.gz",
  replication_mode: "mirror",
  priority: 100,
  precedence: 0,
  artifact_filter: {},
  peer_selector: {},
  repo_selector: {},
  created_at: "x",
  updated_at: "y",
};

beforeEach(() => vi.clearAllMocks());

describe("syncPoliciesApi", () => {
  it("list maps SyncPolicyListResponse.items", async () => {
    m.listSyncPolicies.mockResolvedValue({ data: { items: [SDK], total: 1 }, error: undefined });
    const out = await syncPoliciesApi.list();
    expect(out[0]).toMatchObject({ id: "sp1", replication_mode: "mirror", priority: 100, filter: "*.tar.gz" });
  });

  it("list throws on error", async () => {
    m.listSyncPolicies.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(syncPoliciesApi.list()).rejects.toEqual({ status: 500 });
  });

  it("get passes the id path", async () => {
    m.getSyncPolicy.mockResolvedValue({ data: SDK, error: undefined });
    await syncPoliciesApi.get("sp1");
    expect(m.getSyncPolicy).toHaveBeenCalledWith({ path: { id: "sp1" } });
  });

  it("create posts the body", async () => {
    m.createSyncPolicy.mockResolvedValue({ data: SDK, error: undefined });
    await syncPoliciesApi.create({ name: "x", replication_mode: "push", priority: 5 });
    expect(m.createSyncPolicy).toHaveBeenCalledWith({ body: { name: "x", replication_mode: "push", priority: 5 } });
  });

  it("update sends id path + body", async () => {
    m.updateSyncPolicy.mockResolvedValue({ data: SDK, error: undefined });
    await syncPoliciesApi.update("sp1", { priority: 9 });
    expect(m.updateSyncPolicy).toHaveBeenCalledWith({ path: { id: "sp1" }, body: { priority: 9 } });
  });

  it("remove resolves void and passes id", async () => {
    m.deleteSyncPolicy.mockResolvedValue({ error: undefined });
    await expect(syncPoliciesApi.remove("sp1")).resolves.toBeUndefined();
    expect(m.deleteSyncPolicy).toHaveBeenCalledWith({ path: { id: "sp1" } });
  });

  it("toggle sends the explicit enabled body (not a blind flip)", async () => {
    m.togglePolicy.mockResolvedValue({ data: { ...SDK, enabled: false }, error: undefined });
    const out = await syncPoliciesApi.toggle("sp1", false);
    expect(m.togglePolicy).toHaveBeenCalledWith({ path: { id: "sp1" }, body: { enabled: false } });
    expect(out.enabled).toBe(false);
  });

  it("toggle throws on error", async () => {
    m.togglePolicy.mockResolvedValue({ data: undefined, error: { status: 404 } });
    await expect(syncPoliciesApi.toggle("x", true)).rejects.toEqual({ status: 404 });
  });
});
