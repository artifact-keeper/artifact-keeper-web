import { describe, it, expect } from "vitest";
import { deleteSummary } from "../delete-summary";

describe("deleteSummary", () => {
  it("counts what was deleted", () => {
    expect(deleteSummary({ deleted: ["a"], failed: [] })).toBe("1 build deleted");
    expect(deleteSummary({ deleted: ["a", "b"], failed: [] })).toBe("2 builds deleted");
  });

  it("says why the rest stayed", () => {
    expect(
      deleteSummary({
        deleted: [],
        failed: [
          { id: "a", reason: "forbidden" },
          { id: "b", reason: "forbidden" },
          { id: "c", reason: "not_found" },
        ],
      }),
    ).toBe(
      "0 builds deleted, 2 kept, only their creator or an admin can delete them, 1 already gone",
    );
  });
});
