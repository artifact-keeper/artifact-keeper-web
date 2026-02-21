import { describe, it, expect, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  QUERY_KEYS,
  INVALIDATION_GROUPS,
  EVENT_TYPE_MAP,
  getKeysForEvent,
  invalidateGroup,
} from "../query-keys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockQueryClient() {
  return {
    invalidateQueries: vi.fn(),
  } as unknown as QueryClient;
}

// ---------------------------------------------------------------------------
// QUERY_KEYS
// ---------------------------------------------------------------------------

describe("QUERY_KEYS", () => {
  const expectedKeys: Record<string, string[]> = {
    ADMIN_STATS: ["admin-stats"],
    RECENT_REPOS: ["recent-repositories"],
    REPOSITORIES: ["repositories"],
    REPOSITORIES_LIST: ["repositories-list"],
    REPOSITORIES_FOR_SCAN: ["repositories-for-scan"],
    REPOSITORIES_ALL: ["repositories-all"],
    QUALITY_HEALTH: ["quality-health-dashboard"],
    QUALITY_GATES: ["quality-gates"],
    ADMIN_USERS: ["admin-users"],
    ADMIN_GROUPS: ["admin-groups"],
    ADMIN_PERMISSIONS: ["admin-permissions"],
    SERVICE_ACCOUNTS: ["service-accounts"],
  };

  it("has 12 key constants", () => {
    expect(Object.keys(QUERY_KEYS)).toHaveLength(12);
  });

  it.each(Object.entries(expectedKeys))(
    "%s equals %j",
    (name, expected) => {
      const actual = QUERY_KEYS[name as keyof typeof QUERY_KEYS];
      expect(actual).toEqual(expected);
    },
  );

  it("each key is a non-empty string array", () => {
    for (const [name, key] of Object.entries(QUERY_KEYS)) {
      expect(Array.isArray(key), `${name} should be an array`).toBe(true);
      expect(key.length, `${name} should be non-empty`).toBeGreaterThan(0);
      expect(typeof key[0], `${name}[0] should be a string`).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// INVALIDATION_GROUPS
// ---------------------------------------------------------------------------

describe("INVALIDATION_GROUPS", () => {
  it("has all expected groups", () => {
    expect(Object.keys(INVALIDATION_GROUPS).sort((a, b) => a.localeCompare(b))).toEqual([
      "dashboard",
      "groups",
      "permissions",
      "qualityGates",
      "repositories",
      "serviceAccounts",
      "users",
    ]);
  });

  it.each([
    ["dashboard", [["admin-stats"], ["recent-repositories"]]],
    ["users", [["admin-users"], ["admin-groups"]]],
    ["groups", [["admin-groups"], ["admin-permissions"]]],
    ["serviceAccounts", [["service-accounts"]]],
    ["permissions", [["admin-permissions"]]],
    ["qualityGates", [["quality-gates"], ["quality-health-dashboard"]]],
  ] as const)("%s group contains expected keys", (groupName, expectedKeys) => {
    for (const key of expectedKeys) {
      expect(INVALIDATION_GROUPS[groupName]).toContainEqual(key);
    }
  });

  it("repositories group contains all 6 repo-related keys", () => {
    const group = INVALIDATION_GROUPS.repositories;
    expect(group).toHaveLength(6);
    for (const key of [
      ["repositories"], ["repositories-list"], ["repositories-for-scan"],
      ["repositories-all"], ["recent-repositories"], ["quality-health-dashboard"],
    ]) {
      expect(group).toContainEqual(key);
    }
  });

  it("every group value references existing QUERY_KEYS", () => {
    const allKeys = Object.values(QUERY_KEYS);
    for (const [groupName, keys] of Object.entries(INVALIDATION_GROUPS)) {
      for (const key of keys) {
        const found = allKeys.some(
          (qk) => JSON.stringify(qk) === JSON.stringify(key),
        );
        expect(found, `${groupName} contains unknown key ${JSON.stringify(key)}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// EVENT_TYPE_MAP
// ---------------------------------------------------------------------------

describe("EVENT_TYPE_MAP", () => {
  it("maps 20 event types", () => {
    expect(Object.keys(EVENT_TYPE_MAP)).toHaveLength(20);
  });

  it.each([
    ["user.created", "users"],
    ["user.updated", "users"],
    ["user.deleted", "users"],
    ["group.created", "groups"],
    ["group.updated", "groups"],
    ["group.deleted", "groups"],
    ["group.member_added", "groups"],
    ["group.member_removed", "groups"],
    ["repository.created", "repositories"],
    ["repository.updated", "repositories"],
    ["repository.deleted", "repositories"],
    ["service_account.created", "serviceAccounts"],
    ["service_account.updated", "serviceAccounts"],
    ["service_account.deleted", "serviceAccounts"],
    ["permission.created", "permissions"],
    ["permission.updated", "permissions"],
    ["permission.deleted", "permissions"],
    ["quality_gate.created", "qualityGates"],
    ["quality_gate.updated", "qualityGates"],
    ["quality_gate.deleted", "qualityGates"],
  ])("%s maps to %s group", (eventType, expectedGroup) => {
    expect(EVENT_TYPE_MAP[eventType]).toBe(expectedGroup);
  });

  it("every mapped group exists in INVALIDATION_GROUPS", () => {
    const groupNames = Object.keys(INVALIDATION_GROUPS);
    for (const [eventType, group] of Object.entries(EVENT_TYPE_MAP)) {
      expect(
        groupNames.includes(group),
        `${eventType} maps to unknown group "${group}"`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getKeysForEvent
// ---------------------------------------------------------------------------

describe("getKeysForEvent", () => {
  it("returns the correct keys for a known event type", () => {
    const keys = getKeysForEvent("user.created");
    expect(keys).toContainEqual(["admin-users"]);
    expect(keys).toContainEqual(["admin-groups"]);
  });

  it("returns repository keys for repository.deleted", () => {
    const keys = getKeysForEvent("repository.deleted");
    expect(keys).toHaveLength(6);
    expect(keys).toContainEqual(["repositories"]);
    expect(keys).toContainEqual(["repositories-list"]);
  });

  it("returns quality gate keys for quality_gate.updated", () => {
    const keys = getKeysForEvent("quality_gate.updated");
    expect(keys).toContainEqual(["quality-gates"]);
    expect(keys).toContainEqual(["quality-health-dashboard"]);
  });

  it.each(["unknown.event", ""])("returns empty array for %j", (eventType) => {
    expect(getKeysForEvent(eventType)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// invalidateGroup
// ---------------------------------------------------------------------------

describe("invalidateGroup", () => {
  it.each([
    ["repositories", 6, [["repositories"], ["repositories-list"], ["repositories-for-scan"], ["repositories-all"], ["recent-repositories"], ["quality-health-dashboard"]]],
    ["dashboard", 2, [["admin-stats"], ["recent-repositories"]]],
    ["users", 2, [["admin-users"], ["admin-groups"]]],
    ["groups", 2, [["admin-groups"], ["admin-permissions"]]],
  ] as const)("invalidates all keys in the %s group", (groupName, expectedCount, expectedKeys) => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, groupName);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(expectedCount);
    for (const key of expectedKeys) {
      expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it.each(["nonexistent", ""])("does nothing for group name %j", (groupName) => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, groupName);
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });
});
