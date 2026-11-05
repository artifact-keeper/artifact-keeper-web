import { describe, it, expect } from "vitest";
import { formatPackageDownloads, formatVersionLabel } from "../package-display";

describe("formatVersionLabel", () => {
  it("shows a Hugging Face revision verbatim, without a v prefix", () => {
    expect(formatVersionLabel("main", "huggingface")).toBe("main");
    expect(formatVersionLabel("v1", "huggingface")).toBe("v1");
    expect(formatVersionLabel("1.0", "huggingface")).toBe("1.0");
  });

  it("shows tags and labels of non-semver formats verbatim", () => {
    expect(formatVersionLabel("latest", "docker")).toBe("latest");
    expect(formatVersionLabel("1.25", "docker")).toBe("1.25");
    expect(formatVersionLabel("3", "mlmodel")).toBe("3");
    expect(formatVersionLabel("2024-01-01", "generic")).toBe("2024-01-01");
    expect(formatVersionLabel("abc123", "gitlfs")).toBe("abc123");
  });

  it("is case-insensitive on the format", () => {
    expect(formatVersionLabel("main", "HuggingFace")).toBe("main");
  });

  it("keeps the v prefix for semver-ish versions of other formats", () => {
    expect(formatVersionLabel("1.2.3", "npm")).toBe("v1.2.3");
    expect(formatVersionLabel("0.1.0", "cargo")).toBe("v0.1.0");
    expect(formatVersionLabel("1.2.3", undefined)).toBe("v1.2.3");
  });

  it("does not double a v the version already carries", () => {
    expect(formatVersionLabel("v1.2.3", "go")).toBe("v1.2.3");
  });

  it("does not prefix a non-numeric version in any format", () => {
    expect(formatVersionLabel("main", "npm")).toBe("main");
    expect(formatVersionLabel("latest", "pypi")).toBe("latest");
  });

  it("returns an empty string for a missing version", () => {
    expect(formatVersionLabel(undefined, "npm")).toBe("");
    expect(formatVersionLabel(null, "huggingface")).toBe("");
    expect(formatVersionLabel("", "npm")).toBe("");
  });
});

describe("formatPackageDownloads", () => {
  it("shows a positive count as the backend reports it", () => {
    expect(formatPackageDownloads(7)).toBe("7");
    expect(formatPackageDownloads(1_500)).toBe("1.5K");
  });

  it("hides the untracked default of 0 instead of showing 0 downloads", () => {
    expect(formatPackageDownloads(0)).toBeNull();
  });

  it("hides an absent or null count", () => {
    expect(formatPackageDownloads(undefined)).toBeNull();
    expect(formatPackageDownloads(null)).toBeNull();
  });

  it("hides nonsense values", () => {
    expect(formatPackageDownloads(-1)).toBeNull();
    expect(formatPackageDownloads(Number.NaN)).toBeNull();
    expect(formatPackageDownloads(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
