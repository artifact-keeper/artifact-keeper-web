import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isActivelyQuarantined,
  isQuarantineStateKnown,
  isQuarantineRejected,
  quarantineKnowledge,
  quarantineDownloadBlockedReason,
  formatQuarantineExpiry,
  QUARANTINE_HOLD_DOWNLOAD_REASON,
  QUARANTINE_REJECTED_DOWNLOAD_REASON,
} from "../quarantine";
import type { Artifact } from "@/types";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    repository_key: "maven-releases",
    path: "com/example/lib.jar",
    name: "lib.jar",
    size_bytes: 1024,
    checksum_sha256: "abc123",
    content_type: "application/java-archive",
    download_count: 42,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("quarantineKnowledge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The shipped contract (artifact-keeper#2966) always serializes
  // `quarantine_status` on artifact payloads; an absent status means the
  // response came from an older backend that never looked. The regression
  // behind #650: "the server did not look" and "the server looked and it is
  // fine" must stay distinguishable.
  it("reports unknown when quarantine_status is absent, not clear", () => {
    expect(quarantineKnowledge(makeArtifact())).toBe("unknown");
    expect(isQuarantineStateKnown(makeArtifact())).toBe(false);
  });

  it("reports clear for the explicit not_quarantined default", () => {
    const artifact = makeArtifact({ quarantine_status: "not_quarantined" });
    expect(quarantineKnowledge(artifact)).toBe("clear");
    expect(isQuarantineStateKnown(artifact)).toBe(true);
  });

  it("reports clear for the scan-lifecycle states", () => {
    for (const status of ["clean", "flagged", "unscanned", "released"]) {
      expect(quarantineKnowledge(makeArtifact({ quarantine_status: status }))).toBe("clear");
    }
  });

  it("does not treat an absent field as a clear one", () => {
    const absent = makeArtifact();
    const looked = makeArtifact({ quarantine_status: "not_quarantined" });
    // Both are "not blocked" ...
    expect(isActivelyQuarantined(absent)).toBe(false);
    expect(isActivelyQuarantined(looked)).toBe(false);
    // ... but only one of them is a statement about the artifact.
    expect(quarantineKnowledge(absent)).not.toBe(quarantineKnowledge(looked));
    expect(isQuarantineStateKnown(absent)).toBe(false);
    expect(isQuarantineStateKnown(looked)).toBe(true);
  });

  it("treats a null or empty status as unknown", () => {
    // The status endpoint serializes `quarantine_status: null` for an artifact
    // with no recorded state; that must not read as "the server looked and it
    // is fine" either.
    expect(quarantineKnowledge({ quarantine_status: null })).toBe("unknown");
    expect(quarantineKnowledge({ quarantine_status: "" })).toBe("unknown");
  });

  it("reports unknown for a missing source", () => {
    expect(quarantineKnowledge(null)).toBe("unknown");
    expect(quarantineKnowledge(undefined)).toBe("unknown");
  });

  it("reports blocked for a live hold", () => {
    expect(
      quarantineKnowledge(makeArtifact({ quarantine_status: "quarantined" })),
    ).toBe("blocked");
  });

  it("reports blocked for a rejection", () => {
    expect(
      quarantineKnowledge(makeArtifact({ quarantine_status: "rejected" })),
    ).toBe("blocked");
  });
});

