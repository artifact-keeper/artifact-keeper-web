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

const SDK_EXECUTION_RESULT: SdkPolicyExecutionResult = {
  policy_id: "p1",
  policy_name: "cleanup",
  dry_run: false,
  artifacts_matched: 5,
  artifacts_removed: 5,
  bytes_freed: 1024,
  errors: [],
};

const EXPECTED_EXECUTION_RESULT: PolicyExecutionResult = {
  policy_id: "p1",
  policy_name: "cleanup",
  dry_run: false,
  artifacts_matched: 5,
  artifacts_removed: 5,
  bytes_freed: 1024,
  errors: [],
};

describe("lifecycleApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns policies", async () => {
    mockList.mockResolvedValue({ data: [SDK_POLICY], error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.list()).toEqual([EXPECTED_POLICY]);
  });

  it("list throws on error", async () => {
    mockList.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.list()).rejects.toBe("fail");
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
    const [out] = await mod.default.list();
    expect(out.repository_id).toBeNull();
    expect(out.description).toBeNull();
    expect(out.last_run_at).toBeNull();
    expect(out.last_run_items_removed).toBeNull();
  });

  it("get returns a single policy", async () => {
    mockGet.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.get("p1")).toEqual(EXPECTED_POLICY);
  });

  it("get throws on error", async () => {
    mockGet.mockResolvedValue({ data: undefined, error: "not found" });
    const mod = await import("../lifecycle");
    await expect(mod.default.get("p1")).rejects.toBe("not found");
  });

  it("create returns new policy", async () => {
    mockCreate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    expect(
      await mod.default.create({
        name: "cleanup",
        policy_type: "max_age_days",
        config: { days: 30 },
      })
    ).toEqual(EXPECTED_POLICY);
  });

  it("create forwards local body shape to SDK (#359)", async () => {
    // Locks the adapter contract: even though the SDK declares the body
    // type as security-policy CreatePolicyRequest (an SDK type leak), the
    // wire payload must be the local lifecycle CreateLifecyclePolicyRequest.
    mockCreate.mockResolvedValue({ data: SDK_POLICY, error: undefined });
    const mod = await import("../lifecycle");
    await mod.default.create({
      name: "cleanup",
      policy_type: "max_age_days",
      config: { days: 30 },
      repository_id: "repo-a",
      description: "test",
      priority: 50,
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
      mod.default.create({
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
      await mod.default.update("p1", { name: "updated" })
    ).toEqual(EXPECTED_POLICY);
  });

  it("update throws on error", async () => {
    mockUpdate.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.update("p1", {})).rejects.toBe("fail");
  });

  it("get throws Empty response body when SDK returns success with no data (#359)", async () => {
    // Pre-#359 the `data as never` would have silently returned undefined.
    // Post-#359 assertData flips that into a thrown error so the failure is
    // observable instead of propagating undefined into rendering code.
    mockGet.mockResolvedValue({ data: undefined, error: undefined });
    const mod = await import("../lifecycle");
    await expect(mod.default.get("p1")).rejects.toThrow(/Empty response body/);
  });

  it("execute returns result with non-empty errors array (#359)", async () => {
    mockExecute.mockResolvedValue({
      data: { ...SDK_EXECUTION_RESULT, errors: ["disk full", "permission denied"] },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    const out = await mod.default.execute("p1");
    expect(out.errors).toEqual(["disk full", "permission denied"]);
  });

  it("delete calls SDK", async () => {
    mockDelete.mockResolvedValue({ error: undefined });
    const mod = await import("../lifecycle");
    await mod.default.delete("p1");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDelete.mockResolvedValue({ error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.delete("p1")).rejects.toBe("fail");
  });

  it("execute returns result", async () => {
    mockExecute.mockResolvedValue({ data: SDK_EXECUTION_RESULT, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.execute("p1")).toEqual(EXPECTED_EXECUTION_RESULT);
  });

  it("execute throws on error", async () => {
    mockExecute.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.execute("p1")).rejects.toBe("fail");
  });

  it("preview returns result", async () => {
    mockPreview.mockResolvedValue({
      data: { ...SDK_EXECUTION_RESULT, dry_run: true },
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect(await mod.default.preview("p1")).toEqual({
      ...EXPECTED_EXECUTION_RESULT,
      dry_run: true,
    });
  });

  it("preview throws on error", async () => {
    mockPreview.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.preview("p1")).rejects.toBe("fail");
  });

  it("executeAll returns array of results", async () => {
    mockExecuteAll.mockResolvedValue({
      data: [SDK_EXECUTION_RESULT],
      error: undefined,
    });
    const mod = await import("../lifecycle");
    expect(await mod.default.executeAll()).toEqual([EXPECTED_EXECUTION_RESULT]);
  });

  it("executeAll throws on error", async () => {
    mockExecuteAll.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.executeAll()).rejects.toBe("fail");
  });
});
