import { describe, it, expect } from "vitest";
import { openSeverityBreakdown, OPEN_SEVERITY_COUNTS_HINT } from "../severity-counts";

// #4338: the artifact view counts the same thing the dashboards count. The
// fixture is the backend's CVE history for the reproduction in the issue
// after a rescan: CVE-2026-0001 no longer reported (fixed), CVE-2026-0002
// open, one acknowledged and one false-positive entry.
describe("openSeverityBreakdown", () => {
  it("counts only open entries, by their severity", () => {
    expect(
      openSeverityBreakdown([
        { severity: "critical", status: "fixed" },
        { severity: "critical", status: "open" },
        { severity: "HIGH", status: "open" },
        { severity: "high", status: "acknowledged" },
        { severity: "medium", status: "false_positive" },
        { severity: "low", status: "open" },
      ]),
    ).toEqual({ critical: 1, high: 1, medium: 0, low: 1 });
  });

  it("ignores entries without a countable severity", () => {
    expect(
      openSeverityBreakdown([
        { severity: null, status: "open" },
        { severity: "info", status: "open" },
      ]),
    ).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  it("names the definition the counts follow", () => {
    expect(OPEN_SEVERITY_COUNTS_HINT).toMatch(/latest scans/);
    expect(OPEN_SEVERITY_COUNTS_HINT).toMatch(/Acknowledged ones are counted separately/);
  });
});
