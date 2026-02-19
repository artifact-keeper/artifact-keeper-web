import { describe, it, expect } from "vitest";
import {
  aggregateHistories,
  riskScoreColor,
  riskScoreBgColor,
  SEVERITY_COLORS,
} from "../dt-utils";
import type { DtProjectMetrics } from "@/types/dependency-track";

function makeMetrics(
  overrides: Partial<DtProjectMetrics> & { lastOccurrence: number | null }
): DtProjectMetrics {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unassigned: 0,
    vulnerabilities: null,
    findingsTotal: 0,
    findingsAudited: 0,
    findingsUnaudited: 0,
    suppressions: 0,
    inheritedRiskScore: 0,
    policyViolationsFail: 0,
    policyViolationsWarn: 0,
    policyViolationsInfo: 0,
    policyViolationsTotal: 0,
    firstOccurrence: null,
    ...overrides,
  };
}

describe("aggregateHistories", () => {
  it("returns empty array for empty input (plain object)", () => {
    expect(aggregateHistories({})).toEqual([]);
  });

  it("returns empty array for empty Map", () => {
    expect(aggregateHistories(new Map())).toEqual([]);
  });

  it("skips metrics with null lastOccurrence", () => {
    const input = {
      projectA: [makeMetrics({ lastOccurrence: null, critical: 5 })],
    };
    expect(aggregateHistories(input)).toEqual([]);
  });

  it("aggregates a single project with one metric", () => {
    const ts = Date.UTC(2024, 0, 15, 12, 30);
    const result = aggregateHistories({
      projectA: [
        makeMetrics({ lastOccurrence: ts, critical: 2, high: 3, medium: 1, low: 5 }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "Jan 15", critical: 2, high: 3, medium: 1, low: 5 });
  });

  it("sums metrics from multiple projects on the same day", () => {
    const day = Date.UTC(2024, 5, 10, 8, 0);
    const dayLater = Date.UTC(2024, 5, 10, 20, 0);

    const result = aggregateHistories({
      projectA: [makeMetrics({ lastOccurrence: day, critical: 1, high: 2, medium: 3, low: 4 })],
      projectB: [makeMetrics({ lastOccurrence: dayLater, critical: 10, high: 20, medium: 30, low: 40 })],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "Jun 10", critical: 11, high: 22, medium: 33, low: 44 });
  });

  it("returns sorted results across multiple days", () => {
    const result = aggregateHistories({
      projectA: [
        makeMetrics({ lastOccurrence: Date.UTC(2024, 2, 5, 10, 0), critical: 1 }),
        makeMetrics({ lastOccurrence: Date.UTC(2024, 0, 20, 10, 0), critical: 2 }),
        makeMetrics({ lastOccurrence: Date.UTC(2024, 11, 25, 10, 0), critical: 3 }),
      ],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.date)).toEqual(["Jan 20", "Mar 5", "Dec 25"]);
    expect(result.map((r) => r.critical)).toEqual([2, 1, 3]);
  });

  it("works with Map input", () => {
    const input = new Map<string, DtProjectMetrics[]>();
    input.set("project1", [makeMetrics({ lastOccurrence: Date.UTC(2024, 3, 1, 6, 0), critical: 5, high: 10 })]);

    const result = aggregateHistories(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "Apr 1", critical: 5, high: 10 });
  });

  it("aggregates multiple metrics within the same project on the same day", () => {
    const result = aggregateHistories({
      projectA: [
        makeMetrics({ lastOccurrence: Date.UTC(2024, 6, 4, 6, 0), critical: 1, high: 1 }),
        makeMetrics({ lastOccurrence: Date.UTC(2024, 6, 4, 22, 0), critical: 2, high: 3 }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "Jul 4", critical: 3, high: 4 });
  });

  it("each result point has a dateMs field for sorting", () => {
    const ts = Date.UTC(2024, 0, 1);
    const result = aggregateHistories({ p: [makeMetrics({ lastOccurrence: ts, critical: 1 })] });
    expect(result[0].dateMs).toBe(ts);
  });
});

// Shared score-to-color boundary tests for both text and background variants
const SCORE_RANGES: [string, number[], string, string][] = [
  ["green (0-9)", [0, 5, 9], "text-green-500", "bg-green-500"],
  ["amber (10-39)", [10, 25, 39], "text-amber-500", "bg-amber-500"],
  ["orange (40-69)", [40, 50, 69], "text-orange-500", "bg-orange-500"],
  ["red (70+)", [70, 80, 100], "text-red-500", "bg-red-500"],
];

describe("riskScoreColor and riskScoreBgColor", () => {
  it.each(SCORE_RANGES)(
    "returns %s for scores in range",
    (_label, scores, expectedText, expectedBg) => {
      for (const score of scores) {
        expect(riskScoreColor(score)).toBe(expectedText);
        expect(riskScoreBgColor(score)).toBe(expectedBg);
      }
    }
  );
});

describe("SEVERITY_COLORS", () => {
  const severities = ["critical", "high", "medium", "low"] as const;

  it("has all severity keys with text, bg, and hex properties", () => {
    for (const severity of severities) {
      const colors = SEVERITY_COLORS[severity];
      expect(colors.text).toMatch(/^text-/);
      expect(colors.bg).toMatch(/^bg-/);
      expect(colors.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has expected hex color values", () => {
    expect(SEVERITY_COLORS.critical.hex).toBe("#ef4444");
    expect(SEVERITY_COLORS.high.hex).toBe("#f97316");
    expect(SEVERITY_COLORS.medium.hex).toBe("#f59e0b");
    expect(SEVERITY_COLORS.low.hex).toBe("#3b82f6");
  });
});
