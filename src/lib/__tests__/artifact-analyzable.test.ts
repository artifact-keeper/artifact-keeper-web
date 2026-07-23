import { describe, it, expect } from "vitest";

import {
  ANALYZABLE_DISABLED_REASON,
  isArtifactAnalyzable,
} from "@/lib/artifact-analyzable";
import type { Artifact } from "@/types";

// Minimal artifact factory — only `analyzable` matters for these tests.
function art(analyzable?: boolean): Pick<Artifact, "analyzable"> {
  return { analyzable };
}

describe("isArtifactAnalyzable (artifact-keeper#2292)", () => {
  it("returns false only for an explicit analyzable: false (proxy-cached remote)", () => {
    expect(isArtifactAnalyzable(art(false))).toBe(false);
  });

  it("returns true when analyzable is explicitly true (hosted artifact)", () => {
    expect(isArtifactAnalyzable(art(true))).toBe(true);
  });

  it("defaults to true when the field is absent (older / pre-upgrade responses)", () => {
    expect(isArtifactAnalyzable(art(undefined))).toBe(true);
    expect(isArtifactAnalyzable({})).toBe(true);
  });

  it("treats null / undefined artifacts as analyzable (safe default)", () => {
    expect(isArtifactAnalyzable(null)).toBe(true);
    expect(isArtifactAnalyzable(undefined)).toBe(true);
  });

  it("exposes a user-facing disabled reason mentioning proxy-cached remote artifacts", () => {
    expect(ANALYZABLE_DISABLED_REASON).toMatch(/proxy-cached remote/i);
  });
});
