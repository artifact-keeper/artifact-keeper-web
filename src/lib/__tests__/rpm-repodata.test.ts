import { describe, expect, it } from "vitest";
import { parseRepodataDepth, repodataRootExample, supportsRpmRepodataDepth, validateRepodataUploadPath } from "../rpm-repodata";

describe("RPM repodata layout", () => {
  it.each(["", " ", "-1", "1.5", "1e2", "0x10", "Infinity", "NaN", "1024", "9007199254740992"])("rejects invalid input %j", (value) => {
    expect(parseRepodataDepth(value, { min: 0, max: 1023 })).toBeNull();
  });
  it.each([0, 1, 2, 1023])("parses depth %i", (depth) => {
    expect(parseRepodataDepth(String(depth), { min: 0, max: 1023 })).toBe(depth);
  });
  it("uses advertised rather than hardcoded limits", () => {
    expect(parseRepodataDepth("4", { min: 0, max: 3 })).toBeNull();
    expect(parseRepodataDepth("33", { min: 0, max: 100 })).toBe(33);
  });
  it("only offers settings for Local RPM", () => {
    expect(supportsRpmRepodataDepth("rpm", "local")).toBe(true);
    for (const type of ["remote", "virtual", "staging", "snapshot", "curated"]) {
      expect(supportsRpmRepodataDepth("rpm", type)).toBe(false);
    }
    expect(supportsRpmRepodataDepth("generic", "local")).toBe(false);
  });
  it("uses readable examples without expanding huge depths", () => {
    expect(repodataRootExample(0)).toBe("");
    expect(repodataRootExample(1)).toBe("build-a");
    expect(repodataRootExample(2)).toBe("build-a/x86_64");
    expect(repodataRootExample(1023)).toBe("<root-with-1023-directories>");
  });
  it("accepts independent roots and their descendants", () => {
    for (const path of ["build-a/a.rpm", "build-b/b.rpm", "build-a/deeper/a.rpm"]) {
      expect(validateRepodataUploadPath(path, 1)).toBeUndefined();
    }
    expect(validateRepodataUploadPath("build-a/a.rpm", 2)).toContain("at least 2");
    expect(validateRepodataUploadPath("build-a/x86_64/a.rpm", 2)).toBeUndefined();
    expect(validateRepodataUploadPath("a.rpm", 1)).toContain("at least 1");
  });
  it.each(["/a/b.rpm", "a//b.rpm", "a/../b.rpm", "a/./b.rpm", "a\\b.rpm", "a/"])("rejects invalid relative path %s without normalizing it", (path) => {
    expect(validateRepodataUploadPath(path, 1)).toBeDefined();
    expect(validateRepodataUploadPath(path, 0)).toBeUndefined();
  });
});
