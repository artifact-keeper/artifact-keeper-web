import { describe, it, expect, vi, beforeEach } from "vitest";

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
  checkLicenseCompliance: (...args: unknown[]) => mockCheckLicenseCompliance(...args),
}));

describe("sbomApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generate returns SBOM response", async () => {
    const data = { id: "sbom1" };
    mockGenerateSbom.mockResolvedValue({ data, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.generate({ artifact_id: "a1" } as any)).toEqual(data);
  });

  it("generate throws on error", async () => {
    mockGenerateSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.generate({} as any)).rejects.toBe("fail");
  });

  it("list returns SBOMs", async () => {
    const data = [{ id: "sbom1" }];
    mockListSboms.mockResolvedValue({ data, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListSboms.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.list()).rejects.toBe("fail");
  });

  it("get returns SBOM content", async () => {
    const data = { id: "sbom1", content: {} };
    mockGetSbom.mockResolvedValue({ data, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.get("sbom1")).toEqual(data);
  });

  it("get throws on error", async () => {
    mockGetSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.get("sbom1")).rejects.toBe("fail");
  });

  it("getByArtifact returns SBOM content", async () => {
    const data = { id: "sbom1" };
    mockGetSbomByArtifact.mockResolvedValue({ data, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.getByArtifact("a1")).toEqual(data);
  });

  it("getByArtifact passes format param", async () => {
    mockGetSbomByArtifact.mockResolvedValue({ data: {}, error: undefined });
    const mod = await import("../sbom");
    await mod.default.getByArtifact("a1", "cyclonedx");
    expect(mockGetSbomByArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { format: "cyclonedx" },
      })
    );
  });

  it("getByArtifact throws on error", async () => {
    mockGetSbomByArtifact.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getByArtifact("a1")).rejects.toBe("fail");
  });

  it("getComponents returns components", async () => {
    const components = [{ name: "lib" }];
    mockGetSbomComponents.mockResolvedValue({ data: components, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.getComponents("sbom1")).toEqual(components);
  });

  it("getComponents throws on error", async () => {
    mockGetSbomComponents.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getComponents("sbom1")).rejects.toBe("fail");
  });

  it("convert returns converted SBOM", async () => {
    const data = { id: "sbom2" };
    mockConvertSbom.mockResolvedValue({ data, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.convert("sbom1", { target_format: "spdx" } as any)).toEqual(data);
  });

  it("convert throws on error", async () => {
    mockConvertSbom.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.convert("sbom1", {} as any)).rejects.toBe("fail");
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
    const entries = [{ cve_id: "CVE-2024-001" }];
    mockGetCveHistory.mockResolvedValue({ data: entries, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.getCveHistory("a1")).toEqual(entries);
  });

  it("getCveHistory throws on error", async () => {
    mockGetCveHistory.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getCveHistory("a1")).rejects.toBe("fail");
  });

  it("updateCveStatus returns updated entry", async () => {
    const entry = { cve_id: "CVE-2024-001", status: "resolved" };
    mockUpdateCveStatus.mockResolvedValue({ data: entry, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.updateCveStatus("cve1", { status: "resolved" } as any)).toEqual(entry);
  });

  it("updateCveStatus throws on error", async () => {
    mockUpdateCveStatus.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.updateCveStatus("cve1", {} as any)).rejects.toBe("fail");
  });

  it("getCveTrends returns trends", async () => {
    const trends = { total: 10 };
    mockGetCveTrends.mockResolvedValue({ data: trends, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.getCveTrends()).toEqual(trends);
  });

  it("getCveTrends throws on error", async () => {
    mockGetCveTrends.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getCveTrends()).rejects.toBe("fail");
  });

  it("listPolicies returns policies", async () => {
    const policies = [{ id: "lp1" }];
    mockListLicensePolicies.mockResolvedValue({ data: policies, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.listPolicies()).toEqual(policies);
  });

  it("listPolicies throws on error", async () => {
    mockListLicensePolicies.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.listPolicies()).rejects.toBe("fail");
  });

  it("getPolicy returns policy", async () => {
    const policy = { id: "lp1" };
    mockGetLicensePolicy.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.getPolicy("lp1")).toEqual(policy);
  });

  it("getPolicy throws on error", async () => {
    mockGetLicensePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.getPolicy("lp1")).rejects.toBe("fail");
  });

  it("upsertPolicy returns policy", async () => {
    const policy = { id: "lp1" };
    mockUpsertLicensePolicy.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.upsertPolicy({} as any)).toEqual(policy);
  });

  it("upsertPolicy throws on error", async () => {
    mockUpsertLicensePolicy.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.upsertPolicy({} as any)).rejects.toBe("fail");
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

  it("checkCompliance returns result", async () => {
    const result = { compliant: true };
    mockCheckLicenseCompliance.mockResolvedValue({ data: result, error: undefined });
    const mod = await import("../sbom");
    expect(await mod.default.checkCompliance({} as any)).toEqual(result);
  });

  it("checkCompliance throws on error", async () => {
    mockCheckLicenseCompliance.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../sbom");
    await expect(mod.default.checkCompliance({} as any)).rejects.toBe("fail");
  });
});
