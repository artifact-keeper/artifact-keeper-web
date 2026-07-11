import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listCurationPackages: vi.fn(),
  getCurationPackage: vi.fn(),
  approvePackage: vi.fn(),
  blockPackage: vi.fn(),
  bulkApprove: vi.fn(),
  bulkBlock: vi.fn(),
  reEvaluate: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listCurationPackages: (...a: unknown[]) => m.listCurationPackages(...a),
  getCurationPackage: (...a: unknown[]) => m.getCurationPackage(...a),
  approvePackage: (...a: unknown[]) => m.approvePackage(...a),
  blockPackage: (...a: unknown[]) => m.blockPackage(...a),
  bulkApprove: (...a: unknown[]) => m.bulkApprove(...a),
  bulkBlock: (...a: unknown[]) => m.bulkBlock(...a),
  reEvaluate: (...a: unknown[]) => m.reEvaluate(...a),
}));

import curationApi from "../curation";

const PKG = {
  id: "p1",
  package_name: "left-pad",
  version: "1.3.0",
  format: "npm",
  status: "pending",
  metadata: { curation_status: "pending" },
  staging_repo_id: "r1",
  remote_repo_id: "rm1",
  upstream_path: "left-pad/-/left-pad-1.3.0.tgz",
  first_seen_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("curationApi", () => {
  it("listPackages sends staging_repo_id + status and maps results", async () => {
    m.listCurationPackages.mockResolvedValue({ data: [PKG], error: undefined });
    const out = await curationApi.listPackages("r1", { status: "pending" });
    expect(m.listCurationPackages).toHaveBeenCalledWith({
      query: { staging_repo_id: "r1", status: "pending" },
    });
    expect(out[0]).toMatchObject({ id: "p1", name: "left-pad", status: "pending" });
  });

  it("listPackages throws on error", async () => {
    m.listCurationPackages.mockResolvedValue({ data: undefined, error: { status: 400 } });
    await expect(curationApi.listPackages("r1")).rejects.toEqual({ status: 400 });
  });

  it("getPackage / approve / block pass the id path param", async () => {
    m.getCurationPackage.mockResolvedValue({ data: PKG, error: undefined });
    m.approvePackage.mockResolvedValue({ data: PKG, error: undefined });
    m.blockPackage.mockResolvedValue({ data: PKG, error: undefined });
    await curationApi.getPackage("p1");
    await curationApi.approve("p1");
    await curationApi.block("p1");
    expect(m.getCurationPackage).toHaveBeenCalledWith({ path: { id: "p1" } });
    expect(m.approvePackage).toHaveBeenCalledWith({ path: { id: "p1" } });
    expect(m.blockPackage).toHaveBeenCalledWith({ path: { id: "p1" } });
  });

  it("bulkApprove / bulkBlock send {ids,reason} and return the count", async () => {
    m.bulkApprove.mockResolvedValue({ data: 3, error: undefined });
    m.bulkBlock.mockResolvedValue({ data: 2, error: undefined });
    expect(await curationApi.bulkApprove(["a", "b", "c"], "ok")).toBe(3);
    expect(await curationApi.bulkBlock(["a", "b"], "bad")).toBe(2);
    expect(m.bulkApprove).toHaveBeenCalledWith({ body: { ids: ["a", "b", "c"], reason: "ok" } });
    expect(m.bulkBlock).toHaveBeenCalledWith({ body: { ids: ["a", "b"], reason: "bad" } });
  });

  it("reEvaluate sends staging_repo_id + default_action and returns the count", async () => {
    m.reEvaluate.mockResolvedValue({ data: 7, error: undefined });
    expect(await curationApi.reEvaluate("r1", "block")).toBe(7);
    expect(m.reEvaluate).toHaveBeenCalledWith({
      body: { staging_repo_id: "r1", default_action: "block" },
    });
  });

  it("bulkApprove throws on error", async () => {
    m.bulkApprove.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(curationApi.bulkApprove(["a"], "x")).rejects.toEqual({ status: 500 });
  });
});
