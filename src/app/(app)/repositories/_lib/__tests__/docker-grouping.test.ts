import { describe, it, expect } from "vitest";

import {
  groupDockerArtifacts,
  parseDockerPath,
  truncateDigest,
} from "../docker-grouping";
import type { Artifact } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function art(overrides: Partial<Artifact> & Pick<Artifact, "path">): Artifact {
  return {
    id: overrides.path,
    repository_key: "docker-hub",
    path: overrides.path,
    name: overrides.path.split("/").pop() ?? overrides.path,
    size_bytes: 1024,
    checksum_sha256: "",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseDockerPath
// ---------------------------------------------------------------------------

describe("parseDockerPath", () => {
  it("parses a tag-referenced manifest", () => {
    expect(parseDockerPath("library/node/manifests/14")).toEqual({
      kind: "manifest-tag",
      image: "library/node",
      ref: "14",
    });
  });

  it("parses a digest-referenced manifest", () => {
    expect(
      parseDockerPath(
        "library/node/manifests/sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      ),
    ).toEqual({
      kind: "manifest-digest",
      image: "library/node",
      ref: "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });
  });

  it("parses a blob path", () => {
    expect(
      parseDockerPath(
        "library/node/blobs/sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      ),
    ).toEqual({
      kind: "blob",
      image: "library/node",
      ref: "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });
  });

  it("returns null for non-Docker paths", () => {
    expect(parseDockerPath("just-a-file.txt")).toBeNull();
    expect(parseDockerPath("foo/bar/baz")).toBeNull();
  });

  it("returns null for empty path", () => {
    expect(parseDockerPath("")).toBeNull();
  });

  it("returns null for `/manifests/` with empty image or ref", () => {
    expect(parseDockerPath("/manifests/14")).toBeNull();
    expect(parseDockerPath("foo/manifests/")).toBeNull();
  });

  it("uses the LAST `/manifests/` boundary so nested image names work", () => {
    expect(
      parseDockerPath("nested/manifests-repo/manifests/v1"),
    ).toEqual({
      kind: "manifest-tag",
      image: "nested/manifests-repo",
      ref: "v1",
    });
  });

  it("classifies tag vs digest by the sha256: prefix", () => {
    expect(parseDockerPath("img/manifests/sha256:abc")?.kind).toBe(
      "manifest-digest",
    );
    expect(parseDockerPath("img/manifests/sha2562:abc")?.kind).toBe(
      "manifest-tag",
    );
  });
});

// ---------------------------------------------------------------------------
// groupDockerArtifacts
// ---------------------------------------------------------------------------

describe("groupDockerArtifacts", () => {
  it("groups tag manifests into the `tags` bucket and exposes the manifest", () => {
    const tagManifest = art({
      path: "library/node/manifests/14",
      size_bytes: 2048,
    });
    const result = groupDockerArtifacts([tagManifest]);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({
      key: "library/node:14",
      image: "library/node",
      tag: "14",
      manifest: tagManifest,
      size_bytes: 2048,
    });
  });

  it("places digest-only manifests in the `manifestsByDigest` bucket", () => {
    const digestManifest = art({
      path: "library/node/manifests/sha256:abc",
    });
    const result = groupDockerArtifacts([digestManifest]);
    expect(result.tags).toHaveLength(0);
    expect(result.manifestsByDigest).toEqual([digestManifest]);
    expect(result.blobs).toHaveLength(0);
  });

  it("places blob paths in the `blobs` bucket", () => {
    const blob = art({ path: "library/node/blobs/sha256:abc" });
    const result = groupDockerArtifacts([blob]);
    expect(result.blobs).toEqual([blob]);
    expect(result.tags).toHaveLength(0);
  });

  it("places non-Docker paths in `other`", () => {
    const stranger = art({ path: "weird-thing.txt" });
    const result = groupDockerArtifacts([stranger]);
    expect(result.other).toEqual([stranger]);
  });

  it("hides blobs and digest-only manifests from the tag list", () => {
    const tag = art({ path: "library/node/manifests/14" });
    const blob = art({ path: "library/node/blobs/sha256:b" });
    const dgst = art({ path: "library/node/manifests/sha256:m" });
    const result = groupDockerArtifacts([blob, dgst, tag]);

    expect(result.tags.map((t) => t.key)).toEqual(["library/node:14"]);
    expect(result.blobs).toContain(blob);
    expect(result.manifestsByDigest).toContain(dgst);
  });

  it("dedupes duplicate tags — first artifact wins", () => {
    const first = art({ path: "library/node/manifests/14", id: "first" });
    const dup = art({ path: "library/node/manifests/14", id: "dup" });
    const result = groupDockerArtifacts([first, dup]);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].manifest.id).toBe("first");
  });

  it("sorts tags by image then tag", () => {
    const result = groupDockerArtifacts([
      art({ path: "z-app/manifests/v2" }),
      art({ path: "z-app/manifests/v1" }),
      art({ path: "a-app/manifests/v1" }),
    ]);
    expect(result.tags.map((t) => t.key)).toEqual([
      "a-app:v1",
      "z-app:v1",
      "z-app:v2",
    ]);
  });

  it("handles an empty input", () => {
    const result = groupDockerArtifacts([]);
    expect(result).toEqual({
      tags: [],
      manifestsByDigest: [],
      blobs: [],
      other: [],
    });
  });
});

// ---------------------------------------------------------------------------
// truncateDigest
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
