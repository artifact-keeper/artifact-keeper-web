import { describe, it, expect } from "vitest";
import { PAGE_SIZES } from "../build-filters";

describe("PAGE_SIZES", () => {
  it("starts at the old fixed size of 20 and stays within the backend's per_page cap", () => {
    expect(PAGE_SIZES[0]).toBe(20);
    expect(Math.max(...PAGE_SIZES)).toBeLessThanOrEqual(100);
  });
});
