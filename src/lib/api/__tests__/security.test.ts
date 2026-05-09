import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DashboardResponse as SdkDashboardResponse,
  ScoreResponse as SdkScoreResponse,
  ScanResponse as SdkScanResponse,
  FindingResponse as SdkFindingResponse,
  PolicyResponse as SdkPolicyResponse,
  ScanConfigResponse as SdkScanConfigResponse,
  TriggerScanResponse as SdkTriggerScanResponse,
} from "@artifact-keeper/sdk";

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
  revokeAcknowledgment: (...args: unknown[]) =>
    mockRevokeAcknowledgment(...args),
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

const SDK_DASHBOARD: SdkDashboardResponse = {
  repos_with_scanning: 5,
  total_scans: 100,
  total_findings: 50,
  critical_findings: 2,
  high_findings: 10,
  policy_violations_blocked: 3,
  repos_grade_a: 4,
  repos_grade_f: 1,
};

const SDK_SCORE: SdkScoreResponse = {
  id: "sc1",
  repository_id: "r1",
  score: 90,
  grade: "A",
  critical_count: 0,
  high_count: 1,
  medium_count: 2,
  low_count: 3,
  acknowledged_count: 1,
  last_scan_at: "2026-05-01T00:00:00Z",
  calculated_at: "2026-05-01T00:00:00Z",
};

const SDK_SCAN: SdkScanResponse = {
  id: "s1",
  artifact_id: "a1",
  artifact_name: "lib.jar",
  artifact_version: "1.0",
  repository_id: "r1",
  scan_type: "trivy",
  status: "completed",
  findings_count: 5,
  critical_count: 0,
  high_count: 1,
  medium_count: 2,
  low_count: 1,
  info_count: 1,
  scanner_version: "0.45.0",
  error_message: null,
  started_at: "2026-05-01T00:00:00Z",
  completed_at: "2026-05-01T00:01:00Z",
  created_at: "2026-05-01T00:00:00Z",
};

const SDK_FINDING: SdkFindingResponse = {
  id: "f1",
  scan_result_id: "s1",
  artifact_id: "a1",
  severity: "high",
  title: "title",
  description: "desc",
  cve_id: "CVE-2024-001",
  affected_component: "lib",
  affected_version: "1.0",
  fixed_version: "1.0.1",
  source: "NVD",
  source_url: "https://nvd.nist.gov/...",
  is_acknowledged: false,
  acknowledged_by: null,
  acknowledged_reason: null,
  acknowledged_at: null,
  created_at: "2026-05-01T00:00:00Z",
};

