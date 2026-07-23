import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = { listRepoLabels: vi.fn(), addRepoLabel: vi.fn(), deleteRepoLabel: vi.fn() };
vi.mock("@artifact-keeper/sdk", () => ({
  listRepoLabels: (...a: unknown[]) => m.listRepoLabels(...a),
  addRepoLabel: (...a: unknown[]) => m.addRepoLabel(...a),
  deleteRepoLabel: (...a: unknown[]) => m.deleteRepoLabel(...a),
}));

import repoLabelsApi from "../repo-labels";

const LABEL = { id: "l1", key: "team", value: "platform", repository_id: "r1", created_at: "x" };

beforeEach(() => vi.clearAllMocks());

describe("repoLabelsApi", () => {
  it("list maps LabelsListResponse.items", async () => {
    m.listRepoLabels.mockResolvedValue({ data: { items: [LABEL], total: 1 }, error: undefined });
    const out = await repoLabelsApi.list("my-repo");
    expect(m.listRepoLabels).toHaveBeenCalledWith({ path: { key: "my-repo" } });
    expect(out).toEqual([{ id: "l1", key: "team", value: "platform", created_at: "x" }]);
  });

  it("list throws on error", async () => {
    m.listRepoLabels.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(repoLabelsApi.list("r")).rejects.toEqual({ status: 500 });
  });

  it("add sends key + label_key path and {value} body", async () => {
    m.addRepoLabel.mockResolvedValue({ data: LABEL, error: undefined });
    const out = await repoLabelsApi.add("my-repo", "team", "platform");
    expect(m.addRepoLabel).toHaveBeenCalledWith({ path: { key: "my-repo", label_key: "team" }, body: { value: "platform" } });
    expect(out.key).toBe("team");
  });

  it("add throws on error", async () => {
    m.addRepoLabel.mockResolvedValue({ data: undefined, error: { status: 400 } });
    await expect(repoLabelsApi.add("r", "k", "v")).rejects.toEqual({ status: 400 });
  });

  it("remove deletes by key and resolves void", async () => {
    m.deleteRepoLabel.mockResolvedValue({ error: undefined });
    await expect(repoLabelsApi.remove("my-repo", "team")).resolves.toBeUndefined();
    expect(m.deleteRepoLabel).toHaveBeenCalledWith({ path: { key: "my-repo", label_key: "team" } });
  });

  it("remove throws on error", async () => {
    m.deleteRepoLabel.mockResolvedValue({ error: { status: 404 } });
    await expect(repoLabelsApi.remove("r", "missing")).rejects.toEqual({ status: 404 });
  });
});
