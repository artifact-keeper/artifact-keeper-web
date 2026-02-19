import { describe, it, expect } from "vitest";
import { cn, formatBytes, formatDate, formatNumber, REPO_TYPE_COLORS } from "../utils";

describe("formatBytes", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes below 1 KB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
  });

  it("trims trailing zeros in decimal part", () => {
    // 2048 bytes = 2.00 KB, should display as "2 KB"
    expect(formatBytes(2048)).toBe("2 KB");
  });

  it("handles large byte counts with decimal precision", () => {
    // 1.23 MB
    expect(formatBytes(1289748)).toBe("1.23 MB");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string", () => {
    // Use a fixed date to avoid timezone issues in the en-US short format
    const result = formatDate("2024-06-15T12:00:00Z");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats another date correctly", () => {
    // Use midday UTC to avoid timezone-boundary shifts
    const result = formatDate("2023-01-15T12:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("2023");
  });

  it("handles date-only strings", () => {
    const result = formatDate("2025-12-25");
    expect(result).toContain("Dec");
    expect(result).toContain("2025");
  });
});

describe("formatNumber", () => {
  it("returns small numbers as-is", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1000)).toBe("1.0K");
    expect(formatNumber(1500)).toBe("1.5K");
    expect(formatNumber(10000)).toBe("10.0K");
    expect(formatNumber(999999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(1000000)).toBe("1.0M");
    expect(formatNumber(2500000)).toBe("2.5M");
    expect(formatNumber(1000000000)).toBe("1000.0M");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles falsy values by omitting them", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts by keeping the last one", () => {
    // tailwind-merge should resolve p-4 vs p-2 to p-2 (last wins)
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("resolves conflicting text colors", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("preserves non-conflicting classes", () => {
    expect(cn("p-4", "m-2", "text-red-500")).toBe("p-4 m-2 text-red-500");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("handles empty string input", () => {
    expect(cn("")).toBe("");
  });

  it("handles array inputs via clsx", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("REPO_TYPE_COLORS", () => {
  it("has local, remote, and virtual keys", () => {
    expect(REPO_TYPE_COLORS).toHaveProperty("local");
    expect(REPO_TYPE_COLORS).toHaveProperty("remote");
    expect(REPO_TYPE_COLORS).toHaveProperty("virtual");
  });

  it("each value is a non-empty string of Tailwind classes", () => {
    for (const key of ["local", "remote", "virtual"]) {
      const value = REPO_TYPE_COLORS[key];
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      // Should contain at least bg- and text- classes
      expect(value).toMatch(/bg-/);
      expect(value).toMatch(/text-/);
    }
  });
});
