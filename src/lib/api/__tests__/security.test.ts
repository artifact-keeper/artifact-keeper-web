import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetDashboard = vi.fn();
const mockGetAllScores = vi.fn();
const mockTriggerScan = vi.fn();
const mockListScans = vi.fn();
const mockGetScan = vi.fn();
const mockListFindings = vi.fn();
const mockAcknowledgeFinding = vi.fn();
const mockRevokeAcknowledgment = vi.fn();
const mockListPolicies = vi.fn();
const mockCreatePolicy = vi.fn();
const mockGetPolicy = vi.fn();
const mockUpdatePolicy = vi.fn();
const mockDeletePolicy = vi.fn();
const mockGetRepoSecurity = vi.fn();
const mockUpdateRepoSecurity = vi.fn();
const mockListRepoScans = vi.fn();
const mockListArtifactScans = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
  getAllScores: (...args: unknown[]) => mockGetAllScores(...args),
  triggerScan: (...args: unknown[]) => mockTriggerScan(...args),
  listScans: (...args: unknown[]) => mockListScans(...args),
  getScan: (...args: unknown[]) => mockGetScan(...args),
  listFindings: (...args: unknown[]) => mockListFindings(...args),
  acknowledgeFinding: (...args: unknown[]) => mockAcknowledgeFinding(...args),
  revokeAcknowledgment: (...args: unknown[]) => mockRevokeAcknowledgment(...args),
  listPolicies: (...args: unknown[]) => mockListPolicies(...args),
  createPolicy: (...args: unknown[]) => mockCreatePolicy(...args),
  getPolicy: (...args: unknown[]) => mockGetPolicy(...args),
  updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
  deletePolicy: (...args: unknown[]) => mockDeletePolicy(...args),
  getRepoSecurity: (...args: unknown[]) => mockGetRepoSecurity(...args),
  updateRepoSecurity: (...args: unknown[]) => mockUpdateRepoSecurity(...args),
  listRepoScans: (...args: unknown[]) => mockListRepoScans(...args),
  listArtifactScans: (...args: unknown[]) => mockListArtifactScans(...args),
}));

