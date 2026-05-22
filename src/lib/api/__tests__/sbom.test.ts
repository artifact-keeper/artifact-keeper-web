import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SbomResponse as SdkSbomResponse,
  SbomContentResponse as SdkSbomContentResponse,
  ComponentResponse as SdkComponentResponse,
  CveHistoryEntry as SdkCveHistoryEntry,
  CveTrends as SdkCveTrends,
  LicensePolicyResponse as SdkLicensePolicyResponse,
  LicenseCheckResult as SdkLicenseCheckResult,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGenerateSbom = vi.fn();
const mockListSboms = vi.fn();
const mockGetSbom = vi.fn();
const mockGetSbomByArtifact = vi.fn();
const mockGetSbomComponents = vi.fn();
const mockConvertSbom = vi.fn();
const mockDeleteSbom = vi.fn();
const mockGetCveHistory = vi.fn();
const mockUpdateCveStatus = vi.fn();
const mockGetCveTrends = vi.fn();
const mockListLicensePolicies = vi.fn();
const mockGetLicensePolicy = vi.fn();
const mockUpsertLicensePolicy = vi.fn();
const mockDeleteLicensePolicy = vi.fn();
const mockCheckLicenseCompliance = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  generateSbom: (...args: unknown[]) => mockGenerateSbom(...args),
  listSboms: (...args: unknown[]) => mockListSboms(...args),
  getSbom: (...args: unknown[]) => mockGetSbom(...args),
  getSbomByArtifact: (...args: unknown[]) => mockGetSbomByArtifact(...args),
  getSbomComponents: (...args: unknown[]) => mockGetSbomComponents(...args),
  convertSbom: (...args: unknown[]) => mockConvertSbom(...args),
  deleteSbom: (...args: unknown[]) => mockDeleteSbom(...args),
  getCveHistory: (...args: unknown[]) => mockGetCveHistory(...args),
  updateCveStatus: (...args: unknown[]) => mockUpdateCveStatus(...args),
  getCveTrends: (...args: unknown[]) => mockGetCveTrends(...args),
  listLicensePolicies: (...args: unknown[]) => mockListLicensePolicies(...args),
  getLicensePolicy: (...args: unknown[]) => mockGetLicensePolicy(...args),
  upsertLicensePolicy: (...args: unknown[]) => mockUpsertLicensePolicy(...args),
  deleteLicensePolicy: (...args: unknown[]) => mockDeleteLicensePolicy(...args),
  checkLicenseCompliance: (...args: unknown[]) =>
    mockCheckLicenseCompliance(...args),
}));

const SDK_SBOM: SdkSbomResponse = {
  id: "sbom1",
  artifact_id: "a1",
  repository_id: "repo1",
  format: "cyclonedx",
  format_version: "1.5",
  spec_version: "1.5",
  component_count: 10,
  dependency_count: 8,
  license_count: 3,
  licenses: ["MIT", "Apache-2.0"],
  content_hash: "sha256:abc",
  generator: "syft",
  generator_version: "1.0",
  generated_at: "2026-05-01T00:00:00Z",
  created_at: "2026-05-01T00:00:00Z",
};

const SDK_SBOM_CONTENT: SdkSbomContentResponse = {
  ...SDK_SBOM,
  content: { sbom: "data" },
};

const SDK_COMPONENT: SdkComponentResponse = {
  id: "c1",
  sbom_id: "sbom1",
  name: "lib-a",
  version: "1.0",
  purl: "pkg:npm/lib-a@1.0",
  cpe: null,
  component_type: "library",
  licenses: ["MIT"],
  sha256: "abc",
  sha1: null,
  md5: null,
  supplier: "vendor",
  author: "ada",
};

