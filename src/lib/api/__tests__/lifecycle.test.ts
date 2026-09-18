import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  LifecyclePolicy,
  PolicyExecutionResult,
} from "@/types/lifecycle";
import type {
  LifecyclePolicy as SdkLifecyclePolicy,
  PolicyExecutionResult as SdkPolicyExecutionResult,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockExecute = vi.fn();
const mockPreview = vi.fn();
const mockExecuteAll = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listLifecyclePolicies: (...args: unknown[]) => mockList(...args),
  getLifecyclePolicy: (...args: unknown[]) => mockGet(...args),
  createLifecyclePolicy: (...args: unknown[]) => mockCreate(...args),
  updateLifecyclePolicy: (...args: unknown[]) => mockUpdate(...args),
  deleteLifecyclePolicy: (...args: unknown[]) => mockDelete(...args),
  executePolicy: (...args: unknown[]) => mockExecute(...args),
  previewPolicy: (...args: unknown[]) => mockPreview(...args),
  executeAllPolicies: (...args: unknown[]) => mockExecuteAll(...args),
}));

// Realistic SDK fixture with all fields populated; the adapter must
// pass these through with optional+nullable fields normalized to null.
// Typed as SdkLifecyclePolicy so a future SDK schema drift (new required
// field) breaks the fixture at typecheck rather than silently shipping
// stale shape coverage (R1 #359).
const SDK_POLICY: SdkLifecyclePolicy = {
  id: "p1",
  repository_id: "repo-a",
  name: "cleanup",
  description: "drop old artifacts",
  enabled: true,
  policy_type: "max_age_days",
  config: { days: 30 },
  priority: 100,
  last_run_at: "2026-05-01T00:00:00Z",
  last_run_items_removed: 12,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const EXPECTED_POLICY: LifecyclePolicy = {
  id: "p1",
  repository_id: "repo-a",
  name: "cleanup",
  description: "drop old artifacts",
  enabled: true,
  policy_type: "max_age_days",
  config: { days: 30 },
  priority: 100,
  last_run_at: "2026-05-01T00:00:00Z",
  last_run_items_removed: 12,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

// `bytes_matched` is on the wire from backend 1.10.0 (artifact-keeper#2024)
// but is not in the pinned SDK's PolicyExecutionResult type yet, so the
// fixture declares it alongside the generated shape.
const SDK_EXECUTION_RESULT: SdkPolicyExecutionResult & { bytes_matched: number } = {
  policy_id: "p1",
  policy_name: "cleanup",
  dry_run: false,
  artifacts_matched: 5,
  artifacts_removed: 5,
  bytes_matched: 1024,
  bytes_freed: 1024,
  errors: [],
};

const EXPECTED_EXECUTION_RESULT: PolicyExecutionResult = {
  policy_id: "p1",
  policy_name: "cleanup",
  dry_run: false,
  artifacts_matched: 5,
  artifacts_removed: 5,
  bytes_matched: 1024,
  bytes_freed: 1024,
  errors: [],
};

describe("lifecycleApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns policies", async () => {
    mockList.mockResolvedValue({ data: [SDK_POLICY], error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.lifecycleApi.list()).toEqual([EXPECTED_POLICY]);
  });

  it("list throws on error", async () => {
    mockList.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.list()).rejects.toBe("fail");
  });

  it("list normalizes optional+nullable fields to null (#359)", async () => {
    // SDK shape has `repository_id?: string | null`; when omitted,
    // the adapter must coerce to `null` (the local LifecyclePolicy
    // type declares the field as required-but-nullable).
    const partial = {
      ...SDK_POLICY,
      repository_id: undefined,
      description: undefined,
      last_run_at: undefined,
      last_run_items_removed: undefined,
    };
    mockList.mockResolvedValue({ data: [partial], error: undefined });
    const mod = await import("../lifecycle");
    const [out] = await mod.lifecycleApi.list();
    expect(out.repository_id).toBeNull();
    expect(out.description).toBeNull();
    expect(out.last_run_at).toBeNull();
    expect(out.last_run_items_removed).toBeNull();
  });

  it("get returns a single policy", async () => {
    mockGet.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.lifecycleApi.get("p1")).toEqual(EXPECTED_POLICY);
  });

  it("get throws on error", async () => {
    mockGet.mockResolvedValue({ data: undefined, error: "not found" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.get("p1")).rejects.toBe("not found");
  });

  it("create returns new policy", async () => {
    mockCreate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    expect(
      await mod.lifecycleApi.create({
        name: "cleanup",
        policy_type: "max_age_days",
        config: { days: 30 },
      })
    ).toEqual(EXPECTED_POLICY);
  });

  it("create forwards local body shape to SDK and strips extras (#359)", async () => {
    // Locks the adapter contract: even though the SDK declares the body
    // type as security-policy CreatePolicyRequest (an SDK type leak), the
    // wire payload must be the local lifecycle CreateLifecyclePolicyRequest.
    // Cast to bypass TS so we can prove the adapter strips an unrelated
    // field that doesn't belong on the wire — the explicit-field forward
    // in adaptCreateRequest is what makes this test load-bearing.
    mockCreate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    await mod.lifecycleApi.create({
      name: "cleanup",
      policy_type: "max_age_days",
      config: { days: 30 },
      repository_id: "repo-a",
      description: "test",
      priority: 50,
      // @ts-expect-error — intentionally not in CreateLifecyclePolicyRequest
      bogus_extra_field: "should be stripped by adapter",
    });
    expect(mockCreate).toHaveBeenCalledWith({
      body: {
        name: "cleanup",
        policy_type: "max_age_days",
        config: { days: 30 },
        repository_id: "repo-a",
        description: "test",
        priority: 50,
      },
    });
  });

  it("create throws on error", async () => {
    mockCreate.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(
      mod.lifecycleApi.create({
        name: "x",
        policy_type: "max_age_days",
        config: {},
      })
    ).rejects.toBe("fail");
  });

  it("update returns updated policy", async () => {
    mockUpdate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    expect(
      await mod.lifecycleApi.update("p1", { name: "updated" })
    ).toEqual(EXPECTED_POLICY);
  });

  it("update throws on error", async () => {
    mockUpdate.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.update("p1", {})).rejects.toBe("fail");
  });

  it("get throws Empty response body when SDK returns success with no data (#359)", async () => {
    // Pre-#359 the `data as never` would have silently returned undefined.
    // Post-#359 assertData flips that into a thrown error so the failure is
    // observable instead of propagating undefined into rendering code.
    mockGet.mockResolvedValue({ data: undefined, error: undefined });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.get("p1")).rejects.toThrow(/Empty response body/);
  });

  it("execute returns result with non-empty errors array (#359)", async () => {
    mockExecute.mockResolvedValue({
      data: { ...SDK_EXECUTION_RESULT, errors: ["disk full", "permission denied"] },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    const out = await mod.lifecycleApi.execute("p1");
    expect(out.errors).toEqual(["disk full", "permission denied"]);
  });

  it("delete calls SDK", async () => {
    mockDelete.mockResolvedValue({ error: undefined });
    const mod = await import("../lifecycle");
    await mod.lifecycleApi.delete("p1");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDelete.mockResolvedValue({ error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.delete("p1")).rejects.toBe("fail");
  });

  it("execute returns result", async () => {
    mockExecute.mockResolvedValue({ data: SDK_EXECUTION_RESULT, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.lifecycleApi.execute("p1")).toEqual(EXPECTED_EXECUTION_RESULT);
  });

  it("execute throws on error", async () => {
    mockExecute.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.execute("p1")).rejects.toBe("fail");
  });

  it("preview returns result", async () => {
    mockPreview.mockResolvedValue({
      data: { ...SDK_EXECUTION_RESULT, dry_run: true },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect(await mod.lifecycleApi.preview("p1")).toEqual({
      ...EXPECTED_EXECUTION_RESULT,
      dry_run: true,
    });
  });

  it("preview throws on error", async () => {
    mockPreview.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.preview("p1")).rejects.toBe("fail");
  });

  it("executeAll returns array of results", async () => {
    mockExecuteAll.mockResolvedValue({
      data: [SDK_EXECUTION_RESULT],
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect(await mod.lifecycleApi.executeAll()).toEqual([EXPECTED_EXECUTION_RESULT]);
  });

  it("executeAll throws on error", async () => {
    mockExecuteAll.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.lifecycleApi.executeAll()).rejects.toBe("fail");
  });

  it("preview reports bytes_matched on a dry run where bytes_freed is 0 (#2024)", async () => {
    // The whole point of the field: a dry run frees nothing, so only
    // bytes_matched says how much the run would reclaim.
    mockPreview.mockResolvedValue({
      data: {
        ...SDK_EXECUTION_RESULT,
        dry_run: true,
        artifacts_removed: 0,
        bytes_matched: 4096,
        bytes_freed: 0,
      },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    const out = await mod.lifecycleApi.preview("p1");
    expect(out.bytes_matched).toBe(4096);
    expect(out.bytes_freed).toBe(0);
  });

  it("preview degrades bytes_matched to null on a backend without the field", async () => {
    const { bytes_matched: _omitted, ...withoutField } = SDK_EXECUTION_RESULT;
    mockPreview.mockResolvedValue({
      data: { ...withoutField, dry_run: true },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect((await mod.lifecycleApi.preview("p1")).bytes_matched).toBeNull();
  });

  it("preview degrades a non-numeric bytes_matched to null", async () => {
    mockPreview.mockResolvedValue({
      data: { ...SDK_EXECUTION_RESULT, bytes_matched: "1024" },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect((await mod.lifecycleApi.preview("p1")).bytes_matched).toBeNull();
  });

  it("create forwards config.exclude to the SDK body (#2024)", async () => {
    mockCreate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    await mod.lifecycleApi.create({
      name: "cleanup",
      policy_type: "max_age_days",
      config: mod.withExclusions(
        { days: 30 },
        { versions: ["latest"], version_patterns: ["^v[0-9]+$"] }
      ),
    });
    expect(mockCreate).toHaveBeenCalledWith({
      body: {
        name: "cleanup",
        policy_type: "max_age_days",
        config: {
          days: 30,
          exclude: { versions: ["latest"], version_patterns: ["^v[0-9]+$"] },
        },
        repository_id: undefined,
        description: undefined,
        priority: undefined,
      },
    });
  });
});

describe("withExclusions", () => {
  it("omits the exclude block entirely when both lists are empty", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.withExclusions({ days: 30 }, { versions: [], version_patterns: [] })
    ).toEqual({ days: 30 });
  });

  it("omits an empty list rather than sending an empty array", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.withExclusions({ keep: 5 }, { versions: ["latest"], version_patterns: [] })
    ).toEqual({ keep: 5, exclude: { versions: ["latest"] } });
  });

  it("replaces an exclude block already present in the config", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.withExclusions(
        { days: 30, exclude: { versions: ["stale"] } },
        { versions: ["latest"], version_patterns: [] }
      )
    ).toEqual({ days: 30, exclude: { versions: ["latest"] } });
  });

  it("leaves a hand-written exclude block alone when the editor is empty", async () => {
    const mod = await import("../lifecycle");
    const config = { days: 30, exclude: { versions: ["stable"] } };
    expect(
      mod.withExclusions(config, { versions: [], version_patterns: [] })
    ).toEqual(config);
  });

  it("passes a non-object config through for the backend to refuse", async () => {
    const mod = await import("../lifecycle");
    const notAnObject = [1, 2] as unknown as Record<string, unknown>;
    expect(
      mod.withExclusions(notAnObject, { versions: ["latest"], version_patterns: [] })
    ).toBe(notAnObject);
  });
});

describe("parseLifecycleConfigError", () => {
  it("maps an unknown top-level config key to the config field", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.parseLifecycleConfigError({
        code: "VALIDATION_ERROR",
        message:
          "unknown config key 'excludes' for policy_type 'max_versions'. Allowed: keep, max_versions, exclude",
      })
    ).toEqual({
      key: "excludes",
      field: "config",
      message:
        "unknown config key 'excludes' for policy_type 'max_versions'. Allowed: keep, max_versions, exclude",
    });
  });

  it("maps an unknown key inside the exclude block to the config field", async () => {
    const mod = await import("../lifecycle");
    const out = mod.parseLifecycleConfigError({
      message: "unknown key 'exclude.version_pattern'. Allowed: versions, version_patterns",
    });
    expect(out?.key).toBe("exclude.version_pattern");
    expect(out?.field).toBe("config");
  });

  it("maps a rejected regex to the patterns list", async () => {
    const mod = await import("../lifecycle");
    const out = mod.parseLifecycleConfigError({
      message: "Invalid regex in exclude.version_patterns: unclosed group",
    });
    expect(out?.field).toBe("exclude_version_patterns");
    expect(out?.key).toBe("exclude.version_patterns");
  });

  it("maps an empty entry to the versions list", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.parseLifecycleConfigError({
        message: "exclude.versions entries must not be empty",
      })?.field
    ).toBe("exclude_versions");
  });

  it("reads the message out of a wrapped HTTP error body", async () => {
    const mod = await import("../lifecycle");
    expect(
      mod.parseLifecycleConfigError({
        status: 400,
        body: { message: "unknown config key 'schedule' for policy_type 'max_age_days'. Allowed: days, max_age_days, exclude" },
      })?.key
    ).toBe("schedule");
  });

  it("returns null for an unrelated failure so generic handling still applies", async () => {
    const mod = await import("../lifecycle");
    expect(mod.parseLifecycleConfigError({ message: "Policy not found" })).toBeNull();
    expect(mod.parseLifecycleConfigError(undefined)).toBeNull();
  });
});
