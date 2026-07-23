import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listRules: vi.fn(),
  getRule: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  evaluateRule: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listRules: (...a: unknown[]) => m.listRules(...a),
  getRule: (...a: unknown[]) => m.getRule(...a),
  createRule: (...a: unknown[]) => m.createRule(...a),
  updateRule: (...a: unknown[]) => m.updateRule(...a),
  deleteRule: (...a: unknown[]) => m.deleteRule(...a),
  evaluateRule: (...a: unknown[]) => m.evaluateRule(...a),
}));

import promotionRulesApi from "../promotion-rules";

const SDK = {
  id: "r1",
  name: "promote-stable",
  source_repo_id: "src",
  target_repo_id: "tgt",
  is_enabled: true,
  auto_promote: true,
  require_signature: false,
  allowed_licenses: null,
  max_cve_severity: "high",
  min_health_score: 80,
  min_staging_hours: null,
  max_artifact_age_days: null,
  created_at: "x",
  updated_at: "y",
};

beforeEach(() => vi.clearAllMocks());

describe("promotionRulesApi", () => {
  it("list maps PromotionRuleListResponse.items (nullish normalized)", async () => {
    m.listRules.mockResolvedValue({ data: { items: [SDK], total: 1 }, error: undefined });
    const out = await promotionRulesApi.list();
    expect(out[0]).toMatchObject({
      id: "r1",
      source_repo_id: "src",
      target_repo_id: "tgt",
      allowed_licenses: [], // null -> []
      min_staging_hours: null,
      max_cve_severity: "high",
    });
  });

  it("list throws on error", async () => {
    m.listRules.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(promotionRulesApi.list()).rejects.toEqual({ status: 500 });
  });

  it("create posts the body", async () => {
    m.createRule.mockResolvedValue({ data: SDK, error: undefined });
    await promotionRulesApi.create({ name: "x", source_repo_id: "s", target_repo_id: "t", auto_promote: true });
    expect(m.createRule).toHaveBeenCalledWith({ body: { name: "x", source_repo_id: "s", target_repo_id: "t", auto_promote: true } });
  });

  it("update sends id path + body (no source/target)", async () => {
    m.updateRule.mockResolvedValue({ data: SDK, error: undefined });
    await promotionRulesApi.update("r1", { auto_promote: false, max_cve_severity: "low" });
    expect(m.updateRule).toHaveBeenCalledWith({ path: { id: "r1" }, body: { auto_promote: false, max_cve_severity: "low" } });
  });

  it("get + remove pass the id path", async () => {
    m.getRule.mockResolvedValue({ data: SDK, error: undefined });
    m.deleteRule.mockResolvedValue({ error: undefined });
    await promotionRulesApi.get("r1");
    await expect(promotionRulesApi.remove("r1")).resolves.toBeUndefined();
    expect(m.getRule).toHaveBeenCalledWith({ path: { id: "r1" } });
    expect(m.deleteRule).toHaveBeenCalledWith({ path: { id: "r1" } });
  });

  it("evaluate maps BulkEvaluationResponse to a summary (total_artifacts -> total)", async () => {
    m.evaluateRule.mockResolvedValue({
      data: { rule_id: "r1", rule_name: "promote-stable", passed: 7, failed: 2, total_artifacts: 9, results: [] },
      error: undefined,
    });
    const out = await promotionRulesApi.evaluate("r1");
    expect(m.evaluateRule).toHaveBeenCalledWith({ path: { id: "r1" } });
    expect(out).toEqual({ rule_id: "r1", rule_name: "promote-stable", passed: 7, failed: 2, total: 9 });
  });

  it("evaluate throws on error", async () => {
    m.evaluateRule.mockResolvedValue({ data: undefined, error: { status: 404 } });
    await expect(promotionRulesApi.evaluate("x")).rejects.toEqual({ status: 404 });
  });
});
