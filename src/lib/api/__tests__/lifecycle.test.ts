import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("lifecycleApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns policies", async () => {
    const policies = [{ id: "p1" }];
    mockList.mockResolvedValue({ data: policies, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.list()).toEqual(policies);
  });

  it("list throws on error", async () => {
    mockList.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.list()).rejects.toBe("fail");
  });

  it("get returns a single policy", async () => {
    const policy = { id: "p1", name: "cleanup" };
    mockGet.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.get("p1")).toEqual(policy);
  });

  it("get throws on error", async () => {
    mockGet.mockResolvedValue({ data: undefined, error: "not found" });
    const mod = await import("../lifecycle");
    await expect(mod.default.get("p1")).rejects.toBe("not found");
  });

  it("create returns new policy", async () => {
    const policy = { id: "p2" };
    mockCreate.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.create({ name: "new" } as any)).toEqual(policy);
  });

  it("create throws on error", async () => {
    mockCreate.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.create({} as any)).rejects.toBe("fail");
  });

  it("update returns updated policy", async () => {
    const policy = { id: "p1", name: "updated" };
    mockUpdate.mockResolvedValue({ data: policy, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.update("p1", { name: "updated" } as any)).toEqual(policy);
  });

  it("update throws on error", async () => {
    mockUpdate.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.update("p1", {} as any)).rejects.toBe("fail");
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
    const result = { affected: 5 };
    mockExecute.mockResolvedValue({ data: result, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.execute("p1")).toEqual(result);
  });

  it("execute throws on error", async () => {
    mockExecute.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.execute("p1")).rejects.toBe("fail");
  });

  it("preview returns result", async () => {
    const result = { affected: 3 };
    mockPreview.mockResolvedValue({ data: result, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.preview("p1")).toEqual(result);
  });

  it("preview throws on error", async () => {
    mockPreview.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.preview("p1")).rejects.toBe("fail");
  });

  it("executeAll returns array of results", async () => {
    const results = [{ affected: 1 }];
    mockExecuteAll.mockResolvedValue({ data: results, error: undefined });
    const mod = await import("../lifecycle");
    expect(await mod.default.executeAll()).toEqual(results);
  });

  it("executeAll throws on error", async () => {
    mockExecuteAll.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../lifecycle");
    await expect(mod.default.executeAll()).rejects.toBe("fail");
  });
});
