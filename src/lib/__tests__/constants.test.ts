import { describe, it, expect } from "vitest";
import { SCOPES, EXPIRY_OPTIONS } from "../constants/token";

describe("SCOPES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(SCOPES)).toBe(true);
    expect(SCOPES.length).toBeGreaterThan(0);
  });

  it("each scope has a value and label property", () => {
    for (const scope of SCOPES) {
      expect(scope).toHaveProperty("value");
      expect(scope).toHaveProperty("label");
      expect(typeof scope.value).toBe("string");
      expect(typeof scope.label).toBe("string");
    }
  });

  it("contains the expected scope values", () => {
    const values = SCOPES.map((s) => s.value);
    expect(values).toContain("read");
    expect(values).toContain("write");
    expect(values).toContain("delete");
    expect(values).toContain("admin");
  });

  it("has human-readable labels", () => {
    const labels = SCOPES.map((s) => s.label);
    expect(labels).toContain("Read");
    expect(labels).toContain("Write");
    expect(labels).toContain("Delete");
    expect(labels).toContain("Admin");
  });

  it("has exactly 4 scopes", () => {
    expect(SCOPES).toHaveLength(4);
  });
});

describe("EXPIRY_OPTIONS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(EXPIRY_OPTIONS)).toBe(true);
    expect(EXPIRY_OPTIONS.length).toBeGreaterThan(0);
  });

  it("each option has a value and label property", () => {
    for (const option of EXPIRY_OPTIONS) {
      expect(option).toHaveProperty("value");
      expect(option).toHaveProperty("label");
      expect(typeof option.value).toBe("string");
      expect(typeof option.label).toBe("string");
    }
  });

  it("contains the expected day values", () => {
    const values = EXPIRY_OPTIONS.map((o) => o.value);
    expect(values).toContain("30");
    expect(values).toContain("60");
    expect(values).toContain("90");
    expect(values).toContain("180");
    expect(values).toContain("365");
  });

  it("includes a 'Never' option with value '0'", () => {
    const neverOption = EXPIRY_OPTIONS.find((o) => o.value === "0");
    expect(neverOption).toBeDefined();
    expect(neverOption!.label).toBe("Never");
  });

  it("has exactly 6 options", () => {
    expect(EXPIRY_OPTIONS).toHaveLength(6);
  });

  it("labels are descriptive", () => {
    const labels = EXPIRY_OPTIONS.map((o) => o.label);
    expect(labels).toContain("30 days");
    expect(labels).toContain("1 year");
    expect(labels).toContain("Never");
  });
});
