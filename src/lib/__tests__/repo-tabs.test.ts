import { describe, it, expect } from "vitest";

import {
  isPackageOrientedFormat,
  defaultRepoTab,
  resolveInitialRepoTab,
} from "@/lib/repo-tabs";
import type { RepositoryFormat } from "@/types";

describe("isPackageOrientedFormat", () => {
  it.each<[RepositoryFormat, boolean]>([
    // package-oriented
    ["maven", true],
    ["gradle", true],
    ["npm", true],
    ["pypi", true],
    ["cargo", true],
    ["nuget", true],
    ["rubygems", true],
    ["go", true],
    ["composer", true],
    ["helm", true],
    ["rpm", true],
    ["debian", true],
    // NOT package-oriented (artifact / image / blob)
    ["generic", false],
    ["docker", false],
    ["podman", false],
    ["oras", false],
    ["wasm_oci", false],
    ["gitlfs", false],
  ])("returns %s => %s", (format, expected) => {
    expect(isPackageOrientedFormat(format)).toBe(expected);
  });
});

describe("defaultRepoTab", () => {
  it("defaults package-oriented formats to the Packages tab", () => {
    expect(defaultRepoTab("maven")).toBe("packages");
    expect(defaultRepoTab("npm")).toBe("packages");
    expect(defaultRepoTab("pypi")).toBe("packages");
  });

  it("defaults RAW/Generic and container formats to the Artifacts tab", () => {
    expect(defaultRepoTab("generic")).toBe("artifacts");
    expect(defaultRepoTab("docker")).toBe("artifacts");
  });

  it("defaults to Artifacts when the format is unknown/undefined", () => {
    expect(defaultRepoTab(undefined)).toBe("artifacts");
  });
});

describe("resolveInitialRepoTab", () => {
  it("uses the per-format default when there is no override", () => {
    expect(resolveInitialRepoTab(null, null, "maven")).toBe("packages");
    expect(resolveInitialRepoTab(null, null, "generic")).toBe("artifacts");
  });

  it("honors an explicit, valid ?tab= override above everything", () => {
    // force Artifacts on a package format
    expect(resolveInitialRepoTab("artifacts", null, "maven")).toBe("artifacts");
    // force Packages on a generic repo
    expect(resolveInitialRepoTab("packages", null, "generic")).toBe("packages");
    // ?tab wins even when ?view is also present
    expect(resolveInitialRepoTab("packages", "grouped", "maven")).toBe(
      "packages",
    );
  });

  it("ignores an invalid ?tab= value and falls back", () => {
    expect(resolveInitialRepoTab("bogus", null, "maven")).toBe("packages");
    expect(resolveInitialRepoTab("", null, "generic")).toBe("artifacts");
  });

  it("pins the Artifacts tab whenever a ?view= artifact deep-link is present", () => {
    // ?view is an Artifacts-browser concept, so even a package format lands on
    // Artifacts when a view is requested (preserves existing artifact links).
    expect(resolveInitialRepoTab(null, "flat", "maven")).toBe("artifacts");
    expect(resolveInitialRepoTab(null, "grouped", "npm")).toBe("artifacts");
    expect(resolveInitialRepoTab(null, "tree", "generic")).toBe("artifacts");
  });

  it("treats an empty ?view= as absent", () => {
    expect(resolveInitialRepoTab(null, "", "maven")).toBe("packages");
  });
});