const SDK_POLICY: SdkPolicyResponse = {
  id: "p1",
  name: "default",
  repository_id: "r1",
  max_severity: "high",
  block_unscanned: true,
  block_on_fail: true,
  is_enabled: true,
  require_signature: false,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_CONFIG: SdkScanConfigResponse = {
  id: "cfg1",
  repository_id: "r1",
  scan_enabled: true,
  scan_on_upload: true,
  scan_on_proxy: false,
  block_on_policy_violation: true,
  severity_threshold: "high",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_TRIGGER: SdkTriggerScanResponse = {
  message: "queued",
  artifacts_queued: 3,
};

describe("securityApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getDashboard returns summary", async () => {
    mockGetDashboard.mockResolvedValue({ data: SDK_DASHBOARD, error: undefined });
    const mod = await import("../security");
    const out = await mod.default.getDashboard();
    expect(out.total_scans).toBe(100);
    expect(out.repos_with_scanning).toBe(5);
  });

  it("getDashboard throws on error", async () => {
    mockGetDashboard.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getDashboard()).rejects.toBe("fail");
  });

  it("getAllScores returns scores", async () => {
    mockGetAllScores.mockResolvedValue({ data: [SDK_SCORE], error: undefined });
    const mod = await import("../security");
    const out = await mod.default.getAllScores();
    expect(out[0].score).toBe(90);
    expect(out[0].grade).toBe("A");
    // total_findings synthesized from severity counts
    expect(out[0].total_findings).toBe(6);
  });

  it("getAllScores normalizes last_scan_at undefined to null (#359)", async () => {
    mockGetAllScores.mockResolvedValue({
      data: [{ ...SDK_SCORE, last_scan_at: undefined }],
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.getAllScores();
    expect(out[0].last_scan_at).toBeNull();
  });

  it("getAllScores throws on error", async () => {
    mockGetAllScores.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getAllScores()).rejects.toBe("fail");
  });

  it("triggerScan returns response", async () => {
    mockTriggerScan.mockResolvedValue({ data: SDK_TRIGGER, error: undefined });
    const mod = await import("../security");
    const out = await mod.default.triggerScan({ repository_id: "r1" });
    expect(out.message).toBe("queued");
    expect(out.artifacts_queued).toBe(3);
  });

  it("triggerScan throws on error", async () => {
    mockTriggerScan.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.triggerScan({})).rejects.toBe("fail");
  });

  it("listScans returns scan list", async () => {
    mockListScans.mockResolvedValue({
      data: { items: [SDK_SCAN], total: 1 },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.listScans();
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe("s1");
  });

  it("listScans normalizes nullable fields (#359)", async () => {
    mockListScans.mockResolvedValue({
      data: {
        items: [
          {
            ...SDK_SCAN,
            artifact_name: undefined,
            artifact_version: undefined,
            scanner_version: undefined,
            error_message: undefined,
            started_at: undefined,
            completed_at: undefined,
          },
        ],
        total: 1,
      },
      error: undefined,
    });
    const mod = await import("../security");
    const [s] = (await mod.default.listScans()).items;
    expect(s.artifact_name).toBeNull();
    expect(s.artifact_version).toBeNull();
    expect(s.scanner_version).toBeNull();
    expect(s.error_message).toBeNull();
    expect(s.started_at).toBeNull();
    expect(s.completed_at).toBeNull();
  });

  it("listScans throws on error", async () => {
    mockListScans.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listScans()).rejects.toBe("fail");
  });

  it("getScan returns scan", async () => {
    mockGetScan.mockResolvedValue({ data: SDK_SCAN, error: undefined });
    const mod = await import("../security");
    const out = await mod.default.getScan("s1");
    expect(out.id).toBe("s1");
  });

  it("getScan throws on error", async () => {
    mockGetScan.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getScan("s1")).rejects.toBe("fail");
  });

  it("listFindings returns findings", async () => {
    mockListFindings.mockResolvedValue({
      data: { items: [SDK_FINDING], total: 1 },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.listFindings("s1");
    expect(out.total).toBe(1);
    expect(out.items[0].severity).toBe("high");
  });

  it("listFindings throws on error", async () => {
    mockListFindings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listFindings("s1")).rejects.toBe("fail");
  });

  it("acknowledgeFinding returns finding and forwards body", async () => {
    mockAcknowledgeFinding.mockResolvedValue({
      data: { ...SDK_FINDING, is_acknowledged: true },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.acknowledgeFinding("f1", "false positive");
    expect(out.is_acknowledged).toBe(true);
    expect(mockAcknowledgeFinding).toHaveBeenCalledWith({
      path: { id: "f1" },
      body: { reason: "false positive" },
    });
  });

  it("acknowledgeFinding throws on error", async () => {
    mockAcknowledgeFinding.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(
      mod.default.acknowledgeFinding("f1", "reason"),
    ).rejects.toBe("fail");
  });

  it("revokeAcknowledgment returns finding", async () => {
    mockRevokeAcknowledgment.mockResolvedValue({
      data: SDK_FINDING,
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.revokeAcknowledgment("f1");
    expect(out.id).toBe("f1");
  });

  it("revokeAcknowledgment throws on error", async () => {
    mockRevokeAcknowledgment.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../security");
    await expect(mod.default.revokeAcknowledgment("f1")).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    mockListPolicies.mockResolvedValue({ data: [SDK_POLICY], error: undefined });
    const mod = await import("../security");
    const out = await mod.default.listPolicies();
    expect(out[0].id).toBe("p1");
  });

  it("listPolicies throws on error", async () => {
    mockListPolicies.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("createPolicy returns policy and forwards body", async () => {
    mockCreatePolicy.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../security");
    await mod.default.createPolicy({
      name: "default",
      max_severity: "high",
      block_unscanned: true,
      block_on_fail: true,
      repository_id: "r1",
    });
    expect(mockCreatePolicy).toHaveBeenCalledWith({
      body: {
        name: "default",
        max_severity: "high",
        block_unscanned: true,
        block_on_fail: true,
        repository_id: "r1",
      },
    });
  });

  it("createPolicy throws on error", async () => {
    mockCreatePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(
      mod.default.createPolicy({
        name: "x",
        max_severity: "high",
        block_unscanned: false,
        block_on_fail: false,
      }),
    ).rejects.toBe("fail");
  });

  it("getPolicy returns policy", async () => {
    mockGetPolicy.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../security");
    const out = await mod.default.getPolicy("p1");
    expect(out.id).toBe("p1");
  });

  it("getPolicy throws on error", async () => {
    mockGetPolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getPolicy("p1")).rejects.toBe("fail");
  });

  it("updatePolicy returns policy and forwards body", async () => {
    mockUpdatePolicy.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../security");
    await mod.default.updatePolicy("p1", {
      name: "updated",
      max_severity: "critical",
      block_unscanned: true,
      block_on_fail: true,
      is_enabled: false,
    });
    expect(mockUpdatePolicy).toHaveBeenCalledWith({
      path: { id: "p1" },
      body: {
        name: "updated",
        max_severity: "critical",
        block_unscanned: true,
        block_on_fail: true,
        is_enabled: false,
      },
    });
  });

  it("updatePolicy throws on error", async () => {
    mockUpdatePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(
      mod.default.updatePolicy("p1", {
        name: "x",
        max_severity: "high",
        block_unscanned: false,
        block_on_fail: false,
        is_enabled: true,
      }),
    ).rejects.toBe("fail");
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

  it("getRepoSecurity returns info with config and score", async () => {
    mockGetRepoSecurity.mockResolvedValue({
      data: { config: SDK_CONFIG, score: SDK_SCORE },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.getRepoSecurity("repo-key");
    expect(out.config?.id).toBe("cfg1");
    expect(out.score?.id).toBe("sc1");
  });

  it("getRepoSecurity normalizes null config and score to null (#359)", async () => {
    mockGetRepoSecurity.mockResolvedValue({
      data: { config: null, score: null },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.getRepoSecurity("repo-key");
    expect(out.config).toBeNull();
    expect(out.score).toBeNull();
  });

  it("getRepoSecurity throws on error", async () => {
    mockGetRepoSecurity.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.getRepoSecurity("repo-key")).rejects.toBe("fail");
  });

  it("updateRepoSecurity returns config", async () => {
    mockUpdateRepoSecurity.mockResolvedValue({
      data: SDK_CONFIG,
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.updateRepoSecurity("repo-key", {
      scan_enabled: true,
      scan_on_upload: true,
      scan_on_proxy: false,
      block_on_policy_violation: true,
      severity_threshold: "high",
    });
    expect(out.id).toBe("cfg1");
  });

  it("updateRepoSecurity throws on error", async () => {
    mockUpdateRepoSecurity.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../security");
    await expect(
      mod.default.updateRepoSecurity("repo-key", {
        scan_enabled: false,
        scan_on_upload: false,
        scan_on_proxy: false,
        block_on_policy_violation: false,
        severity_threshold: "high",
      }),
    ).rejects.toBe("fail");
  });

  it("listRepoScans returns scans", async () => {
    mockListRepoScans.mockResolvedValue({
      data: { items: [SDK_SCAN], total: 1 },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.listRepoScans("repo-key");
    expect(out.total).toBe(1);
  });

  it("listRepoScans throws on error", async () => {
    mockListRepoScans.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../security");
    await expect(mod.default.listRepoScans("repo-key")).rejects.toBe("fail");
  });

  it("listArtifactScans returns scans", async () => {
    mockListArtifactScans.mockResolvedValue({
      data: { items: [SDK_SCAN], total: 1 },
      error: undefined,
    });
    const mod = await import("../security");
    const out = await mod.default.listArtifactScans("a1");
    expect(out.total).toBe(1);
  });

  it("listArtifactScans throws on error", async () => {
    mockListArtifactScans.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../security");
    await expect(mod.default.listArtifactScans("a1")).rejects.toBe("fail");
  });
});
