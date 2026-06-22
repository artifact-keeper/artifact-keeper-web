import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listChecks: vi.fn(),
  getCheck: vi.fn(),
  listCheckIssues: vi.fn(),
  triggerChecks: vi.fn(),
  suppressIssue: vi.fn(),
  unsuppressIssue: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listChecks: (...a: unknown[]) => m.listChecks(...a),
  getCheck: (...a: unknown[]) => m.getCheck(...a),
  listCheckIssues: (...a: unknown[]) => m.listCheckIssues(...a),
  triggerChecks: (...a: unknown[]) => m.triggerChecks(...a),
  suppressIssue: (...a: unknown[]) => m.suppressIssue(...a),
  unsuppressIssue: (...a: unknown[]) => m.unsuppressIssue(...a),
}));

import qualityChecksApi from "../quality-checks";

const CHECK = {
  id: "c1", artifact_id: "a1", repository_id: "r1", check_type: "metadata",
  passed: false, score: 70, issues_count: 2,
  critical_count: 1, high_count: 1, medium_count: 0, low_count: 0, info_count: 0,
  error_message: null, completed_at: "x", created_at: "y",
};
const ISSUE = {
  id: "i1", check_result_id: "c1", artifact_id: "a1", category: "naming", severity: "high",
  title: "Bad name", description: null, location: null, is_suppressed: false,
  suppressed_at: null, suppressed_by: null, suppressed_reason: null, created_at: "y",
};

beforeEach(() => vi.clearAllMocks());

describe("qualityChecksApi", () => {
  it("list passes query params and maps CheckResponse[]", async () => {
    m.listChecks.mockResolvedValue({ data: [CHECK], error: undefined });
    const out = await qualityChecksApi.list({ repository_id: "r1" });
    expect(m.listChecks).toHaveBeenCalledWith({ query: { repository_id: "r1" } });
    expect(out[0]).toMatchObject({ id: "c1", check_type: "metadata", passed: false, critical_count: 1 });
  });

  it("list throws on error", async () => {
    m.listChecks.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(qualityChecksApi.list()).rejects.toEqual({ status: 500 });
  });

  it("listIssues passes the check id and maps issues", async () => {
    m.listCheckIssues.mockResolvedValue({ data: [ISSUE], error: undefined });
    const out = await qualityChecksApi.listIssues("c1");
    expect(m.listCheckIssues).toHaveBeenCalledWith({ path: { id: "c1" } });
    expect(out[0]).toMatchObject({ id: "i1", severity: "high", is_suppressed: false });
  });

  it("get passes the check id", async () => {
    m.getCheck.mockResolvedValue({ data: CHECK, error: undefined });
    await qualityChecksApi.get("c1");
    expect(m.getCheck).toHaveBeenCalledWith({ path: { id: "c1" } });
  });

  it("trigger sends body and maps artifacts_queued -> queued", async () => {
    m.triggerChecks.mockResolvedValue({ data: { artifacts_queued: 5, message: "Queued 5" }, error: undefined });
    const out = await qualityChecksApi.trigger({ repository_id: "r1" });
    expect(m.triggerChecks).toHaveBeenCalledWith({ body: { repository_id: "r1" } });
    expect(out).toEqual({ queued: 5, message: "Queued 5" });
  });

  it("suppressIssue posts {reason}; unsuppressIssue deletes", async () => {
    m.suppressIssue.mockResolvedValue({ error: undefined });
    m.unsuppressIssue.mockResolvedValue({ error: undefined });
    await expect(qualityChecksApi.suppressIssue("i1", "false positive")).resolves.toBeUndefined();
    await expect(qualityChecksApi.unsuppressIssue("i1")).resolves.toBeUndefined();
    expect(m.suppressIssue).toHaveBeenCalledWith({ path: { id: "i1" }, body: { reason: "false positive" } });
    expect(m.unsuppressIssue).toHaveBeenCalledWith({ path: { id: "i1" } });
  });

  it("suppressIssue throws on error", async () => {
    m.suppressIssue.mockResolvedValue({ error: { status: 404 } });
    await expect(qualityChecksApi.suppressIssue("x", "r")).rejects.toEqual({ status: 404 });
  });

  it("trigger / listIssues / unsuppressIssue throw on error", async () => {
    m.triggerChecks.mockResolvedValue({ data: undefined, error: { status: 500 } });
    m.listCheckIssues.mockResolvedValue({ data: undefined, error: { status: 403 } });
    m.unsuppressIssue.mockResolvedValue({ error: { status: 404 } });
    await expect(qualityChecksApi.trigger()).rejects.toEqual({ status: 500 });
    await expect(qualityChecksApi.listIssues("c1")).rejects.toEqual({ status: 403 });
    await expect(qualityChecksApi.unsuppressIssue("i1")).rejects.toEqual({ status: 404 });
  });
});
