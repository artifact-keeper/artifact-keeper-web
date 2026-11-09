import { describe, it, expect } from "vitest";
import type { Permission } from "@/lib/api/permissions";
import {
  EMPTY_PERMISSION_FILTERS,
  filterPermissions,
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilters,
} from "../permission-filters";

const perm = (over: Partial<Permission>): Permission => ({
  id: "p",
  principal_type: "group",
  principal_id: "g1",
  principal_name: "READ_ONLY",
  target_type: "repository",
  target_id: "r1",
  target_name: "npm-proxy",
  actions: ["read"],
  created_at: "",
  updated_at: "",
  ...over,
});

const labels = {
  principalLabel: (p: Permission) => p.principal_name ?? p.principal_id,
  targetLabel: (p: Permission) => p.target_name ?? p.target_id,
};

const rows = [
  perm({ id: "1" }),
  perm({ id: "2", principal_name: "TEAM_A", principal_id: "g2", target_name: "team-a-libs", target_id: "r2", actions: ["read", "write", "delete"] }),
  perm({ id: "3", principal_type: "user", principal_id: "u1", principal_name: "alice", target_type: "artifact", target_id: "art1", target_name: "libs.tgz", actions: ["admin"] }),
];

const ids = (items: Permission[]) => items.map((p) => p.id);

describe("filterPermissions", () => {
  it("returns everything with no filters", () => {
    expect(filterPermissions(rows, EMPTY_PERMISSION_FILTERS, labels)).toHaveLength(3);
  });

  it("answers 'what can group X access'", () => {
    const f = { ...EMPTY_PERMISSION_FILTERS, principalType: "group" as const, principal: "team_a" };
    expect(ids(filterPermissions(rows, f, labels))).toEqual(["2"]);
  });

  it("answers 'who has access to repository Y'", () => {
    const f = { ...EMPTY_PERMISSION_FILTERS, targetType: "repository" as const, target: "npm-proxy" };
    expect(ids(filterPermissions(rows, f, labels))).toEqual(["1"]);
  });

  it("answers 'who has delete anywhere'", () => {
    const f = { ...EMPTY_PERMISSION_FILTERS, action: "delete" as const };
    expect(ids(filterPermissions(rows, f, labels))).toEqual(["2"]);
  });

  it("combines filters with AND", () => {
    const f = { ...EMPTY_PERMISSION_FILTERS, principalType: "group" as const, action: "write" as const, target: "team-a" };
    expect(ids(filterPermissions(rows, f, labels))).toEqual(["2"]);
    expect(filterPermissions(rows, { ...f, action: "admin" }, labels)).toEqual([]);
  });

  it("matches case-insensitively and on the id as well as the name", () => {
    expect(ids(filterPermissions(rows, { ...EMPTY_PERMISSION_FILTERS, principal: "ALICE" }, labels))).toEqual(["3"]);
    expect(ids(filterPermissions(rows, { ...EMPTY_PERMISSION_FILTERS, target: "art1" }, labels))).toEqual(["3"]);
  });

  it("ignores whitespace-only text", () => {
    expect(filterPermissions(rows, { ...EMPTY_PERMISSION_FILTERS, principal: "   " }, labels)).toHaveLength(3);
  });
});

describe("filters in the query string", () => {
  it("round-trips every filter", () => {
    const filters = {
      principalType: "group" as const,
      principal: "team a",
      targetType: "artifact" as const,
      target: "pay",
      action: "write" as const,
    };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
  });

  it("drops unknown enum values instead of trusting them", () => {
    const f = filtersFromSearch("?principal_type=root&target_type=everything&action=nuke&principal=x");
    expect(f).toEqual({ ...EMPTY_PERMISSION_FILTERS, principal: "x" });
  });

  it("leaves unrelated params alone and removes cleared filters", () => {
    const withFilter = filtersToSearch({ ...EMPTY_PERMISSION_FILTERS, action: "read" }, "mcp_ns=foo");
    expect(new URLSearchParams(withFilter).get("mcp_ns")).toBe("foo");
    expect(new URLSearchParams(withFilter).get("action")).toBe("read");
    const cleared = filtersToSearch(EMPTY_PERMISSION_FILTERS, withFilter);
    expect(cleared).toBe("mcp_ns=foo");
  });

  it("reports whether any filter is set", () => {
    expect(hasActiveFilters(EMPTY_PERMISSION_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_PERMISSION_FILTERS, target: "x" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_PERMISSION_FILTERS, target: "  " })).toBe(false);
  });
});
