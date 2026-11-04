import { describe, it, expect } from "vitest";
import type { McpReview, McpServerJson } from "@/types/mcp";
import { lintCounts, lintSummary, reviewRisk, reviewVersion, toolDiffSummary } from "./mcp-review-format";

const SERVER = { name: "a/b", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://x" }] } as McpServerJson;
const base: McpReview = { id: "1", name: "a/b", status: "pending" };

describe("mcp-review-format", () => {
  it("counts lint findings by action", () => {
    expect(lintCounts(undefined)).toEqual({ block: 0, review: 0 });
    expect(lintCounts([{ rule: "x", action: "block" }, { rule: "y" }])).toEqual({ block: 1, review: 1 });
    expect(lintSummary([])).toBeNull();
    expect(lintSummary([{ rule: "x", action: "block" }])).toBe("1 blocking");
    expect(lintSummary([{ rule: "y", action: "review" }])).toBe("1 to review");
  });

  it("summarises a tool diff", () => {
    expect(toolDiffSummary(null)).toBeNull();
    expect(toolDiffSummary({ added: [], removed: [], changed: [] })).toBeNull();
    expect(toolDiffSummary({ added: ["a"], removed: ["b", "c"], changed: [] })).toBe("Tools: +1 added, -2 removed");
  });

  it("picks the pinned version, else the upstream latest", () => {
    expect(reviewVersion(base)).toBeNull();
    expect(reviewVersion({ ...base, server: SERVER })).toBe("1.0.0");
    expect(reviewVersion({ ...base, version: "0.9.0", server: SERVER })).toBe("0.9.0");
  });

  it("rates risk from the document and counts a tool diff as drift", () => {
    expect(reviewRisk(base)).toBeNull();
    const plain = reviewRisk({ ...base, server: SERVER });
    expect(plain?.level).toBe("low");
    const drift = reviewRisk({ ...base, server: SERVER, tool_diff: { added: ["x"], removed: [], changed: [] } });
    expect(drift!.score).toBeGreaterThan(plain!.score);
  });
});
