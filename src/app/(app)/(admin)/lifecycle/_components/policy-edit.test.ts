import { describe, expect, it } from "vitest";
import type { LifecyclePolicy } from "@/types/lifecycle";
import { withExclusions } from "@/lib/api/lifecycle";
import { buildPolicyUpdate, configsEqual, splitPolicyConfig } from "./policy-edit";

const policy: LifecyclePolicy = {
  id: "p1", name: "Cleanup", description: null, enabled: true, policy_type: "max_age_days",
  config: { days: 90, exclude: { versions: ["latest"] } }, priority: 100, cron_schedule: null,
  repository_id: null, applies_to_all: false, repository_ids: ["r1", "r2"], scope_source: "explicit",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  last_run_at: null, last_run_items_removed: null,
};

function unchangedDraft(p: LifecyclePolicy = policy) {
  return {
    name: p.name,
    description: p.description ?? "",
    config: p.config,
    cronSchedule: p.cron_schedule ?? "",
    appliesToAll: p.applies_to_all,
  };
}

describe("splitPolicyConfig", () => {
  it("moves a representable exclude block into the editor", () => {
    expect(splitPolicyConfig({ days: 90, exclude: { versions: ["latest"], version_patterns: ["^v1"] } }))
      .toEqual({ config: { days: 90 }, exclusions: { versions: ["latest"], version_patterns: ["^v1"] } });
  });

  it("leaves an exclude block the editor cannot show in the JSON", () => {
    const config = { days: 90, exclude: { versions: "latest" } };
    expect(splitPolicyConfig(config)).toEqual({
      config, exclusions: { versions: [], version_patterns: [] },
    });
  });

  it("round-trips: removing the last exclusion removes config.exclude", () => {
    const { config } = splitPolicyConfig(policy.config);
    expect(withExclusions(config, { versions: [], version_patterns: [] })).toEqual({ days: 90 });
  });
});

describe("configsEqual", () => {
  it("ignores key order", () => {
    expect(configsEqual({ a: 1, b: { c: [1, 2], d: 2 } }, { b: { d: 2, c: [1, 2] }, a: 1 })).toBe(true);
    expect(configsEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe("buildPolicyUpdate", () => {
  it("sends nothing when nothing changed", () => {
    expect(buildPolicyUpdate(policy, unchangedDraft())).toEqual({});
  });

  it("sends only the renamed field, without config or scope", () => {
    expect(buildPolicyUpdate(policy, { ...unchangedDraft(), name: " Renamed " }))
      .toEqual({ name: "Renamed" });
  });

  it("treats a reordered config as unchanged and a new value as changed", () => {
    const reordered = { exclude: { versions: ["latest"] }, days: 90 };
    expect(buildPolicyUpdate(policy, { ...unchangedDraft(), config: reordered })).toEqual({});
    expect(buildPolicyUpdate(policy, { ...unchangedDraft(), config: { days: 30 } }))
      .toEqual({ config: { days: 30 } });
  });

  it("does not count the form's own normalization of exclude as a change", () => {
    for (const exclude of [{}, { versions: [], version_patterns: [] }]) {
      const stored = { ...policy, config: { days: 90, exclude } };
      const { config, exclusions } = splitPolicyConfig(stored.config);
      expect(buildPolicyUpdate(stored, {
        ...unchangedDraft(stored),
        name: "Renamed",
        config: withExclusions(config, exclusions),
      })).toEqual({ name: "Renamed" });
    }
  });

  it("does not treat surrounding whitespace in a stored name as a rename", () => {
    const padded = { ...policy, name: " Cleanup " };
    expect(buildPolicyUpdate(padded, { ...unchangedDraft(padded), name: "Cleanup" })).toEqual({});
  });

  it("sends an emptied description as an empty string", () => {
    expect(buildPolicyUpdate({ ...policy, description: "old" }, { ...unchangedDraft(), description: "" }))
      .toEqual({ description: "" });
  });

  it("sends a new or changed cron schedule, never an empty one", () => {
    expect(buildPolicyUpdate(policy, { ...unchangedDraft(), cronSchedule: " 0 3 * * * " }))
      .toEqual({ cron_schedule: "0 3 * * *" });
    const scheduled = { ...policy, cron_schedule: "0 3 * * *" };
    expect(buildPolicyUpdate(scheduled, { ...unchangedDraft(scheduled), cronSchedule: "" })).toEqual({});
  });

  it("switching to global clears explicit assignments in the same request", () => {
    expect(buildPolicyUpdate(policy, { ...unchangedDraft(), appliesToAll: true }))
      .toEqual({ applies_to_all: true, repository_ids: [] });
  });

  it("switching off global leaves the policy unassigned", () => {
    const global = { ...policy, applies_to_all: true, repository_ids: [] };
    expect(buildPolicyUpdate(global, { ...unchangedDraft(global), appliesToAll: false }))
      .toEqual({ applies_to_all: false, repository_ids: [] });
  });
});
