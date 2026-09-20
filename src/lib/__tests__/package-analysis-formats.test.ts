import { describe, it, expect } from "vitest";
import { supportsPackageAnalysis, PACKAGE_ANALYSIS_FORMATS } from "../package-analysis-formats";

describe("supportsPackageAnalysis", () => {
  it("is true for every format the backend unpacks", () => {
    for (const f of ["conda", "conda_native", "npm", "pypi", "rpm", "debian"] as const) {
      expect(supportsPackageAnalysis(f), f).toBe(true);
    }
  });

  it("is false for every other format", () => {
    for (const f of ["generic", "docker", "maven", "alpine", "cargo"] as const) {
      expect(supportsPackageAnalysis(f), f).toBe(false);
    }
  });

  it("exposes the set for callers that need to enumerate it", () => {
    expect([...PACKAGE_ANALYSIS_FORMATS].sort()).toEqual([
      "conda",
      "conda_native",
      "debian",
      "npm",
      "pypi",
      "rpm",
    ]);
  });
});
