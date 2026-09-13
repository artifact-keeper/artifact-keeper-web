import { describe, it, expect } from "vitest";

import { ApiError } from "@/lib/api/fetch";
import {
  PROXY_SCAN_SIGN_IN_COPY,
  classifyProxyScanError,
  describeProxyVerdict,
  describeUnresolvedPath,
  formatScannedDate,
  hasProxyScanSummary,
  resolveProxyScanListView,
  resolveProxyScanView,
  severityBuckets,
  showsInheritedVerdict,
} from "@/lib/proxy-scan";
import type {
  ProxyScanEnforcement,
  ProxyScanEntry,
} from "@/types/proxy-scans";

function entry(overrides: Partial<ProxyScanEntry> = {}): ProxyScanEntry {
  return {
    path: "left-pad/-/left-pad-1.3.0.tgz",
    state: "clean",
    reason: null,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    findings_count: 0,
    scanned_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

const ENFORCING: ProxyScanEnforcement = {
  scan_on_proxy: true,
  proxy_scan_action: "fail_closed",
};
const FAIL_OPEN: ProxyScanEnforcement = {
  scan_on_proxy: true,
  proxy_scan_action: "fail_open",
};
const NOT_SCANNING: ProxyScanEnforcement = {
  scan_on_proxy: false,
  proxy_scan_action: "fail_open",
};

describe("classifyProxyScanError", () => {
  it("maps 401 to the anonymous case", () => {
    expect(classifyProxyScanError(new ApiError(401, "unauthorized"))).toBe(
      "unauthenticated",
    );
  });

  it("maps 403 to forbidden, not to sign-in", () => {
    // A signed-in user without repository visibility is a different audience:
    // telling them to sign in is a dead end.
    expect(classifyProxyScanError(new ApiError(403, "forbidden"))).toBe(
      "forbidden",
    );
  });

  it("maps 404 to an unresolvable path", () => {
    expect(classifyProxyScanError(new ApiError(404, "not found"))).toBe(
      "unresolvable",
    );
  });

  it("maps anything else to a generic failure", () => {
    expect(classifyProxyScanError(new ApiError(500, "boom"))).toBe("error");
    expect(classifyProxyScanError(new TypeError("network"))).toBe("error");
    expect(classifyProxyScanError("not an error")).toBe("error");
  });
});

describe("resolveProxyScanView", () => {
  it("reports loading before an answer arrives", () => {
    expect(
      resolveProxyScanView({ isLoading: true, error: null, entry: undefined }),
    ).toEqual({ kind: "loading" });
  });

  it("never resolves a 401 into a verdict", () => {
    // The regression this whole feature exists to prevent: a failed fetch
    // treated as zero findings renders the green all-clear.
    const view = resolveProxyScanView({
      isLoading: false,
      error: new ApiError(401, ""),
      entry: undefined,
    });
    expect(view).toEqual({ kind: "failure", failure: "unauthenticated" });
  });

  it("renders a 404 as unresolved rather than as an error", () => {
    // A repository with zero catalog rows falls back to storage enumeration
    // for its listing, so a modal click there produces a path the
    // catalog-backed endpoint cannot resolve. That is an answer, not a fault.
    expect(
      resolveProxyScanView({
        isLoading: false,
        error: new ApiError(404, ""),
        entry: undefined,
      }),
    ).toEqual({ kind: "unresolved" });
  });

  it("renders a missing entry as unresolved, not clean", () => {
    expect(
      resolveProxyScanView({ isLoading: false, error: null, entry: null }),
    ).toEqual({ kind: "unresolved" });
  });

  it("prefers the error over a stale cached entry", () => {
    const view = resolveProxyScanView({
      isLoading: false,
      error: new ApiError(500, ""),
      entry: entry(),
    });
    expect(view).toEqual({ kind: "failure", failure: "error" });
  });

  it("returns the verdict when one is available", () => {
    const e = entry({ state: "vulnerable" });
    expect(
      resolveProxyScanView({ isLoading: false, error: null, entry: e }),
    ).toEqual({ kind: "verdict", entry: e });
  });
});

describe("formatScannedDate", () => {
  it("returns null for absent or unparseable timestamps", () => {
    expect(formatScannedDate(null)).toBeNull();
    expect(formatScannedDate(undefined)).toBeNull();
    expect(formatScannedDate("")).toBeNull();
    expect(formatScannedDate("not-a-date")).toBeNull();
  });

  it("renders at date granularity", () => {
    const formatted = formatScannedDate("2026-08-01T12:00:00Z");
    expect(formatted).toBe(new Date("2026-08-01T12:00:00Z").toLocaleDateString());
    expect(formatted).not.toMatch(/:/);
  });
});

describe("describeProxyVerdict — clean", () => {
  it("states when it was clean rather than guaranteeing it is clean now", () => {
    // A verdict inside the reuse window can still have been scanned against an
    // outdated vulnerability database (#3287).
    const copy = describeProxyVerdict(entry({ state: "clean" }), ENFORCING);
    expect(copy.tone).toBe("clean");
    expect(copy.headline).toMatch(/^Clean as of /);
    expect(copy.detail).toMatch(/database may have changed/i);
    expect(copy.headline).not.toMatch(/no vulnerabilities/i);
  });

  it("falls back when the verdict carries no timestamp", () => {
    const copy = describeProxyVerdict(
      entry({ state: "clean", scanned_at: null }),
      ENFORCING,
    );
    expect(copy.headline).toBe("Clean — no findings recorded");
  });
});

describe("describeProxyVerdict — vulnerable", () => {
  it("does not claim the download was blocked on a fail-open repository", () => {
    const copy = describeProxyVerdict(entry({ state: "vulnerable" }), FAIL_OPEN);
    expect(copy.tone).toBe("danger");
    expect(copy.detail).toMatch(/fail-open/);
    expect(copy.detail).toMatch(/may still be served/i);
    expect(copy.detail).not.toMatch(/blocked/i);
  });

  it("says downloads are withheld on a fail-closed scanning repository", () => {
    const copy = describeProxyVerdict(entry({ state: "vulnerable" }), ENFORCING);
    expect(copy.detail).toMatch(/withholds downloads/i);
  });

  it("says the verdict is not enforced when the repository does not scan", () => {
    // Verdicts are global by digest, so a non-scanning repository can display
    // one another repository recorded. It serves the artifact regardless.
    const copy = describeProxyVerdict(
      entry({ state: "vulnerable" }),
      NOT_SCANNING,
    );
    expect(copy.detail).toMatch(/not\s+enforced here/i);
    expect(copy.detail).toMatch(/served/i);
  });

  it("still renders a headline without a timestamp", () => {
    const copy = describeProxyVerdict(
      entry({ state: "vulnerable", scanned_at: null }),
      ENFORCING,
    );
    expect(copy.headline).toBe("Vulnerable — findings recorded");
    expect(copy.tone).toBe("danger");
  });
});

describe("describeProxyVerdict — not_scanned", () => {
  it("never reads as clean and never implies safety", () => {
    const copy = describeProxyVerdict(
      entry({ state: "not_scanned", reason: "unknown", scanned_at: null }),
      FAIL_OPEN,
    );
    expect(copy.tone).toBe("neutral");
    expect(copy.headline).toBe(
      "Not scanned — this artifact has no scan verdict on record",
    );
    expect(copy.detail).toMatch(/not evidence of safety/i);
    expect(copy.detail).toMatch(/may have been served unscanned/i);
  });

  it("only says scanning is disabled when that is the derived reason", () => {
    const disabled = describeProxyVerdict(
      entry({ state: "not_scanned", reason: "scanning_disabled", scanned_at: null }),
      NOT_SCANNING,
    );
    expect(disabled.headline).toMatch(/scanning is disabled/i);

    const unknown = describeProxyVerdict(
      entry({ state: "not_scanned", reason: "unknown", scanned_at: null }),
      ENFORCING,
    );
    expect(unknown.headline).not.toMatch(/scanning is disabled/i);
    // Fail-closed changes what "no verdict" implies about what the user got.
    expect(unknown.detail).toMatch(/may have been withheld/i);
  });
});

describe("describeUnresolvedPath", () => {
  it("renders as unknown and says so", () => {
    const copy = describeUnresolvedPath();
    expect(copy.tone).toBe("neutral");
    expect(copy.detail).toMatch(/Unknown is not clean/);
  });
});

describe("showsInheritedVerdict", () => {
  it("is false whenever the repository scans its own proxy downloads", () => {
    expect(showsInheritedVerdict("vulnerable", ENFORCING)).toBe(false);
    expect(showsInheritedVerdict("clean", FAIL_OPEN)).toBe(false);
  });

  it("is true when a non-scanning repository displays a verdict", () => {
    expect(showsInheritedVerdict("clean", NOT_SCANNING)).toBe(true);
    expect(showsInheritedVerdict("vulnerable", NOT_SCANNING)).toBe(true);
  });

  it("is false when there is no verdict to attribute", () => {
    expect(showsInheritedVerdict("not_scanned", NOT_SCANNING)).toBe(false);
    expect(showsInheritedVerdict(null, NOT_SCANNING)).toBe(false);
    expect(showsInheritedVerdict(undefined, NOT_SCANNING)).toBe(false);
  });
});

describe("severityBuckets", () => {
  it("drops empty buckets and keeps descending severity order", () => {
    const buckets = severityBuckets(
      entry({
        state: "vulnerable",
        critical_count: 2,
        high_count: 0,
        medium_count: 5,
        low_count: 1,
        findings_count: 8,
      }),
    );
    expect(buckets).toEqual([
      { key: "critical", count: 2 },
      { key: "medium", count: 5 },
      { key: "low", count: 1 },
    ]);
  });

  it("is empty for a clean verdict", () => {
    expect(severityBuckets(entry())).toEqual([]);
  });
});

describe("resolveProxyScanListView", () => {
  it("reads a 404 as 'not mounted here', not as a scan failure", () => {
    // On a single path a 404 means the catalog has no such row; on the
    // collection it means the endpoint is not mounted for this repository.
    expect(
      resolveProxyScanListView({ isLoading: false, error: new ApiError(404, "") }),
    ).toEqual({ kind: "unavailable" });
  });

  it("keeps the anonymous case distinct so the sign-in copy still renders", () => {
    expect(
      resolveProxyScanListView({ isLoading: false, error: new ApiError(401, "") }),
    ).toEqual({ kind: "failure", failure: "unauthenticated" });
  });

  it("is ready only once an answer has arrived", () => {
    expect(resolveProxyScanListView({ isLoading: true, error: null })).toEqual({
      kind: "loading",
    });
    expect(resolveProxyScanListView({ isLoading: false, error: null })).toEqual({
      kind: "ready",
    });
  });
});

describe("hasProxyScanSummary", () => {
  it("is true for Remote repositories in formats with proxy gate wiring", () => {
    expect(hasProxyScanSummary({ repo_type: "remote", format: "npm" })).toBe(true);
    expect(hasProxyScanSummary({ repo_type: "remote", format: "pypi" })).toBe(true);
  });

  it("is false for repositories that have no proxy cache", () => {
    expect(hasProxyScanSummary({ repo_type: "local", format: "npm" })).toBe(false);
    expect(hasProxyScanSummary({ repo_type: "virtual", format: "pypi" })).toBe(
      false,
    );
    expect(hasProxyScanSummary({ repo_type: "staging", format: "npm" })).toBe(
      false,
    );
  });

  it("is false for Remote repositories whose format has no gate", () => {
    // An always-empty proxy-cache panel is noise, and claiming coverage a
    // format does not have would be worse.
    expect(hasProxyScanSummary({ repo_type: "remote", format: "maven" })).toBe(
      false,
    );
    expect(hasProxyScanSummary({ repo_type: "remote", format: "docker" })).toBe(
      false,
    );
  });

  it("tolerates a repository that has not loaded yet", () => {
    expect(hasProxyScanSummary(null)).toBe(false);
    expect(hasProxyScanSummary(undefined)).toBe(false);
    expect(hasProxyScanSummary({})).toBe(false);
    expect(hasProxyScanSummary({ repo_type: "remote" })).toBe(false);
  });
});

describe("copy constants", () => {
  it("keeps the required anonymous string exact", () => {
    expect(PROXY_SCAN_SIGN_IN_COPY).toBe("Sign in to view scan status.");
  });
});
