import { describe, it, expect } from "vitest";
import { catalogItem, catalogPin } from "@/components/mcp/test-utils";
import {
  diffVersion,
  driftedPins,
  needsNameDecision,
  plural,
  requestNote,
  reviewVersion,
  typosquatNote,
  unresolvedNote,
} from "./mcp-review-format";

const DRIFT = { storedSha256: "aa", upstreamSha256: "bb", detectedAt: "2026-11-01T00:00:00Z" };

describe("mcp-review-format", () => {
  it("pluralises", () => {
    expect(plural(1, "version")).toBe("1 version");
    expect(plural(0, "version")).toBe("0 versions");
  });

  it("keeps only drifted pins awaiting a decision", () => {
    const item = catalogItem({
      status: "approved",
      pins: [
        catalogPin({ id: "p1", status: "review", contentDrift: DRIFT }),
        catalogPin({ id: "p2", status: "approved", contentDrift: DRIFT }),
        catalogPin({ id: "p3", status: "blocked", contentDrift: DRIFT }),
        catalogPin({ id: "p4", status: "pending", contentDrift: null }),
      ],
    });
    expect(driftedPins(item).map((p) => p.id)).toEqual(["p1"]);
    expect(driftedPins(catalogItem())).toEqual([]);
  });

  it.each([
    ["pending", true],
    ["review", true],
    ["approved", false],
    ["blocked", false],
  ])("needsNameDecision(%s) -> %s", (status, expected) => {
    expect(needsNameDecision(catalogItem({ status }))).toBe(expected);
  });

  it("picks the version to pin: latest, else the newest known, else none", () => {
    expect(reviewVersion(catalogItem())).toBe("1.2.0");
    expect(reviewVersion(catalogItem({ latestVersion: null }))).toBe("1.2.0");
    expect(reviewVersion(catalogItem({ latestVersion: null, versions: [] }))).toBeNull();
  });

  it("picks the ingested version to diff: latest when ingested, else the first", () => {
    const v = (version: string) => ({ version, artifactId: `a-${version}`, upstreamStatus: "active", unresolved: [] });
    expect(diffVersion(catalogItem({ ingested: [v("1.1.0"), v("1.2.0")] }))?.artifactId).toBe("a-1.2.0");
    expect(diffVersion(catalogItem({ ingested: [v("1.0.0"), v("1.1.0")] }))?.version).toBe("1.0.0");
    expect(diffVersion(catalogItem())).toBeNull();
  });

  it("notes a typosquat flag", () => {
    expect(typosquatNote(catalogItem({ flags: { typosquat: { similarTo: "io.github.acme/widget" } } }))).toBe(
      "Looks like io.github.acme/widget",
    );
    expect(typosquatNote(catalogItem())).toBeNull();
  });

  it("notes approval requests", () => {
    expect(requestNote(catalogItem())).toBeNull();
    expect(requestNote(catalogItem({ approvalRequests: { count: 0 } }))).toBeNull();
    expect(requestNote(catalogItem({ approvalRequests: { count: 1 } }))).toBe("Requested once");
    expect(requestNote(catalogItem({ approvalRequests: { count: 3, lastNote: "  release bot " } }))).toBe(
      "Requested 3 times: release bot",
    );
    expect(requestNote(catalogItem({ approvalRequests: { count: 2, lastNote: "   " } }))).toBe("Requested 2 times");
  });

  it("notes versions with unresolved packages", () => {
    const stuck = { version: "1.2.0", artifactId: "a", upstreamStatus: "active", unresolved: [{ index: 0, error: "x" }] };
    const ok = { version: "1.1.0", artifactId: "b", upstreamStatus: "active", unresolved: [] };
    expect(unresolvedNote(catalogItem({ ingested: [ok] }))).toBeNull();
    expect(unresolvedNote(catalogItem({ ingested: [stuck, ok] }))).toBe("1 version with unresolved packages (1.2.0)");
    expect(unresolvedNote(catalogItem({ ingested: [stuck, { ...stuck, version: "1.0.0" }] }))).toBe(
      "2 versions with unresolved packages (1.2.0, 1.0.0)",
    );
  });
});
