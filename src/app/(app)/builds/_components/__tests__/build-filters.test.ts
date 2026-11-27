import { describe, it, expect } from "vitest";
import { PAGE_SIZES, buildFilterParams } from "../build-filters";

const empty = { branch: "", agent: "", from: "", to: "" };

describe("buildFilterParams", () => {
  it("sends nothing for an empty bar", () => {
    expect(buildFilterParams(empty)).toEqual({});
  });

  it("trims text filters and turns days into an inclusive UTC range", () => {
    expect(
      buildFilterParams({ branch: " main ", agent: "runner-a", from: "2026-11-01", to: "2026-11-30" }),
    ).toEqual({
      branch: "main",
      agent: "runner-a",
      created_after: "2026-11-01T00:00:00Z",
      created_before: "2026-12-01T00:00:00Z",
    });
  });

  it("ignores a half-typed date", () => {
    expect(buildFilterParams({ ...empty, from: "2026-11" })).toEqual({});
  });
});

describe("PAGE_SIZES", () => {
  it("starts at the old fixed size of 20 and stays within the backend's per_page cap", () => {
    expect(PAGE_SIZES[0]).toBe(20);
    expect(Math.max(...PAGE_SIZES)).toBeLessThanOrEqual(100);
  });
});
