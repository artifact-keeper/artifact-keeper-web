import type { Artifact } from "@/types";

/**
 * Client-side folder-tree model for RAW/Generic repositories (issue #2791).
 *
 * RAW/Generic repos have no package/version semantics — they are just a flat
 * set of files identified by their storage `path` (e.g. `builds/2026/app.tar.gz`).
 * The backend artifacts listing returns that flat list; this module groups those
 * paths into a navigable directory tree purely on the client so the UI can offer
 * an expand/collapse folder browser without a new backend endpoint.
 *
 * The functions here are deliberately pure (no React, no fetching) so the
 * grouping logic can be unit-tested in isolation.
 */

/** A directory node aggregating its descendant files. */
export interface ArtifactTreeFolder {
  type: "folder";
  /** Segment name of this folder (last path component). */
  name: string;
  /** Full repository-relative path of this folder, e.g. `builds/2026`. */
  path: string;
  /** Sorted children (folders first, then files, each alphabetical). */
  children: ArtifactTreeNode[];
  /** Recursive count of file descendants. */
  fileCount: number;
  /** Recursive sum of descendant file sizes, in bytes. */
  totalSize: number;
}

/** A leaf node wrapping a single artifact file. */
export interface ArtifactTreeFile {
  type: "file";
  /** File name (last path component). */
  name: string;
  /** Full repository-relative path, e.g. `builds/2026/app.tar.gz`. */
  path: string;
  /** The underlying artifact record, carried through so a click can open
   *  the existing artifact detail / download flow without a refetch. */
  artifact: Artifact;
}

export type ArtifactTreeNode = ArtifactTreeFolder | ArtifactTreeFile;

/**
 * Split an artifact path into clean, non-empty segments.
 *
 * Tolerates leading/trailing slashes, Windows-style backslashes, and repeated
 * separators so a slightly irregular backend path (`/a//b/`) still nests
 * sensibly instead of producing empty folder nodes.
 */
export function splitArtifactPath(rawPath: string): string[] {
  return rawPath
    .split(/[/\\]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** Internal mutable builder shape, collapsed to the public folder type on emit. */
interface FolderBuilder {
  name: string;
  path: string;
  folders: Map<string, FolderBuilder>;
  files: ArtifactTreeFile[];
}

function newFolder(name: string, path: string): FolderBuilder {
  return { name, path, folders: new Map(), files: [] };
}

/** Case-insensitive, locale-aware name comparison used across the tree. */
function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Recursively convert a builder into the public, sorted, aggregated node.
 * Folders sort before files; within each group nodes sort alphabetically.
 */
function emitFolder(builder: FolderBuilder): ArtifactTreeFolder {
  const childFolders = Array.from(builder.folders.values())
    .map(emitFolder)
    .sort(byName);
  const childFiles = [...builder.files].sort(byName);

  const fileCount =
    childFiles.length +
    childFolders.reduce((sum, folder) => sum + folder.fileCount, 0);
  const totalSize =
    childFiles.reduce((sum, file) => sum + (file.artifact.size_bytes || 0), 0) +
    childFolders.reduce((sum, folder) => sum + folder.totalSize, 0);

  return {
    type: "folder",
    name: builder.name,
    path: builder.path,
    children: [...childFolders, ...childFiles],
    fileCount,
    totalSize,
  };
}

/**
 * Group a flat list of artifacts into a directory tree.
 *
 * Each artifact's `path` is split into folder segments; the final segment is
 * the file leaf. Artifacts with no folder component (a bare filename) become
 * top-level files. The result is fully sorted (folders first, then files, each
 * alphabetical) with recursive `fileCount` / `totalSize` aggregates on every
 * folder.
 *
 * Duplicate paths keep the last artifact seen. An empty input yields `[]`.
 */
export function buildArtifactTree(artifacts: Artifact[]): ArtifactTreeNode[] {
  const root = newFolder("", "");

  for (const artifact of artifacts) {
    const segments = splitArtifactPath(artifact.path || artifact.name || "");
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    let cursor = root;
    let prefix = "";
    for (const segment of folderSegments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let next = cursor.folders.get(segment);
      if (!next) {
        next = newFolder(segment, prefix);
        cursor.folders.set(segment, next);
      }
      cursor = next;
    }

    const filePath = prefix ? `${prefix}/${fileName}` : fileName;
    const fileNode: ArtifactTreeFile = {
      type: "file",
      name: fileName,
      path: filePath,
      artifact,
    };
    // De-dupe on file name within the same folder (last wins).
    const existingIndex = cursor.files.findIndex((f) => f.name === fileName);
    if (existingIndex >= 0) {
      cursor.files[existingIndex] = fileNode;
    } else {
      cursor.files.push(fileNode);
    }
  }

  return emitFolder(root).children;
}

/** Total number of file leaves across a tree (recursive). */
export function countTreeFiles(nodes: ArtifactTreeNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.type === "file") return sum + 1;
    return sum + node.fileCount;
  }, 0);
}
