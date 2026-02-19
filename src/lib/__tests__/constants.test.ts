import { describe, it, expect } from "vitest";
import { SCOPES, EXPIRY_OPTIONS } from "../constants/token";

describe("SCOPES", () => {
  it("has 4 scopes with correct structure and values", () => {
    expect(SCOPES).toHaveLength(4);
    const values = SCOPES.map((s) => s.value);
    const labels = SCOPES.map((s) => s.label);
    expect(values).toEqual(expect.arrayContaining(["read", "write", "delete", "admin"]));
    expect(labels).toEqual(expect.arrayContaining(["Read", "Write", "Delete", "Admin"]));
    for (const scope of SCOPES) {
      expect(typeof scope.value).toBe("string");
      expect(typeof scope.label).toBe("string");
    }
  });
});

describe("EXPIRY_OPTIONS", () => {
  it("has 6 options with correct structure and values", () => {
    expect(EXPIRY_OPTIONS).toHaveLength(6);
    const values = EXPIRY_OPTIONS.map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(["30", "60", "90", "180", "365", "0"]));
    for (const option of EXPIRY_OPTIONS) {
      expect(typeof option.value).toBe("string");
      expect(typeof option.label).toBe("string");
    }
  });

  it("has a Never option and descriptive labels", () => {
    const neverOption = EXPIRY_OPTIONS.find((o) => o.value === "0");
    expect(neverOption?.label).toBe("Never");
    const labels = EXPIRY_OPTIONS.map((o) => o.label);
    expect(labels).toContain("30 days");
    expect(labels).toContain("1 year");
  });
});
