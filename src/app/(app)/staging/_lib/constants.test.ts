import { describe, it, expect } from "vitest";
import { FORMAT_OPTIONS } from "./constants";

describe("staging FORMAT_OPTIONS", () => {
  // Gradle is served by the Maven handler and Gradle clients use Maven
  // repositories, so a separate "Gradle" filter option matched nothing (#814).
  it("does not offer Gradle separately from Maven", () => {
    const values = FORMAT_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("gradle");
    expect(values).toContain("maven");
  });

  it("has unique values", () => {
    const values = FORMAT_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
