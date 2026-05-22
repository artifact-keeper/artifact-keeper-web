import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  DtStatusResponse as SdkDtStatusResponse,
  DtProject as SdkDtProject,
  DtFinding as SdkDtFinding,
  DtComponentFull as SdkDtComponentFull,
  DtProjectMetrics as SdkDtProjectMetrics,
  DtPortfolioMetrics as SdkDtPortfolioMetrics,
  DtPolicyViolation as SdkDtPolicyViolation,
  DtPolicyFull as SdkDtPolicyFull,
  DtAnalysisResponse as SdkDtAnalysisResponse,
} from "@artifact-keeper/sdk";

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
  getProjectComponents: (...args: unknown[]) =>
    mockGetProjectComponents(...args),
  getProjectMetrics: (...args: unknown[]) => mockGetProjectMetrics(...args),
  getProjectMetricsHistory: (...args: unknown[]) =>
    mockGetProjectMetricsHistory(...args),
  getPortfolioMetrics: (...args: unknown[]) => mockGetPortfolioMetrics(...args),
  getProjectViolations: (...args: unknown[]) =>
    mockGetProjectViolations(...args),
  updateAnalysis: (...args: unknown[]) => mockUpdateAnalysis(...args),
  listDependencyTrackPolicies: (...args: unknown[]) =>
    mockListPolicies(...args),
}));

const SDK_STATUS: SdkDtStatusResponse = {
  enabled: true,
  healthy: true,
  url: "https://dt.example.com",
};

const SDK_PROJECT: SdkDtProject = {
  uuid: "p1",
  name: "main",
  version: "1.0",
  description: "main project",
  lastBomImport: 1700000000000,
  lastBomImportFormat: "cyclonedx",
};

const SDK_FINDING: SdkDtFinding = {
  component: { uuid: "c1", name: "lib-a", version: "1.0", group: null, purl: null },
  vulnerability: {
    uuid: "v1",
    vulnId: "CVE-2024-001",
    source: "NVD",
    severity: "high",
    title: "title",
    description: "desc",
    cvssV3BaseScore: 7.5,
    cwe: { cweId: 79, name: "XSS" },
  },
  analysis: {
    state: "EXPLOITABLE",
    justification: null,
    response: null,
    details: null,
    isSuppressed: false,
  },
  attribution: {
    analyzerIdentity: "OSSINDEX",
    attributedOn: 1700000000000,
  },
};

const SDK_COMPONENT_FULL: SdkDtComponentFull = {
  uuid: "c1",
  name: "lib-a",
  version: "1.0",
  group: null,
  purl: "pkg:npm/lib-a@1.0",
  cpe: null,
  resolvedLicense: { uuid: "l1", licenseId: "MIT", name: "MIT" },
  isInternal: false,
};

const SDK_PROJECT_METRICS: SdkDtProjectMetrics = {
  critical: 1,
  high: 4,
  medium: 3,
  low: 2,
  unassigned: 0,
  vulnerabilities: 10,
  findingsTotal: 10,
  findingsAudited: 5,
  findingsUnaudited: 5,
  suppressions: 1,
  inheritedRiskScore: 50,
  policyViolationsFail: 1,
  policyViolationsWarn: 2,
  policyViolationsInfo: 3,
  policyViolationsTotal: 6,
  firstOccurrence: 1700000000000,
  lastOccurrence: 1700000000000,
};

const SDK_PORTFOLIO_METRICS: SdkDtPortfolioMetrics = {
  critical: 5,
  high: 10,
  medium: 8,
  low: 4,
  unassigned: 0,
  findingsTotal: 27,
  findingsAudited: 10,
  findingsUnaudited: 17,
  inheritedRiskScore: 100,
  policyViolationsFail: 5,
  policyViolationsWarn: 10,
  policyViolationsInfo: 15,
  policyViolationsTotal: 30,
  projects: 3,
};

const SDK_VIOLATION: SdkDtPolicyViolation = {
  uuid: "v1",
  type: "LICENSE",
  component: { uuid: "c1", name: "lib-a", version: "1.0", group: null, purl: null },
  policyCondition: {
    uuid: "pc1",
    subject: "license",
    operator: "MATCHES",
    value: "GPL-3.0",
    policy: { uuid: "pol1", name: "deny gpl", violationState: "FAIL" },
  },
};

const SDK_POLICY_FULL: SdkDtPolicyFull = {
  uuid: "pol1",
  name: "deny gpl",
  violationState: "FAIL",
  includeChildren: true,
  policyConditions: [
    { uuid: "pc1", subject: "license", operator: "MATCHES", value: "GPL-3.0" },
  ],
  projects: [SDK_PROJECT],
  tags: [],
};

