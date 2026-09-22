import { describe, it, expect } from "vitest";
import { visibilityFromAccessScope, visibilityLabel } from "../repo-visibility";

describe("visibilityFromAccessScope", () => {
  it("reads public and internal straight off the scope", () => {
    // `is_public` is false for an internal repository; the scope wins.
    expect(visibilityFromAccessScope("public", true)).toBe("public");
    expect(visibilityFromAccessScope("internal", false)).toBe("internal");
  });

  it("maps both restricted scopes to private", () => {
    expect(visibilityFromAccessScope("restricted_acl", false)).toBe("private");
    expect(visibilityFromAccessScope("restricted_roles", false)).toBe("private");
  });

  it("falls back to the is_public mirror for a scope it does not know", () => {
    expect(visibilityFromAccessScope("quarantined", true)).toBe("public");
    expect(visibilityFromAccessScope("quarantined", false)).toBe("private");
  });
});

describe("visibilityLabel", () => {
  it("returns the shared display label for each state", () => {
    expect(visibilityLabel("public")).toBe("Public");
    expect(visibilityLabel("internal")).toBe("Internal");
    expect(visibilityLabel("private")).toBe("Private");
  });

  it("degrades an unknown value to the raw string", () => {
    expect(visibilityLabel("org-only" as never)).toBe("org-only");
  });
});
