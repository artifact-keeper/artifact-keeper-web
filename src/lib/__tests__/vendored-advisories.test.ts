import { describe, it, expect } from "vitest";

import type {
  AdvisoryScan,
  ComponentAdvisory,
  VendoredComponent,
} from "@/types/package-analysis";
import {
  ADVISORY_GAP_EXPLANATION,
  ADVISORY_GAP_LABEL,
  advisoryGapFor,
  sortAdvisoriesBySeverity,
  summarizeVendoredAdvisories,
} from "@/lib/vendored-advisories";

const SCAN = (status: AdvisoryScan["status"]): AdvisoryScan => ({
  status,
  reason: null,
});

function advisory(id: string, severity: string): ComponentAdvisory {
  return { id, severity, summary: null, url: null };
}

function component(
  path: string,
  advisories: ComponentAdvisory[] | null,
  version: string | null = "1.0.0",
): VendoredComponent {
  return {
    name: path,
    version,
    source_url: null,
    confidence: "high",
    detection_method: null,
    path,
    purl: null,
    applied_patches: [],
    abi_version: null,
    soname: null,
    advisories,
  };
}

describe("sortAdvisoriesBySeverity", () => {
  it("orders most severe first", () => {
    const sorted = sortAdvisoriesBySeverity([
      advisory("C", "low"),
      advisory("B", "critical"),
      advisory("A", "medium"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["B", "A", "C"]);
  });

  it("sorts unknown severities after every known one, never above critical", () => {
    const sorted = sortAdvisoriesBySeverity([
      advisory("X", "catastrophic"),
      advisory("Y", "info"),
      advisory("Z", "critical"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["Z", "Y", "X"]);
  });

  it("is case-insensitive and stable by id within a severity", () => {
    const sorted = sortAdvisoriesBySeverity([
      advisory("CVE-2", "HIGH"),
      advisory("CVE-1", "high"),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["CVE-1", "CVE-2"]);
  });

  it("does not mutate its input", () => {
    const input = [advisory("C", "low"), advisory("B", "critical")];
    sortAdvisoriesBySeverity(input);
    expect(input.map((a) => a.id)).toEqual(["C", "B"]);
  });
});

describe("advisoryGapFor", () => {
  it("reports a version-less component as not-queried, whatever the scan says", () => {
    // It was never sent to a feed, so an outage does not make it a feed
    // failure — that would be wrong in the opposite direction.
    for (const scan of [SCAN("ok"), SCAN("partial"), SCAN("not_run"), null, undefined]) {
      expect(advisoryGapFor(null, scan)).toBe("no_version");
    }
  });

  it("reports a feed that was asked and did not answer as an outage", () => {
    expect(advisoryGapFor("1.2.4", SCAN("partial"))).toBe("feed_unavailable");
  });

  it("reports a scan that never ran as not-scanned", () => {
    expect(advisoryGapFor("1.2.4", SCAN("not_run"))).toBe("not_scanned");
  });

  it("falls back to `unknown` when the backend says nothing usable", () => {
    expect(advisoryGapFor("1.2.4", null)).toBe("unknown");
    expect(advisoryGapFor("1.2.4", undefined)).toBe("unknown");
    // "ok" too: the feeds answered for the package yet this component has no
    // answer. We cannot say why, so we do not guess.
    expect(advisoryGapFor("1.2.4", SCAN("ok"))).toBe("unknown");
  });

  it("only ever calls the outage an outage", () => {
    expect(ADVISORY_GAP_LABEL.feed_unavailable).toBe("Advisory feed unavailable");
    expect(ADVISORY_GAP_LABEL.no_version).toBe("Not queried");
    expect(ADVISORY_GAP_LABEL.not_scanned).toBe("Not queried");
    expect(ADVISORY_GAP_LABEL.unknown).toBe("Not queried");
  });

  it("keeps the protective sentence in every explanation", () => {
    for (const text of Object.values(ADVISORY_GAP_EXPLANATION)) {
      expect(text).toMatch(/This is not a clean result\./);
    }
  });
});

describe("summarizeVendoredAdvisories", () => {
  it("counts advisories, affected components and the worst severity", () => {
    const s = summarizeVendoredAdvisories([
      component("a", [advisory("CVE-1", "high"), advisory("CVE-2", "critical")]),
      component("b", [advisory("CVE-3", "low")]),
      component("c", []),
    ]);
    expect(s.total).toBe(3);
    expect(s.affectedComponents).toBe(2);
    expect(s.worst).toBe("critical");
    expect(s.bySeverity).toEqual({ critical: 1, high: 1, low: 1 });
    expect(s.notQueriedComponents).toBe(0);
  });

  it("counts `null` components as not-queried, never as clean", () => {
    const s = summarizeVendoredAdvisories([
      component("libwebp", null, null),
      component("libpng", []),
    ]);
    expect(s.notQueriedComponents).toBe(1);
    expect(s.affectedComponents).toBe(0);
    expect(s.total).toBe(0);
    expect(s.worst).toBeNull();
  });

  it("lowercases severity keys so mixed casing does not split a bucket", () => {
    const s = summarizeVendoredAdvisories([
      component("a", [advisory("CVE-1", "HIGH"), advisory("CVE-2", "high")]),
    ]);
    expect(s.bySeverity).toEqual({ high: 2 });
  });

  it("never lets an unknown severity win the worst slot over a known one", () => {
    const s = summarizeVendoredAdvisories([
      component("a", [advisory("X", "catastrophic"), advisory("Y", "medium")]),
    ]);
    expect(s.worst).toBe("medium");
  });


  it("splits not-queried components by cause", () => {
    const s = summarizeVendoredAdvisories(
      [
        component("libwebp.so.7", null, null),
        component("libjpeg.so.62", null, null),
        component("libpng", null),
        component("libz", []),
      ],
      SCAN("partial"),
    );
    expect(s.notQueriedComponents).toBe(3);
    expect(s.gaps).toEqual({
      no_version: 2,
      feed_unavailable: 1,
      not_scanned: 0,
      unknown: 0,
    });
  });

  it("grades a versioned component as not-scanned when no scan has run", () => {
    const s = summarizeVendoredAdvisories([component("libpng", null)], SCAN("not_run"));
    expect(s.gaps.not_scanned).toBe(1);
    expect(s.gaps.feed_unavailable).toBe(0);
  });

  it("grades everything `unknown` when the backend reports no advisory scan", () => {
    const s = summarizeVendoredAdvisories([component("libpng", null)]);
    expect(s.gaps.unknown).toBe(1);
    expect(s.gaps.feed_unavailable).toBe(0);
  });

  it("returns zeroes for an empty component list", () => {
    const s = summarizeVendoredAdvisories([]);
    expect(s).toEqual({
      total: 0,
      affectedComponents: 0,
      notQueriedComponents: 0,
      gaps: { no_version: 0, not_scanned: 0, feed_unavailable: 0, unknown: 0 },
      bySeverity: {},
      worst: null,
    });
  });
});
