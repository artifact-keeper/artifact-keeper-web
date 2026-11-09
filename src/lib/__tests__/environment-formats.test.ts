import { describe, it, expect } from "vitest";
import { formatHasLockfiles, showEnvironmentsTab } from "../environment-formats";

describe("formatHasLockfiles", () => {
  it.each(["conda", "conda_native", "npm", "cargo", "pypi", "poetry", "jupyter"])(
    "is true for %s",
    (f) => expect(formatHasLockfiles(f)).toBe(true),
  );

  it.each(["maven", "gradle", "docker", "helm", "debian", "rpm", "nuget", "go", "generic", "", null, undefined])(
    "is false for %s",
    (f) => expect(formatHasLockfiles(f as string | null | undefined)).toBe(false),
  );
});

describe("showEnvironmentsTab", () => {
  it("shows it for a lockfile ecosystem even with nothing registered", () => {
    expect(showEnvironmentsTab("npm", 0)).toBe(true);
  });

  it("hides it for Maven with nothing registered", () => {
    expect(showEnvironmentsTab("maven", 0)).toBe(false);
  });

  it("keeps it for any format once an environment is registered, so that data stays reachable", () => {
    expect(showEnvironmentsTab("maven", 1)).toBe(true);
  });
});
