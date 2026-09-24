import { describe, it, expect } from "vitest";
import { backendAtLeast } from "../backend-version";

describe("backendAtLeast", () => {
  it.each([
    ["1.10.1", false],
    ["1.10.99", false],
    ["0.99.0", false],
    ["1.11.0", true],
    ["v1.11.0", true],
    [" 1.11.0 ", true],
    ["1.11.1", true],
    ["1.12.0", true],
    ["2.0.0", true],
    ["1.100.0", true],
  ])("%s >= 1.11.0 is %s", (version, expected) => {
    expect(backendAtLeast(version, "1.11.0")).toBe(expected);
  });

  it("is false for an unknown or unparseable version", () => {
    for (const v of [undefined, null, "", "dev", "1.11", "1.11.x", "latest", "1.11.0.1"]) {
      expect(backendAtLeast(v, "1.11.0")).toBe(false);
    }
  });

  it("treats a pre-release of the minimum as below it", () => {
    expect(backendAtLeast("1.11.0-rc.1", "1.11.0")).toBe(false);
    expect(backendAtLeast("1.11.0-dev", "1.11.0")).toBe(false);
  });

  it("treats a pre-release of a later version as above the minimum", () => {
    expect(backendAtLeast("1.12.0-rc.1", "1.11.0")).toBe(true);
    expect(backendAtLeast("1.10.1-dev", "1.11.0")).toBe(false);
  });

  it("ignores build metadata", () => {
    expect(backendAtLeast("1.11.0+abc1234", "1.11.0")).toBe(true);
    expect(backendAtLeast("1.10.1+abc1234", "1.11.0")).toBe(false);
    expect(backendAtLeast("1.11.0-rc.1+abc1234", "1.11.0")).toBe(false);
  });

  it("is false for an unparseable or pre-release minimum", () => {
    expect(backendAtLeast("1.11.0", "soon")).toBe(false);
    expect(backendAtLeast("1.11.0", "1.11.0-rc.1")).toBe(false);
  });
});
