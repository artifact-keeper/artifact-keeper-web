import { describe, it, expect } from "vitest";

import { truncateDigest } from "../docker-grouping";

// ---------------------------------------------------------------------------
// truncateDigest
//
// (The client-side grouping helpers that used to live alongside this were
// removed when the Docker grouped view moved to the server-side
// `?group_by=docker_tag` rollup — backend ak#1336.)
// ---------------------------------------------------------------------------

describe("truncateDigest", () => {
  it("returns empty string for null/undefined/empty input", () => {
    expect(truncateDigest(null)).toBe("");
    expect(truncateDigest(undefined)).toBe("");
    expect(truncateDigest("")).toBe("");
  });

  it("preserves the sha256: prefix and shows the first 12 chars by default", () => {
    expect(
      truncateDigest(
        "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      ),
    ).toBe("sha256:abcdef123456");
  });

  it("respects a custom head length", () => {
    expect(
      truncateDigest(
        "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        6,
      ),
    ).toBe("sha256:abcdef");
  });

  it("appends an ellipsis for non-sha256 long strings", () => {
    expect(truncateDigest("abcdef1234567890longvalue")).toBe("abcdef123456…");
  });

  it("returns the input unchanged for short non-sha256 values", () => {
    expect(truncateDigest("short")).toBe("short");
  });
});
