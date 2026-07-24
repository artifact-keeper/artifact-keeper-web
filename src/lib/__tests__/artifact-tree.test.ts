import { describe, it, expect } from "vitest";

import {
  buildArtifactTree,
  splitArtifactPath,
  countTreeFiles,
  type ArtifactTreeFolder,
  type ArtifactTreeNode,
} from "@/lib/artifact-tree";
import type { Artifact } from "@/types";

/** Minimal Artifact factory — only the fields the tree builder reads matter. */
function makeArtifact(path: string, overrides: Partial<Artifact> = {}): Artifact {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return {
    id: `id-${path}`,
    repository_key: "raw-repo",
    path,
    name,
    size_bytes: 100,
    checksum_sha256: "abc",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function asFolder(node: ArtifactTreeNode): ArtifactTreeFolder {
  if (node.type !== "folder") throw new Error(`expected folder, got ${node.type}`);
  return node;
}

describe("splitArtifactPath", () => {
  it("splits a simple nested path", () => {
    expect(splitArtifactPath("a/b/c.txt")).toEqual(["a", "b", "c.txt"]);
  });

  it("ignores leading, trailing and repeated separators", () => {
    expect(splitArtifactPath("/a//b/")).toEqual(["a", "b"]);
  });

  it("tolerates backslash separators", () => {
    expect(splitArtifactPath("a\\b\\c.txt")).toEqual(["a", "b", "c.txt"]);
  });

  it("returns an empty array for an empty or slash-only path", () => {
    expect(splitArtifactPath("")).toEqual([]);
    expect(splitArtifactPath("///")).toEqual([]);
  });
});

describe("buildArtifactTree", () => {
  it("returns an empty tree for no artifacts", () => {
    expect(buildArtifactTree([])).toEqual([]);
  });

  it("places a bare filename at the top level as a file", () => {
    const tree = buildArtifactTree([makeArtifact("readme.txt")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("file");
    expect(tree[0].name).toBe("readme.txt");
    expect(tree[0].path).toBe("readme.txt");
  });

  it("nests files under their folder segments", () => {
    const tree = buildArtifactTree([makeArtifact("builds/2026/app.tar.gz")]);
    const builds = asFolder(tree[0]);
    expect(builds.name).toBe("builds");
    expect(builds.path).toBe("builds");

    const year = asFolder(builds.children[0]);
    expect(year.name).toBe("2026");
    expect(year.path).toBe("builds/2026");

    const file = year.children[0];
    expect(file.type).toBe("file");
    expect(file.name).toBe("app.tar.gz");
    expect(file.path).toBe("builds/2026/app.tar.gz");
  });

  it("merges files that share folder prefixes into one subtree", () => {
    const tree = buildArtifactTree([
      makeArtifact("builds/a.txt"),
      makeArtifact("builds/b.txt"),
    ]);
    expect(tree).toHaveLength(1);
    const builds = asFolder(tree[0]);
    expect(builds.children.map((c) => c.name)).toEqual(["a.txt", "b.txt"]);
    expect(builds.fileCount).toBe(2);
  });

  it("sorts folders before files, each alphabetically (case-insensitive)", () => {
    const tree = buildArtifactTree([
      makeArtifact("zeta.txt"),
      makeArtifact("Alpha/one.txt"),
      makeArtifact("beta/two.txt"),
      makeArtifact("apple.txt"),
    ]);
    // Alpha (folder), beta (folder), then files apple.txt, zeta.txt
    expect(tree.map((n) => [n.type, n.name])).toEqual([
      ["folder", "Alpha"],
      ["folder", "beta"],
      ["file", "apple.txt"],
      ["file", "zeta.txt"],
    ]);
  });

  it("aggregates recursive fileCount and totalSize on folders", () => {
    const tree = buildArtifactTree([
      makeArtifact("dir/a.bin", { size_bytes: 10 }),
      makeArtifact("dir/sub/b.bin", { size_bytes: 30 }),
      makeArtifact("dir/sub/c.bin", { size_bytes: 60 }),
    ]);
    const dir = asFolder(tree[0]);
    expect(dir.fileCount).toBe(3);
    expect(dir.totalSize).toBe(100);

    const sub = asFolder(dir.children.find((c) => c.type === "folder")!);
    expect(sub.fileCount).toBe(2);
    expect(sub.totalSize).toBe(90);
  });

  it("de-duplicates identical paths, keeping the last artifact", () => {
    const tree = buildArtifactTree([
      makeArtifact("dup/file.txt", { id: "first", size_bytes: 1 }),
      makeArtifact("dup/file.txt", { id: "second", size_bytes: 2 }),
    ]);
    const dup = asFolder(tree[0]);
    expect(dup.children).toHaveLength(1);
    const file = dup.children[0];
    expect(file.type).toBe("file");
    if (file.type === "file") {
      expect(file.artifact.id).toBe("second");
    }
    expect(dup.fileCount).toBe(1);
    expect(dup.totalSize).toBe(2);
  });

  it("skips artifacts whose path is empty", () => {
    const tree = buildArtifactTree([
      makeArtifact("keep.txt"),
      { ...makeArtifact("x"), path: "", name: "" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("keep.txt");
  });

  it("falls back to the artifact name when path is missing", () => {
    const artifact = { ...makeArtifact("ignored"), path: "", name: "fromname.txt" };
    const tree = buildArtifactTree([artifact]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("fromname.txt");
  });
});

describe("countTreeFiles", () => {
  it("counts all file leaves recursively", () => {
    const tree = buildArtifactTree([
      makeArtifact("a.txt"),
      makeArtifact("dir/b.txt"),
      makeArtifact("dir/sub/c.txt"),
    ]);
    expect(countTreeFiles(tree)).toBe(3);
  });

  it("returns 0 for an empty tree", () => {
    expect(countTreeFiles([])).toBe(0);
  });
});