describe("isActivelyQuarantined", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when quarantine_status is undefined", () => {
    expect(isActivelyQuarantined(makeArtifact())).toBe(false);
  });

  it("returns false for a clear status", () => {
    expect(
      isActivelyQuarantined(makeArtifact({ quarantine_status: "not_quarantined" })),
    ).toBe(false);
  });

  it("returns true for a hold with no expiry", () => {
    expect(
      isActivelyQuarantined(makeArtifact({ quarantine_status: "quarantined" })),
    ).toBe(true);
  });

  it("returns true for a hold with quarantine_until null", () => {
    const artifact = makeArtifact({
      quarantine_status: "quarantined",
      quarantine_until: null,
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns true when quarantine_until is in the future", () => {
    const artifact = makeArtifact({
      quarantine_status: "quarantined",
      quarantine_until: "2026-04-20T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns false when a timed hold has lapsed since the response was rendered", () => {
    // Same semantics as the backend's check_download_allowed: the row keeps
    // the "quarantined" label until the background job transitions it, but an
    // expired hold no longer blocks downloads.
    const artifact = makeArtifact({
      quarantine_status: "quarantined",
      quarantine_until: "2026-04-10T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(false);
  });

  it("stays blocked when quarantine_until is unparseable", () => {
    const artifact = makeArtifact({
      quarantine_status: "quarantined",
      quarantine_until: "not-a-date",
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("keeps a rejected artifact blocked (the backend clears quarantine_until on reject)", () => {
    const artifact = makeArtifact({
      quarantine_status: "rejected",
      quarantine_until: null,
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("ignores a stray quarantine_until on a clear status", () => {
    const artifact = makeArtifact({
      quarantine_status: "not_quarantined",
      quarantine_until: "2099-01-01T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(false);
  });
});

describe("isQuarantineRejected", () => {
  it("is true only for the rejected status", () => {
    expect(isQuarantineRejected({ quarantine_status: "rejected" })).toBe(true);
    expect(isQuarantineRejected({ quarantine_status: "quarantined" })).toBe(false);
    expect(isQuarantineRejected({})).toBe(false);
    expect(isQuarantineRejected(null)).toBe(false);
  });
});

describe("quarantineDownloadBlockedReason", () => {
  it("explains a live hold", () => {
    expect(quarantineDownloadBlockedReason({ quarantine_status: "quarantined" })).toBe(
      QUARANTINE_HOLD_DOWNLOAD_REASON,
    );
  });

  it("explains a rejection differently, since no admin action lifts it", () => {
    expect(quarantineDownloadBlockedReason({ quarantine_status: "rejected" })).toBe(
      QUARANTINE_REJECTED_DOWNLOAD_REASON,
    );
  });

  it("falls back to the hold wording when the status is absent", () => {
    expect(quarantineDownloadBlockedReason({})).toBe(
      QUARANTINE_HOLD_DOWNLOAD_REASON,
    );
  });
});

describe("formatQuarantineExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for null input", () => {
    expect(formatQuarantineExpiry(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatQuarantineExpiry(undefined)).toBeNull();
  });

  it("returns Expired for past dates", () => {
    expect(formatQuarantineExpiry("2026-04-10T00:00:00Z")).toBe("Expired");
  });

  it("returns minutes for short durations", () => {
    // 30 minutes in the future
    expect(formatQuarantineExpiry("2026-04-17T12:30:00Z")).toBe(
      "Expires in 30 minutes"
    );
  });

  it("returns singular minute", () => {
    expect(formatQuarantineExpiry("2026-04-17T12:01:30Z")).toBe(
      "Expires in 1 minute"
    );
  });

  it("returns hours for multi-hour durations", () => {
    expect(formatQuarantineExpiry("2026-04-17T15:00:00Z")).toBe(
      "Expires in 3 hours"
    );
  });

  it("returns singular hour", () => {
    expect(formatQuarantineExpiry("2026-04-17T13:30:00Z")).toBe(
      "Expires in 1 hour"
    );
  });

  it("returns days for multi-day durations under 14 days", () => {
    expect(formatQuarantineExpiry("2026-04-22T12:00:00Z")).toBe(
      "Expires in 5 days"
    );
  });

  it("returns singular day", () => {
    expect(formatQuarantineExpiry("2026-04-18T13:00:00Z")).toBe(
      "Expires in 1 day"
    );
  });

  it("returns formatted date for durations over 14 days", () => {
    const result = formatQuarantineExpiry("2026-06-15T12:00:00Z");
    expect(result).toMatch(/^Expires on /);
    expect(result).toContain("2026");
  });
});