const SDK_ANALYSIS_RESPONSE: SdkDtAnalysisResponse = {
  analysisState: "EXPLOITABLE",
  analysisJustification: "code accessible",
  analysisDetails: "see notes",
  isSuppressed: false,
};

describe("dtApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStatus returns status", async () => {
    mockDtStatus.mockResolvedValue({ data: SDK_STATUS, error: undefined });
    const mod = await import("../dependency-track");
    const out = await mod.default.getStatus();
    expect(out.enabled).toBe(true);
    expect(out.url).toBe("https://dt.example.com");
  });

  it("getStatus normalizes url undefined to null (#359)", async () => {
    mockDtStatus.mockResolvedValue({
      data: { ...SDK_STATUS, url: undefined },
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getStatus();
    expect(out.url).toBeNull();
  });

  it("getStatus throws on error", async () => {
    mockDtStatus.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getStatus()).rejects.toBe("fail");
  });

  it("listProjects returns projects", async () => {
    mockListProjects.mockResolvedValue({
      data: [SDK_PROJECT],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.listProjects();
    expect(out[0].uuid).toBe("p1");
    expect(out[0].name).toBe("main");
  });

  it("listProjects throws on error", async () => {
    mockListProjects.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.listProjects()).rejects.toBe("fail");
  });

  it("getProjectFindings returns findings with nested adapters", async () => {
    mockGetProjectFindings.mockResolvedValue({
      data: [SDK_FINDING],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectFindings("p1");
    expect(out[0].component.uuid).toBe("c1");
    expect(out[0].vulnerability.cwe?.cweId).toBe(79);
    expect(out[0].analysis?.state).toBe("EXPLOITABLE");
  });

  it("getProjectFindings handles null analysis/attribution (#359)", async () => {
    mockGetProjectFindings.mockResolvedValue({
      data: [{ ...SDK_FINDING, analysis: null, attribution: null }],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectFindings("p1");
    expect(out[0].analysis).toBeNull();
    expect(out[0].attribution).toBeNull();
  });

  it("getProjectFindings throws on error", async () => {
    mockGetProjectFindings.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectFindings("p1")).rejects.toBe("fail");
  });

  it("getProjectComponents returns components with resolved license", async () => {
    mockGetProjectComponents.mockResolvedValue({
      data: [SDK_COMPONENT_FULL],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectComponents("p1");
    expect(out[0].uuid).toBe("c1");
    expect(out[0].resolvedLicense?.name).toBe("MIT");
  });

  it("getProjectComponents handles null resolvedLicense (#359)", async () => {
    mockGetProjectComponents.mockResolvedValue({
      data: [{ ...SDK_COMPONENT_FULL, resolvedLicense: null }],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectComponents("p1");
    expect(out[0].resolvedLicense).toBeNull();
  });

  it("getProjectComponents throws on error", async () => {
    mockGetProjectComponents.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectComponents("p1")).rejects.toBe("fail");
  });

  it("getProjectMetrics returns metrics", async () => {
    mockGetProjectMetrics.mockResolvedValue({
      data: SDK_PROJECT_METRICS,
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectMetrics("p1");
    expect(out.critical).toBe(1);
    expect(out.high).toBe(4);
  });

  it("getProjectMetrics coerces missing counters to 0 (#359)", async () => {
    // SDK declares all metric fields as optional; local type requires them.
    // Adapter coerces undefined → 0 so an empty backend response renders
    // numeric zeros instead of "undefined" in the project metrics card.
    mockGetProjectMetrics.mockResolvedValue({
      data: {},
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectMetrics("p1");
    expect(out.critical).toBe(0);
    expect(out.findingsTotal).toBe(0);
    expect(out.policyViolationsTotal).toBe(0);
    expect(out.vulnerabilities).toBeNull();
    expect(out.firstOccurrence).toBeNull();
    expect(out.lastOccurrence).toBeNull();
  });

  it("getProjectMetrics throws on error", async () => {
    mockGetProjectMetrics.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectMetrics("p1")).rejects.toBe("fail");
  });

  it("getProjectMetricsHistory returns history", async () => {
    mockGetProjectMetricsHistory.mockResolvedValue({
      data: [SDK_PROJECT_METRICS],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectMetricsHistory("p1", 30);
    expect(out[0].critical).toBe(1);
    expect(mockGetProjectMetricsHistory).toHaveBeenCalledWith({
      path: { project_uuid: "p1" },
      query: { days: 30 },
    });
  });

  it("getProjectMetricsHistory passes undefined query when days omitted", async () => {
    mockGetProjectMetricsHistory.mockResolvedValue({
      data: [SDK_PROJECT_METRICS],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    await mod.default.getProjectMetricsHistory("p1");
    expect(mockGetProjectMetricsHistory).toHaveBeenCalledWith({
      path: { project_uuid: "p1" },
      query: undefined,
    });
  });

  it("getProjectMetricsHistory throws on error", async () => {
    mockGetProjectMetricsHistory.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectMetricsHistory("p1")).rejects.toBe(
      "fail",
    );
  });

  it("getPortfolioMetrics returns metrics", async () => {
    mockGetPortfolioMetrics.mockResolvedValue({
      data: SDK_PORTFOLIO_METRICS,
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getPortfolioMetrics();
    expect(out.projects).toBe(3);
    expect(out.findingsTotal).toBe(27);
  });

  it("getPortfolioMetrics coerces missing counters to 0 (#359)", async () => {
    mockGetPortfolioMetrics.mockResolvedValue({
      data: {},
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getPortfolioMetrics();
    expect(out.projects).toBe(0);
    expect(out.findingsTotal).toBe(0);
  });

  it("getPortfolioMetrics throws on error", async () => {
    mockGetPortfolioMetrics.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../dependency-track");
    await expect(mod.default.getPortfolioMetrics()).rejects.toBe("fail");
  });

  it("getProjectViolations returns violations", async () => {
    mockGetProjectViolations.mockResolvedValue({
      data: [SDK_VIOLATION],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.getProjectViolations("p1");
    expect(out[0].uuid).toBe("v1");
    expect(out[0].policyCondition.policy.name).toBe("deny gpl");
  });

  it("getProjectViolations throws on error", async () => {
    mockGetProjectViolations.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../dependency-track");
    await expect(mod.default.getProjectViolations("p1")).rejects.toBe("fail");
  });

  it("updateAnalysis returns response", async () => {
    mockUpdateAnalysis.mockResolvedValue({
      data: SDK_ANALYSIS_RESPONSE,
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.updateAnalysis({
      project_uuid: "p1",
      component_uuid: "c1",
      vulnerability_uuid: "v1",
      state: "EXPLOITABLE",
      justification: "code accessible",
    });
    expect(out.analysisState).toBe("EXPLOITABLE");
    expect(out.analysisJustification).toBe("code accessible");
  });

  it("updateAnalysis forwards body fields to SDK (#359)", async () => {
    mockUpdateAnalysis.mockResolvedValue({
      data: SDK_ANALYSIS_RESPONSE,
      error: undefined,
    });
    const mod = await import("../dependency-track");
    await mod.default.updateAnalysis({
      project_uuid: "p1",
      component_uuid: "c1",
      vulnerability_uuid: "v1",
      state: "RESOLVED",
      justification: "patched",
      details: "v1.0.1 applied",
      suppressed: true,
    });
    expect(mockUpdateAnalysis).toHaveBeenCalledWith({
      body: {
        project_uuid: "p1",
        component_uuid: "c1",
        vulnerability_uuid: "v1",
        state: "RESOLVED",
        justification: "patched",
        details: "v1.0.1 applied",
        suppressed: true,
      },
    });
  });

  it("updateAnalysis throws on error", async () => {
    mockUpdateAnalysis.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(
      mod.default.updateAnalysis({
        project_uuid: "p1",
        component_uuid: "c1",
        vulnerability_uuid: "v1",
        state: "x",
      }),
    ).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    mockListPolicies.mockResolvedValue({
      data: [SDK_POLICY_FULL],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const out = await mod.default.listPolicies();
    expect(out[0].uuid).toBe("pol1");
    expect(out[0].policyConditions[0].subject).toBe("license");
    expect(out[0].projects[0].uuid).toBe("p1");
  });

  it("listPolicies throws on error", async () => {
    mockListPolicies.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("getAllViolations aggregates violations across projects", async () => {
    mockGetProjectViolations.mockResolvedValue({
      data: [SDK_VIOLATION],
      error: undefined,
    });
    const mod = await import("../dependency-track");
    const result = await mod.default.getAllViolations([
      { uuid: "p1" },
      { uuid: "p2" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("getAllViolations skips projects that throw", async () => {
    mockGetProjectViolations
      .mockResolvedValueOnce({ data: [SDK_VIOLATION], error: undefined })
      .mockResolvedValueOnce({ data: undefined, error: "fail" });
    const mod = await import("../dependency-track");
    const result = await mod.default.getAllViolations([
      { uuid: "p1" },
      { uuid: "p2" },
    ]);
    expect(result).toHaveLength(1);
  });
});
