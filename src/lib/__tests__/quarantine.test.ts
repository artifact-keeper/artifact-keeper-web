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

  // The regression behind #650: the backend omits all four quarantine keys on
  // surfaces that never load quarantine state, so "the server did not look"
  // and "the server looked and it is fine" must stay distinguishable.
  it("reports unknown when is_blocked is absent, not clear", () => {
    expect(quarantineKnowledge(makeArtifact())).toBe("unknown");
    expect(isQuarantineStateKnown(makeArtifact())).toBe(false);
  });

  it("reports clear when is_blocked is explicitly false", () => {
    const artifact = makeArtifact({ is_blocked: false });
    expect(quarantineKnowledge(artifact)).toBe("clear");
    expect(isQuarantineStateKnown(artifact)).toBe(true);
  });

  it("does not treat an absent field as a false one", () => {
    const absent = makeArtifact();
    const looked = makeArtifact({ is_blocked: false });
    // Both are "not blocked" ...
    expect(isActivelyQuarantined(absent)).toBe(false);
    expect(isActivelyQuarantined(looked)).toBe(false);
    // ... but only one of them is a statement about the artifact.
    expect(quarantineKnowledge(absent)).not.toBe(quarantineKnowledge(looked));
    expect(isQuarantineStateKnown(absent)).toBe(false);
    expect(isQuarantineStateKnown(looked)).toBe(true);
  });

  it("treats a null is_blocked as unknown", () => {
    // The contract omits the key rather than nulling it, but a deployment that
    // sends null must not read as "the server looked and it is fine".
    expect(quarantineKnowledge({ is_blocked: null })).toBe("unknown");
  });

  it("reports unknown for a missing source", () => {
    expect(quarantineKnowledge(null)).toBe("unknown");
    expect(quarantineKnowledge(undefined)).toBe("unknown");
  });

  it("reports unknown when a status is present but the verdict is not", () => {
    // Cannot happen under the contract (the four fields travel together), but
    // a status without the verdict must not silently read as downloadable.
    expect(quarantineKnowledge({ quarantine_status: "quarantined" })).toBe("unknown");
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

  it("returns false when is_blocked is undefined", () => {
    expect(isActivelyQuarantined(makeArtifact())).toBe(false);
  });

  it("returns false when is_blocked is false", () => {
    expect(isActivelyQuarantined(makeArtifact({ is_blocked: false }))).toBe(false);
  });

  it("returns true when is_blocked is true with no expiry", () => {
    expect(isActivelyQuarantined(makeArtifact({ is_blocked: true }))).toBe(true);
  });

  it("returns true when is_blocked is true and quarantine_until is null", () => {
    const artifact = makeArtifact({
      is_blocked: true,
      quarantine_until: null,
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns true when quarantine_until is in the future", () => {
    const artifact = makeArtifact({
      is_blocked: true,
      quarantine_until: "2026-04-20T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns false when quarantine_until has passed since the response was rendered", () => {
    const artifact = makeArtifact({
      is_blocked: true,
      quarantine_until: "2026-04-10T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(false);
  });

  it("stays blocked when quarantine_until is unparseable", () => {
    const artifact = makeArtifact({
      is_blocked: true,
      quarantine_until: "not-a-date",
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("keeps a rejected artifact blocked (the backend clears quarantine_until on reject)", () => {
    const artifact = makeArtifact({
      is_blocked: true,
      quarantine_status: "rejected",
      quarantine_until: null,
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
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
    expect(quarantineDownloadBlockedReason({ is_blocked: true })).toBe(
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
