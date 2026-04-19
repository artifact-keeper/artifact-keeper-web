import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isActivelyQuarantined, formatQuarantineExpiry } from "../quarantine";
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

describe("isActivelyQuarantined", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when is_quarantined is undefined", () => {
    const artifact = makeArtifact();
    expect(isActivelyQuarantined(artifact)).toBe(false);
  });

  it("returns false when is_quarantined is false", () => {
    const artifact = makeArtifact({ is_quarantined: false });
    expect(isActivelyQuarantined(artifact)).toBe(false);
  });

  it("returns true when is_quarantined is true with no expiry", () => {
    const artifact = makeArtifact({ is_quarantined: true });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns true when is_quarantined is true and quarantine_until is null", () => {
    const artifact = makeArtifact({
      is_quarantined: true,
      quarantine_until: null,
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns true when quarantine_until is in the future", () => {
    const artifact = makeArtifact({
      is_quarantined: true,
      quarantine_until: "2026-04-20T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(true);
  });

  it("returns false when quarantine_until is in the past", () => {
    const artifact = makeArtifact({
      is_quarantined: true,
      quarantine_until: "2026-04-10T00:00:00Z",
    });
    expect(isActivelyQuarantined(artifact)).toBe(false);
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