const SDK_CVE: SdkCveHistoryEntry = {
  id: "cve-1",
  artifact_id: "a1",
  sbom_id: "sbom1",
  component_id: "c1",
  scan_result_id: null,
  cve_id: "CVE-2024-001",
  affected_component: "lib-a",
  affected_version: "1.0",
  fixed_version: "1.0.1",
  severity: "high",
  cvss_score: 7.5,
  cve_published_at: "2024-09-01T00:00:00Z",
  first_detected_at: "2026-04-01T00:00:00Z",
  last_detected_at: "2026-05-01T00:00:00Z",
  status: "open",
  acknowledged_by: null,
  acknowledged_at: null,
  acknowledged_reason: null,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_TRENDS: SdkCveTrends = {
  total_cves: 10,
  open_cves: 5,
  fixed_cves: 3,
  acknowledged_cves: 2,
  critical_count: 1,
  high_count: 4,
  medium_count: 3,
  low_count: 2,
  avg_days_to_fix: 15.5,
  timeline: [
    {
      cve_id: "CVE-2024-001",
      severity: "high",
      affected_component: "lib-a",
      cve_published_at: "2024-09-01T00:00:00Z",
      first_detected_at: "2026-04-01T00:00:00Z",
      status: "open",
      days_exposed: 30,
    },
  ],
};

const SDK_POLICY: SdkLicensePolicyResponse = {
  id: "lp1",
  repository_id: "repo1",
  name: "default",
  description: "block GPL",
  allowed_licenses: ["MIT", "Apache-2.0"],
  denied_licenses: ["GPL-3.0"],
  allow_unknown: false,
  action: "block",
  is_enabled: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("sbomApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generate returns SBOM response", async () => {
    mockGenerateSbom.mockResolvedValue({ data: SDK_SBOM, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.generate({ artifact_id: "a1" });
    expect(out.id).toBe("sbom1");
    expect(out.licenses).toEqual(["MIT", "Apache-2.0"]);
  });

  it("generate throws on error", async () => {
    mockGenerateSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.generate({ artifact_id: "a1" })).rejects.toBe("fail");
  });

  it("list returns SBOMs", async () => {
    mockListSboms.mockResolvedValue({ data: [SDK_SBOM], error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.list();
    expect(out[0].id).toBe("sbom1");
  });

  it("list normalizes optional+nullable fields to null (#359)", async () => {
    mockListSboms.mockResolvedValue({
      data: [
        {
          ...SDK_SBOM,
          spec_version: undefined,
          generator: undefined,
          generator_version: undefined,
        },
      ],
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.list();
    expect(out[0].spec_version).toBeNull();
    expect(out[0].generator).toBeNull();
    expect(out[0].generator_version).toBeNull();
  });

  it("list throws on error", async () => {
    mockListSboms.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.list()).rejects.toBe("fail");
  });

  it("get returns SBOM content", async () => {
    mockGetSbom.mockResolvedValue({ data: SDK_SBOM_CONTENT, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.get("sbom1");
    expect(out.id).toBe("sbom1");
    expect(out.content).toEqual({ sbom: "data" });
  });

  it("get throws on error", async () => {
    mockGetSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.get("sbom1")).rejects.toBe("fail");
  });

  it("getByArtifact returns SBOM content", async () => {
    mockGetSbomByArtifact.mockResolvedValue({
      data: SDK_SBOM_CONTENT,
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.getByArtifact("a1");
    expect(out.id).toBe("sbom1");
  });

  it("getByArtifact does not pass query (SDK has none)", async () => {
    mockGetSbomByArtifact.mockResolvedValue({
      data: SDK_SBOM_CONTENT,
      error: undefined,
    });
    const mod = await import("../sbom");
    await mod.default.getByArtifact("a1");
    expect(mockGetSbomByArtifact).toHaveBeenCalledWith({
      path: { artifact_id: "a1" },
    });
  });

  it("getByArtifact throws on error", async () => {
    mockGetSbomByArtifact.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getByArtifact("a1")).rejects.toBe("fail");
  });

  it("getComponents returns components", async () => {
    mockGetSbomComponents.mockResolvedValue({
      data: [SDK_COMPONENT],
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.getComponents("sbom1");
    expect(out[0].name).toBe("lib-a");
    expect(out[0].cpe).toBeNull();
  });

  it("getComponents throws on error", async () => {
    mockGetSbomComponents.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getComponents("sbom1")).rejects.toBe("fail");
  });

  it("convert returns converted SBOM", async () => {
    mockConvertSbom.mockResolvedValue({ data: SDK_SBOM, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.convert("sbom1", { target_format: "spdx" });
    expect(out.id).toBe("sbom1");
  });

  it("convert throws on error", async () => {
    mockConvertSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(
      mod.default.convert("sbom1", { target_format: "spdx" }),
    ).rejects.toBe("fail");
  });

  it("delete calls SDK", async () => {
    mockDeleteSbom.mockResolvedValue({ error: undefined });
    const mod = await import("../sbom");
    await mod.default.delete("sbom1");
    expect(mockDeleteSbom).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeleteSbom.mockResolvedValue({ error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.delete("sbom1")).rejects.toBe("fail");
  });

  it("getCveHistory returns entries", async () => {
    mockGetCveHistory.mockResolvedValue({ data: [SDK_CVE], error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.getCveHistory("a1");
    expect(out[0].cve_id).toBe("CVE-2024-001");
  });

  it("getCveHistory throws on error", async () => {
    mockGetCveHistory.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getCveHistory("a1")).rejects.toBe("fail");
  });

  it("updateCveStatus returns updated entry", async () => {
    mockUpdateCveStatus.mockResolvedValue({ data: SDK_CVE, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.updateCveStatus("cve1", { status: "fixed" });
    expect(out.cve_id).toBe("CVE-2024-001");
  });

  it("updateCveStatus throws on error", async () => {
    mockUpdateCveStatus.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(
      mod.default.updateCveStatus("cve1", { status: "fixed" }),
    ).rejects.toBe("fail");
  });

  it("getCveTrends returns trends", async () => {
    mockGetCveTrends.mockResolvedValue({ data: SDK_TRENDS, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.getCveTrends();
    expect(out.total_cves).toBe(10);
    expect(out.timeline[0].cve_id).toBe("CVE-2024-001");
  });

  it("getCveTrends throws on error", async () => {
    mockGetCveTrends.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getCveTrends()).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    mockListLicensePolicies.mockResolvedValue({
      data: [SDK_POLICY],
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.listPolicies();
    expect(out[0].id).toBe("lp1");
  });

  it("listPolicies throws on error", async () => {
    mockListLicensePolicies.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../sbom");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("getPolicy returns policy", async () => {
    mockGetLicensePolicy.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../sbom");
    const out = await mod.default.getPolicy("lp1");
    expect(out.id).toBe("lp1");
  });

  it("getPolicy throws on error", async () => {
    mockGetLicensePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getPolicy("lp1")).rejects.toBe("fail");
  });

  it("upsertPolicy returns policy", async () => {
    mockUpsertLicensePolicy.mockResolvedValue({
      data: SDK_POLICY,
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.upsertPolicy({
      name: "default",
      allowed_licenses: ["MIT"],
      denied_licenses: ["GPL-3.0"],
    });
    expect(out.id).toBe("lp1");
  });

  it("upsertPolicy throws on error", async () => {
    mockUpsertLicensePolicy.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../sbom");
    await expect(
      mod.default.upsertPolicy({
        name: "x",
        allowed_licenses: [],
        denied_licenses: [],
      }),
    ).rejects.toBe("fail");
  });

  it("deletePolicy calls SDK", async () => {
    mockDeleteLicensePolicy.mockResolvedValue({ error: undefined });
    const mod = await import("../sbom");
    await mod.default.deletePolicy("lp1");
    expect(mockDeleteLicensePolicy).toHaveBeenCalled();
  });

  it("deletePolicy throws on error", async () => {
    mockDeleteLicensePolicy.mockResolvedValue({ error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.deletePolicy("lp1")).rejects.toBe("fail");
  });

  it("checkCompliance synthesizes action and violation reasons (#359)", async () => {
    // SDK returns string[] for violations and has no `action` field; the
    // adapter synthesizes both. See sbom.ts for full rationale.
    const sdkResult: SdkLicenseCheckResult = {
      compliant: false,
      violations: ["GPL-3.0", "AGPL-3.0"],
      warnings: ["unverified license"],
    };
    mockCheckLicenseCompliance.mockResolvedValue({
      data: sdkResult,
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.checkCompliance({ licenses: ["GPL-3.0"] });
    expect(out.compliant).toBe(false);
    expect(out.action).toBe("block");
    expect(out.violations).toEqual([
      { license: "GPL-3.0", reason: "" },
      { license: "AGPL-3.0", reason: "" },
    ]);
    expect(out.warnings).toEqual(["unverified license"]);
  });

  it("checkCompliance synthesizes allow action when compliant (#359)", async () => {
    mockCheckLicenseCompliance.mockResolvedValue({
      data: { compliant: true, violations: [], warnings: [] },
      error: undefined,
    });
    const mod = await import("../sbom");
    const out = await mod.default.checkCompliance({ licenses: ["MIT"] });
    expect(out.compliant).toBe(true);
    expect(out.action).toBe("allow");
  });

  it("checkCompliance throws on error", async () => {
    mockCheckLicenseCompliance.mockResolvedValue({
      data: undefined,
      error: "fail",
    });
    const mod = await import("../sbom");
    await expect(
      mod.default.checkCompliance({ licenses: ["MIT"] }),
    ).rejects.toBe("fail");
  });
});
