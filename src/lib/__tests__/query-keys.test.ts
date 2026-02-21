import { describe, it, expect, vi } from "vitest";
import {
  QUERY_KEYS,
  INVALIDATION_GROUPS,
  EVENT_TYPE_MAP,
  getKeysForEvent,
  invalidateGroup,
} from "../query-keys";

// ---------------------------------------------------------------------------
// QUERY_KEYS
// ---------------------------------------------------------------------------

describe("QUERY_KEYS", () => {
  it("exports all expected key constants", () => {
    expect(QUERY_KEYS.ADMIN_STATS).toEqual(["admin-stats"]);
    expect(QUERY_KEYS.RECENT_REPOS).toEqual(["recent-repositories"]);
    expect(QUERY_KEYS.REPOSITORIES).toEqual(["repositories"]);
    expect(QUERY_KEYS.REPOSITORIES_LIST).toEqual(["repositories-list"]);
    expect(QUERY_KEYS.REPOSITORIES_FOR_SCAN).toEqual(["repositories-for-scan"]);
    expect(QUERY_KEYS.REPOSITORIES_ALL).toEqual(["repositories-all"]);
    expect(QUERY_KEYS.QUALITY_HEALTH).toEqual(["quality-health-dashboard"]);
    expect(QUERY_KEYS.QUALITY_GATES).toEqual(["quality-gates"]);
    expect(QUERY_KEYS.ADMIN_USERS).toEqual(["admin-users"]);
    expect(QUERY_KEYS.ADMIN_GROUPS).toEqual(["admin-groups"]);
    expect(QUERY_KEYS.ADMIN_PERMISSIONS).toEqual(["admin-permissions"]);
    expect(QUERY_KEYS.SERVICE_ACCOUNTS).toEqual(["service-accounts"]);
  });

  it("has 12 key constants", () => {
    expect(Object.keys(QUERY_KEYS)).toHaveLength(12);
  });

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
    expect(Object.keys(INVALIDATION_GROUPS).sort()).toEqual([
      "dashboard",
      "groups",
      "permissions",
      "qualityGates",
      "repositories",
      "serviceAccounts",
      "users",
    ]);
  });

  it("dashboard group contains admin-stats and recent-repositories", () => {
    expect(INVALIDATION_GROUPS.dashboard).toContainEqual(["admin-stats"]);
    expect(INVALIDATION_GROUPS.dashboard).toContainEqual(["recent-repositories"]);
  });

  it("repositories group contains all 6 repo-related keys", () => {
    const group = INVALIDATION_GROUPS.repositories;
    expect(group).toHaveLength(6);
    expect(group).toContainEqual(["repositories"]);
    expect(group).toContainEqual(["repositories-list"]);
    expect(group).toContainEqual(["repositories-for-scan"]);
    expect(group).toContainEqual(["repositories-all"]);
    expect(group).toContainEqual(["recent-repositories"]);
    expect(group).toContainEqual(["quality-health-dashboard"]);
  });

  it("users group includes admin-users and admin-groups", () => {
    expect(INVALIDATION_GROUPS.users).toContainEqual(["admin-users"]);
    expect(INVALIDATION_GROUPS.users).toContainEqual(["admin-groups"]);
  });

  it("groups group includes admin-groups and admin-permissions", () => {
    expect(INVALIDATION_GROUPS.groups).toContainEqual(["admin-groups"]);
    expect(INVALIDATION_GROUPS.groups).toContainEqual(["admin-permissions"]);
  });

  it("serviceAccounts group includes service-accounts", () => {
    expect(INVALIDATION_GROUPS.serviceAccounts).toContainEqual(["service-accounts"]);
  });

  it("permissions group includes admin-permissions", () => {
    expect(INVALIDATION_GROUPS.permissions).toContainEqual(["admin-permissions"]);
  });

  it("qualityGates group includes quality-gates and quality-health-dashboard", () => {
    expect(INVALIDATION_GROUPS.qualityGates).toContainEqual(["quality-gates"]);
    expect(INVALIDATION_GROUPS.qualityGates).toContainEqual(["quality-health-dashboard"]);
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

  it("maps user events to users group", () => {
    expect(EVENT_TYPE_MAP["user.created"]).toBe("users");
    expect(EVENT_TYPE_MAP["user.updated"]).toBe("users");
    expect(EVENT_TYPE_MAP["user.deleted"]).toBe("users");
  });

  it("maps group events to groups group", () => {
    expect(EVENT_TYPE_MAP["group.created"]).toBe("groups");
    expect(EVENT_TYPE_MAP["group.updated"]).toBe("groups");
    expect(EVENT_TYPE_MAP["group.deleted"]).toBe("groups");
    expect(EVENT_TYPE_MAP["group.member_added"]).toBe("groups");
    expect(EVENT_TYPE_MAP["group.member_removed"]).toBe("groups");
  });

  it("maps repository events to repositories group", () => {
    expect(EVENT_TYPE_MAP["repository.created"]).toBe("repositories");
    expect(EVENT_TYPE_MAP["repository.updated"]).toBe("repositories");
    expect(EVENT_TYPE_MAP["repository.deleted"]).toBe("repositories");
  });

  it("maps service account events to serviceAccounts group", () => {
    expect(EVENT_TYPE_MAP["service_account.created"]).toBe("serviceAccounts");
    expect(EVENT_TYPE_MAP["service_account.updated"]).toBe("serviceAccounts");
    expect(EVENT_TYPE_MAP["service_account.deleted"]).toBe("serviceAccounts");
  });

  it("maps permission events to permissions group", () => {
    expect(EVENT_TYPE_MAP["permission.created"]).toBe("permissions");
    expect(EVENT_TYPE_MAP["permission.updated"]).toBe("permissions");
    expect(EVENT_TYPE_MAP["permission.deleted"]).toBe("permissions");
  });

  it("maps quality gate events to qualityGates group", () => {
    expect(EVENT_TYPE_MAP["quality_gate.created"]).toBe("qualityGates");
    expect(EVENT_TYPE_MAP["quality_gate.updated"]).toBe("qualityGates");
    expect(EVENT_TYPE_MAP["quality_gate.deleted"]).toBe("qualityGates");
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

  it("returns empty array for unknown event type", () => {
    expect(getKeysForEvent("unknown.event")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(getKeysForEvent("")).toEqual([]);
  });

  it("returns quality gate keys for quality_gate.updated", () => {
    const keys = getKeysForEvent("quality_gate.updated");
    expect(keys).toContainEqual(["quality-gates"]);
    expect(keys).toContainEqual(["quality-health-dashboard"]);
  });
});

// ---------------------------------------------------------------------------
// invalidateGroup
// ---------------------------------------------------------------------------

describe("invalidateGroup", () => {
  function createMockQueryClient() {
    return {
      invalidateQueries: vi.fn(),
    } as unknown as import("@tanstack/react-query").QueryClient;
  }

  it("invalidates all keys in the repositories group", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "repositories");
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(6);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["repositories"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["repositories-list"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["repositories-for-scan"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["repositories-all"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["recent-repositories"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["quality-health-dashboard"] });
  });

  it("invalidates all keys in the dashboard group", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "dashboard");
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-stats"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["recent-repositories"] });
  });

  it("invalidates all keys in the users group", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "users");
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-users"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-groups"] });
  });

  it("invalidates all keys in the groups group", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "groups");
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-groups"] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-permissions"] });
  });

  it("does nothing for an unknown group", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "nonexistent");
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });

  it("does nothing for an empty group name", () => {
    const qc = createMockQueryClient();
    invalidateGroup(qc, "");
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });
});
