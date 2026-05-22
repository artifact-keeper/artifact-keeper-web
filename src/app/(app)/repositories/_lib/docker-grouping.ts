import type { Artifact } from "@/types";

/**
 * Client-side Docker artifact grouping (issue #330).
 *
 * The backend does not yet aggregate Docker artifacts at the tag level, so
 * the frontend classifies the flat artifact list using Docker registry path
 * conventions:
 *
 *   - `<repo>/manifests/<tag>`            — manifest referenced by a tag
 *   - `<repo>/manifests/sha256:<digest>`  — manifest referenced by digest
 *   - `<repo>/blobs/sha256:<digest>`      — individual layer / config blob
 *
 * Tag rows are surfaced to users; manifest-by-digest entries and blobs are
 * stored separately so the UI can hide them by default but still allow drill-
 * down (e.g. "show layers" expansion).
 */

export interface DockerTagGroup {
  /** Stable key — `<image>:<tag>`. */
  key: string;
  /** Image path under the registry, e.g. `library/node`. */
  image: string;
  /** Tag portion, e.g. `14`, `latest`. */
  tag: string;
  /** The manifest artifact for this tag (the row we render). */
  manifest: Artifact;
  /**
   * Total size in bytes attributed to this tag.  Currently == the manifest
   * size, because the backend has no layer-aggregation support yet.  The
   * UI surfaces this caveat via tooltip.
   */
  size_bytes: number;
}

export interface DockerGroupingResult {
  /** One row per (image, tag) — the primary user-facing list. */
  tags: DockerTagGroup[];
  /** Manifests that exist only as digests (no tag pointer). */
  manifestsByDigest: Artifact[];
  /** Raw layer / config blobs. */
  blobs: Artifact[];
  /** Anything that didn't match a Docker registry path. */
  other: Artifact[];
}

const DIGEST_PREFIX = "sha256:";

interface ParsedDockerPath {
  kind: "manifest-tag" | "manifest-digest" | "blob";
  image: string;
  /** Tag or digest, depending on kind. */
  ref: string;
}

/**
 * Parse an artifact path into a Docker classification, or `null` if it
 * doesn't match the Docker registry layout.
 *
 * Examples:
 *   `library/node/manifests/14`                      -> manifest-tag, image=library/node, ref=14
 *   `library/node/manifests/sha256:abc...`           -> manifest-digest
 *   `library/node/blobs/sha256:abc...`               -> blob
 *   `something-else`                                 -> null
 */
export function parseDockerPath(path: string): ParsedDockerPath | null {
  if (!path) return null;
  // Look for `/manifests/` or `/blobs/` as the boundary.  Use lastIndexOf
  // so an image path like `nested/manifests-repo/manifests/foo` still works
  // (extremely unlikely, but cheap to handle).
  const mIdx = path.lastIndexOf("/manifests/");
  const bIdx = path.lastIndexOf("/blobs/");
  if (mIdx >= 0 && mIdx >= bIdx) {
    const image = path.slice(0, mIdx);
    const ref = path.slice(mIdx + "/manifests/".length);
    if (!image || !ref) return null;
    return {
      kind: ref.startsWith(DIGEST_PREFIX) ? "manifest-digest" : "manifest-tag",
      image,
      ref,
    };
  }
  if (bIdx >= 0) {
    const image = path.slice(0, bIdx);
    const ref = path.slice(bIdx + "/blobs/".length);
    if (!image || !ref) return null;
    return { kind: "blob", image, ref };
  }
  return null;
}

/**
 * Group a flat list of artifacts from a Docker repository into per-tag rows
 * plus the auxiliary buckets the UI may want to surface separately.
 *
 * If multiple artifacts somehow resolve to the same `<image>:<tag>` (e.g.
 * stale duplicates), the first one wins and the rest are dropped — Docker
 * tags are unique per registry, so this is defensive.
 */
export function groupDockerArtifacts(artifacts: Artifact[]): DockerGroupingResult {
  const tags = new Map<string, DockerTagGroup>();
  const manifestsByDigest: Artifact[] = [];
  const blobs: Artifact[] = [];
  const other: Artifact[] = [];

  for (const artifact of artifacts) {
    const parsed = parseDockerPath(artifact.path);
    if (!parsed) {
      other.push(artifact);
      continue;
    }
    if (parsed.kind === "manifest-tag") {
      const key = `${parsed.image}:${parsed.ref}`;
      if (!tags.has(key)) {
        tags.set(key, {
          key,
          image: parsed.image,
          tag: parsed.ref,
          manifest: artifact,
          size_bytes: artifact.size_bytes,
        });
      }
    } else if (parsed.kind === "manifest-digest") {
      manifestsByDigest.push(artifact);
    } else {
      blobs.push(artifact);
    }
  }

  // Stable, user-friendly order: image asc, then tag asc.
  const tagList = Array.from(tags.values()).sort((a, b) => {
    if (a.image !== b.image) return a.image.localeCompare(b.image);
    return a.tag.localeCompare(b.tag);
  });

  return { tags: tagList, manifestsByDigest, blobs, other };
}

/** Truncate a `sha256:abcdef…` digest to a short user-friendly form. */
export function truncateDigest(digest: string | undefined | null, head = 12): string {
  if (!digest) return "";
  if (digest.startsWith(DIGEST_PREFIX)) {
    return `${DIGEST_PREFIX}${digest.slice(DIGEST_PREFIX.length, DIGEST_PREFIX.length + head)}`;
  }
  return digest.length > head ? `${digest.slice(0, head)}…` : digest;
}
