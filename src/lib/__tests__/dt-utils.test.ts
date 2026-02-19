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
    // Jan 15, 2024 12:30 UTC
    const ts = Date.UTC(2024, 0, 15, 12, 30);
    const input = {
      projectA: [
        makeMetrics({ lastOccurrence: ts, critical: 2, high: 3, medium: 1, low: 5 }),
      ],
    };

    const result = aggregateHistories(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("Jan 15");
    expect(result[0].critical).toBe(2);
    expect(result[0].high).toBe(3);
    expect(result[0].medium).toBe(1);
    expect(result[0].low).toBe(5);
  });

  it("sums metrics from multiple projects on the same day", () => {
    const day = Date.UTC(2024, 5, 10, 8, 0);
    const daySameButDifferentHour = Date.UTC(2024, 5, 10, 20, 0);

    const input = {
      projectA: [
        makeMetrics({ lastOccurrence: day, critical: 1, high: 2, medium: 3, low: 4 }),
      ],
      projectB: [
        makeMetrics({
          lastOccurrence: daySameButDifferentHour,
          critical: 10,
          high: 20,
          medium: 30,
          low: 40,
        }),
      ],
    };

    const result = aggregateHistories(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("Jun 10");
    expect(result[0].critical).toBe(11);
    expect(result[0].high).toBe(22);
    expect(result[0].medium).toBe(33);
    expect(result[0].low).toBe(44);
  });

  it("returns sorted results across multiple days", () => {
    const day1 = Date.UTC(2024, 2, 5, 10, 0); // Mar 5
    const day2 = Date.UTC(2024, 0, 20, 10, 0); // Jan 20
    const day3 = Date.UTC(2024, 11, 25, 10, 0); // Dec 25

    const input = {
      projectA: [
        makeMetrics({ lastOccurrence: day1, critical: 1 }),
        makeMetrics({ lastOccurrence: day2, critical: 2 }),
        makeMetrics({ lastOccurrence: day3, critical: 3 }),
      ],
    };

    const result = aggregateHistories(input);
    expect(result).toHaveLength(3);
    // Should be sorted ascending by date
    expect(result[0].date).toBe("Jan 20");
    expect(result[0].critical).toBe(2);
    expect(result[1].date).toBe("Mar 5");
    expect(result[1].critical).toBe(1);
    expect(result[2].date).toBe("Dec 25");
    expect(result[2].critical).toBe(3);
  });

  it("works with Map input", () => {
    const ts = Date.UTC(2024, 3, 1, 6, 0); // Apr 1
    const input = new Map<string, DtProjectMetrics[]>();
    input.set("project1", [
      makeMetrics({ lastOccurrence: ts, critical: 5, high: 10 }),
    ]);

    const result = aggregateHistories(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("Apr 1");
    expect(result[0].critical).toBe(5);
    expect(result[0].high).toBe(10);
  });

  it("aggregates multiple metrics within the same project on the same day", () => {
    const morning = Date.UTC(2024, 6, 4, 6, 0);
    const evening = Date.UTC(2024, 6, 4, 22, 0);

    const input = {
      projectA: [
        makeMetrics({ lastOccurrence: morning, critical: 1, high: 1 }),
        makeMetrics({ lastOccurrence: evening, critical: 2, high: 3 }),
      ],
    };

    const result = aggregateHistories(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("Jul 4");
    expect(result[0].critical).toBe(3);
    expect(result[0].high).toBe(4);
  });

  it("each result point has a dateMs field for sorting", () => {
    const ts = Date.UTC(2024, 0, 1);
    const input = { p: [makeMetrics({ lastOccurrence: ts, critical: 1 })] };

    const result = aggregateHistories(input);
    expect(result[0].dateMs).toBe(Date.UTC(2024, 0, 1));
  });
});

describe("riskScoreColor", () => {
  it("returns green for low scores (below 10)", () => {
    expect(riskScoreColor(0)).toBe("text-green-500");
    expect(riskScoreColor(5)).toBe("text-green-500");
    expect(riskScoreColor(9)).toBe("text-green-500");
  });

  it("returns amber for scores 10-39", () => {
    expect(riskScoreColor(10)).toBe("text-amber-500");
    expect(riskScoreColor(25)).toBe("text-amber-500");
    expect(riskScoreColor(39)).toBe("text-amber-500");
  });

  it("returns orange for scores 40-69", () => {
    expect(riskScoreColor(40)).toBe("text-orange-500");
    expect(riskScoreColor(50)).toBe("text-orange-500");
    expect(riskScoreColor(69)).toBe("text-orange-500");
  });

  it("returns red for scores 70+", () => {
    expect(riskScoreColor(70)).toBe("text-red-500");
    expect(riskScoreColor(80)).toBe("text-red-500");
    expect(riskScoreColor(100)).toBe("text-red-500");
  });
});

describe("riskScoreBgColor", () => {
  it("returns green background for low scores (below 10)", () => {
    expect(riskScoreBgColor(0)).toBe("bg-green-500");
    expect(riskScoreBgColor(9)).toBe("bg-green-500");
  });

  it("returns amber background for scores 10-39", () => {
    expect(riskScoreBgColor(10)).toBe("bg-amber-500");
    expect(riskScoreBgColor(39)).toBe("bg-amber-500");
  });

  it("returns orange background for scores 40-69", () => {
    expect(riskScoreBgColor(40)).toBe("bg-orange-500");
    expect(riskScoreBgColor(69)).toBe("bg-orange-500");
  });

  it("returns red background for scores 70+", () => {
    expect(riskScoreBgColor(70)).toBe("bg-red-500");
    expect(riskScoreBgColor(100)).toBe("bg-red-500");
  });
});

describe("SEVERITY_COLORS", () => {
  it("has critical, high, medium, and low keys", () => {
    expect(SEVERITY_COLORS).toHaveProperty("critical");
    expect(SEVERITY_COLORS).toHaveProperty("high");
    expect(SEVERITY_COLORS).toHaveProperty("medium");
    expect(SEVERITY_COLORS).toHaveProperty("low");
  });

  it("each severity has text, bg, and hex properties", () => {
    for (const severity of ["critical", "high", "medium", "low"] as const) {
      const colors = SEVERITY_COLORS[severity];
      expect(colors).toHaveProperty("text");
      expect(colors).toHaveProperty("bg");
      expect(colors).toHaveProperty("hex");
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
