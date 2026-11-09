import { describe, it, expect } from "vitest";
import { canCreateRepository, canManageRepository } from "../repo-permissions";

const none = new Set<string>();
const some = new Set(["p1"]);

describe("canCreateRepository", () => {
  it("allows a global admin with no projects", () => {
    expect(canCreateRepository(true, none)).toBe(true);
  });
  it("allows a project admin", () => {
    expect(canCreateRepository(false, some)).toBe(true);
  });
  it("refuses a user who administers nothing, which includes plain project members", () => {
    expect(canCreateRepository(false, none)).toBe(false);
  });
});

describe("canManageRepository", () => {
  it("allows a global admin on any repository", () => {
    expect(canManageRepository(true, undefined, none)).toBe(true);
    expect(canManageRepository(true, "other", none)).toBe(true);
  });
  it("allows a project admin on repositories in their project only", () => {
    expect(canManageRepository(false, "p1", some)).toBe(true);
    expect(canManageRepository(false, "p2", some)).toBe(false);
  });
  it("refuses a project admin on a repository outside any project", () => {
    expect(canManageRepository(false, undefined, some)).toBe(false);
  });
});
