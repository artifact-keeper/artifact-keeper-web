import { describe, it, expect } from "vitest";
import {
  isCveId,
  isGhsaId,
  advisoryUrl,
  vulnIdType,
} from "../vuln-utils";

describe("isCveId", () => {
  it("returns true for standard CVE identifiers", () => {
    expect(isCveId("CVE-2024-1234")).toBe(true);
    expect(isCveId("CVE-2023-45678")).toBe(true);
    expect(isCveId("CVE-2020-0001")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCveId("cve-2024-1234")).toBe(true);
  });

  it("returns false for non-CVE identifiers", () => {
    expect(isCveId("GHSA-abcd-efgh-ijkl")).toBe(false);
    expect(isCveId("")).toBe(false);
    expect(isCveId("CVE-")).toBe(false);
    expect(isCveId("CVE-2024")).toBe(false);
    expect(isCveId("some-random-string")).toBe(false);
  });
});

describe("isGhsaId", () => {
  it("returns true for standard GHSA identifiers", () => {
    expect(isGhsaId("GHSA-abcd-efgh-ijkl")).toBe(true);
    expect(isGhsaId("GHSA-1234-5678-9abc")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isGhsaId("ghsa-abcd-efgh-ijkl")).toBe(true);
  });

  it("returns false for non-GHSA identifiers", () => {
    expect(isGhsaId("CVE-2024-1234")).toBe(false);
    expect(isGhsaId("")).toBe(false);
    expect(isGhsaId("GHSA-")).toBe(false);
    expect(isGhsaId("GHSA-abc-efgh-ijkl")).toBe(false);
    expect(isGhsaId("some-random-string")).toBe(false);
  });
});

describe("advisoryUrl", () => {
  it("returns NVD URL for CVE identifiers", () => {
    expect(advisoryUrl("CVE-2024-1234")).toBe(
      "https://nvd.nist.gov/vuln/detail/CVE-2024-1234"
    );
  });

  it("returns GitHub advisory URL for GHSA identifiers", () => {
    expect(advisoryUrl("GHSA-abcd-efgh-ijkl")).toBe(
      "https://github.com/advisories/GHSA-abcd-efgh-ijkl"
    );
  });

  it("returns null for unknown identifier formats", () => {
    expect(advisoryUrl("some-random-string")).toBeNull();
    expect(advisoryUrl("")).toBeNull();
  });
});

describe("vulnIdType", () => {
  it("classifies CVE identifiers", () => {
    expect(vulnIdType("CVE-2024-1234")).toBe("CVE");
  });

  it("classifies GHSA identifiers", () => {
    expect(vulnIdType("GHSA-abcd-efgh-ijkl")).toBe("GHSA");
  });

  it("classifies unknown identifiers as Advisory", () => {
    expect(vulnIdType("PYSEC-2024-1")).toBe("Advisory");
    expect(vulnIdType("")).toBe("Advisory");
  });
});