describe("securityApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getDashboard returns summary", async () => {
    const data = { total_scans: 5 };
    mockGetDashboard.mockResolvedValue({ data, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.getDashboard()).toEqual(data);
  });

  it("getDashboard throws on error", async () => {
    mockGetDashboard.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getDashboard()).rejects.toBe("fail");
  });

  it("getAllScores returns scores", async () => {
    const scores = [{ repo_id: "r1", score: 90 }];
    mockGetAllScores.mockResolvedValue({ data: scores, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.getAllScores()).toEqual(scores);
  });

  it("getAllScores throws on error", async () => {
    mockGetAllScores.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getAllScores()).rejects.toBe("fail");
  });

  it("triggerScan returns response", async () => {
    const resp = { scan_id: "s1" };
    mockTriggerScan.mockResolvedValue({ data: resp, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.triggerScan({ repository_id: "r1" } as any)).toEqual(resp);
  });

  it("triggerScan throws on error", async () => {
    mockTriggerScan.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.triggerScan({} as any)).rejects.toBe("fail");
  });

  it("listScans returns scan list", async () => {
    const data = { items: [{ id: "s1" }], total: 1 };
    mockListScans.mockResolvedValue({ data, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.listScans()).toEqual(data);
  });

  it("listScans throws on error", async () => {
    mockListScans.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listScans()).rejects.toBe("fail");
  });

  it("getScan returns scan", async () => {
    const scan = { id: "s1" };
    mockGetScan.mockResolvedValue({ data: scan, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.getScan("s1")).toEqual(scan);
  });

  it("getScan throws on error", async () => {
    mockGetScan.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getScan("s1")).rejects.toBe("fail");
  });

  it("listFindings returns findings", async () => {
    const data = { items: [{ id: "f1" }], total: 1 };
    mockListFindings.mockResolvedValue({ data, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.listFindings("s1")).toEqual(data);
  });

  it("listFindings throws on error", async () => {
    mockListFindings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listFindings("s1")).rejects.toBe("fail");
  });

  it("acknowledgeFinding returns finding", async () => {
    const finding = { id: "f1", acknowledged: true };
    mockAcknowledgeFinding.mockResolvedValue({ data: finding, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.acknowledgeFinding("f1", "false positive")).toEqual(finding);
  });

  it("acknowledgeFinding throws on error", async () => {
    mockAcknowledgeFinding.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.acknowledgeFinding("f1", "reason")).rejects.toBe("fail");
  });

  it("revokeAcknowledgment returns finding", async () => {
    const finding = { id: "f1", acknowledged: false };
    mockRevokeAcknowledgment.mockResolvedValue({ data: finding, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.revokeAcknowledgment("f1")).toEqual(finding);
  });

  it("revokeAcknowledgment throws on error", async () => {
    mockRevokeAcknowledgment.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.revokeAcknowledgment("f1")).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    const policies = [{ id: "p1" }];
    mockListPolicies.mockResolvedValue({ data: policies, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.listPolicies()).toEqual(policies);
  });

  it("listPolicies throws on error", async () => {
    mockListPolicies.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("createPolicy returns policy", async () => {
    const policy = { id: "p2" };
    mockCreatePolicy.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.createPolicy({} as any)).toEqual(policy);
  });

  it("createPolicy throws on error", async () => {
    mockCreatePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.createPolicy({} as any)).rejects.toBe("fail");
  });

  it("getPolicy returns policy", async () => {
    const policy = { id: "p1" };
    mockGetPolicy.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.getPolicy("p1")).toEqual(policy);
  });

  it("getPolicy throws on error", async () => {
    mockGetPolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getPolicy("p1")).rejects.toBe("fail");
  });

  it("updatePolicy returns policy", async () => {
    const policy = { id: "p1", name: "updated" };
    mockUpdatePolicy.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.updatePolicy("p1", {} as any)).toEqual(policy);
  });

  it("updatePolicy throws on error", async () => {
    mockUpdatePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.updatePolicy("p1", {} as any)).rejects.toBe("fail");
  });

  it("deletePolicy calls SDK", async () => {
    mockDeletePolicy.mockResolvedValue({ error: undefined });
    const mod = await import("../security");
    await mod.default.deletePolicy("p1");
    expect(mockDeletePolicy).toHaveBeenCalled();
  });

  it("deletePolicy throws on error", async () => {
    mockDeletePolicy.mockResolvedValue({ error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.deletePolicy("p1")).rejects.toBe("fail");
  });

  it("getRepoSecurity returns info", async () => {
    const info = { scan_enabled: true };
    mockGetRepoSecurity.mockResolvedValue({ data: info, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.getRepoSecurity("repo-key")).toEqual(info);
  });

  it("getRepoSecurity throws on error", async () => {
    mockGetRepoSecurity.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getRepoSecurity("repo-key")).rejects.toBe("fail");
  });

  it("updateRepoSecurity returns config", async () => {
    const config = { scan_on_push: true };
    mockUpdateRepoSecurity.mockResolvedValue({ data: config, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.updateRepoSecurity("repo-key", {} as any)).toEqual(config);
  });

  it("updateRepoSecurity throws on error", async () => {
    mockUpdateRepoSecurity.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.updateRepoSecurity("repo-key", {} as any)).rejects.toBe("fail");
  });

  it("listRepoScans returns scans", async () => {
    const data = { items: [{ id: "s1" }], total: 1 };
    mockListRepoScans.mockResolvedValue({ data, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.listRepoScans("repo-key")).toEqual(data);
  });

  it("listRepoScans throws on error", async () => {
    mockListRepoScans.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listRepoScans("repo-key")).rejects.toBe("fail");
  });

  it("listArtifactScans returns scans", async () => {
    const data = { items: [{ id: "s1" }], total: 1 };
    mockListArtifactScans.mockResolvedValue({ data, error: undefined });
    const mod = await import("../security");
    expect(await mod.default.listArtifactScans("a1")).toEqual(data);
  });

  it("listArtifactScans throws on error", async () => {
    mockListArtifactScans.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listArtifactScans("a1")).rejects.toBe("fail");
  });
});
