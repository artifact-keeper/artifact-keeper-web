import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockDtStatus = vi.fn();
const mockListProjects = vi.fn();
const mockGetProjectFindings = vi.fn();
const mockGetProjectComponents = vi.fn();
const mockGetProjectMetrics = vi.fn();
const mockGetProjectMetricsHistory = vi.fn();
const mockGetPortfolioMetrics = vi.fn();
const mockGetProjectViolations = vi.fn();
const mockUpdateAnalysis = vi.fn();
const mockListPolicies = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  dtStatus: (...args: unknown[]) => mockDtStatus(...args),
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  getProjectFindings: (...args: unknown[]) => mockGetProjectFindings(...args),
  getProjectComponents: (...args: unknown[]) => mockGetProjectComponents(...args),
  getProjectMetrics: (...args: unknown[]) => mockGetProjectMetrics(...args),
  getProjectMetricsHistory: (...args: unknown[]) => mockGetProjectMetricsHistory(...args),
  getPortfolioMetrics: (...args: unknown[]) => mockGetPortfolioMetrics(...args),
  getProjectViolations: (...args: unknown[]) => mockGetProjectViolations(...args),
  updateAnalysis: (...args: unknown[]) => mockUpdateAnalysis(...args),
  listDependencyTrackPolicies: (...args: unknown[]) => mockListPolicies(...args),
}));

describe("dtApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStatus returns status", async () => {
    const status = { connected: true };
    mockDtStatus.mockResolvedValue({ data: status, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getStatus()).toEqual(status);
  });

  it("getStatus throws on error", async () => {
    mockDtStatus.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getStatus()).rejects.toBe("fail");
  });

  it("listProjects returns projects", async () => {
    const projects = [{ uuid: "p1" }];
    mockListProjects.mockResolvedValue({ data: projects, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.listProjects()).toEqual(projects);
  });

  it("listProjects throws on error", async () => {
    mockListProjects.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.listProjects()).rejects.toBe("fail");
  });

  it("getProjectFindings returns findings", async () => {
    const findings = [{ id: "f1" }];
    mockGetProjectFindings.mockResolvedValue({ data: findings, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getProjectFindings("p1")).toEqual(findings);
  });

  it("getProjectFindings throws on error", async () => {
    mockGetProjectFindings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectFindings("p1")).rejects.toBe("fail");
  });

  it("getProjectComponents returns components", async () => {
    const components = [{ name: "lib" }];
    mockGetProjectComponents.mockResolvedValue({ data: components, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getProjectComponents("p1")).toEqual(components);
  });

  it("getProjectComponents throws on error", async () => {
    mockGetProjectComponents.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectComponents("p1")).rejects.toBe("fail");
  });

  it("getProjectMetrics returns metrics", async () => {
    const metrics = { critical: 0 };
    mockGetProjectMetrics.mockResolvedValue({ data: metrics, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getProjectMetrics("p1")).toEqual(metrics);
  });

  it("getProjectMetrics throws on error", async () => {
    mockGetProjectMetrics.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectMetrics("p1")).rejects.toBe("fail");
  });

  it("getProjectMetricsHistory returns history", async () => {
    const history = [{ critical: 0 }];
    mockGetProjectMetricsHistory.mockResolvedValue({ data: history, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getProjectMetricsHistory("p1", 30)).toEqual(history);
  });

  it("getProjectMetricsHistory throws on error", async () => {
    mockGetProjectMetricsHistory.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectMetricsHistory("p1")).rejects.toBe("fail");
  });

  it("getPortfolioMetrics returns metrics", async () => {
    const metrics = { total_projects: 5 };
    mockGetPortfolioMetrics.mockResolvedValue({ data: metrics, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getPortfolioMetrics()).toEqual(metrics);
  });

  it("getPortfolioMetrics throws on error", async () => {
    mockGetPortfolioMetrics.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getPortfolioMetrics()).rejects.toBe("fail");
  });

  it("getProjectViolations returns violations", async () => {
    const violations = [{ id: "v1" }];
    mockGetProjectViolations.mockResolvedValue({ data: violations, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.getProjectViolations("p1")).toEqual(violations);
  });

  it("getProjectViolations throws on error", async () => {
    mockGetProjectViolations.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectViolations("p1")).rejects.toBe("fail");
  });

  it("updateAnalysis returns response", async () => {
    const resp = { id: "a1" };
    mockUpdateAnalysis.mockResolvedValue({ data: resp, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.updateAnalysis({ component_uuid: "c1" } as any)).toEqual(resp);
  });

  it("updateAnalysis throws on error", async () => {
    mockUpdateAnalysis.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.updateAnalysis({} as any)).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    const policies = [{ id: "pol1" }];
    mockListPolicies.mockResolvedValue({ data: policies, error: undefined });
    const mod = await import("../dependency-track");
    expect(await mod.default.listPolicies()).toEqual(policies);
  });

  it("listPolicies throws on error", async () => {
    mockListPolicies.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("getAllViolations aggregates violations across projects", async () => {
    mockGetProjectViolations.mockResolvedValue({ data: [{ id: "v1" }], error: undefined });
    const mod = await import("../dependency-track");
    const result = await mod.default.getAllViolations([{ uuid: "p1" }, { uuid: "p2" }]);
    expect(result).toHaveLength(2);
  });

  it("getAllViolations skips projects that throw", async () => {
    mockGetProjectViolations
      .mockResolvedValueOnce({ data: [{ id: "v1" }], error: undefined })
      .mockResolvedValueOnce({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    // The second project will throw because error is truthy, but getAllViolations catches it
    const result = await mod.default.getAllViolations([{ uuid: "p1" }, { uuid: "p2" }]);
    expect(result).toHaveLength(1);
  });
});
