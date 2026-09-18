"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileArchive,
  FileCode,
  Folder,
  FolderOpen,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { treeApi, type TreeNode } from "@/lib/api/tree";

const ARCHIVE_EXT = [
  ".tar.gz",
  ".tgz",
  ".zip",
  ".jar",
  ".war",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
];

const CODE_EXT = [
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".txt",
  ".md",
  ".sh",
  ".py",
  ".rs",
  ".js",
  ".ts",
];

const INDENT_PX = 16;
const BASE_PAD_PX = 8;

// File-browser ordering: folders first, then case-insensitive natural names.
// This prevents ASCII-style ordering such as all uppercase names before
// lowercase names and keeps directories from being interspersed with files.
const TREE_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    const aIsFolder = a.type === "folder";
    const bIsFolder = b.type === "folder";

    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }

    const byName = TREE_NAME_COLLATOR.compare(a.name, b.name);
    if (byName !== 0) {
      return byName;
    }

    // Deterministic tie-breaker for names that differ only by case/accents.
    return a.name.localeCompare(b.name);
  });
}

function FileGlyph({ name }: { name: string }) {
  const lower = name.toLowerCase();

  if (ARCHIVE_EXT.some((ext) => lower.endsWith(ext))) {
    return (
      <FileArchive
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    );
  }

  if (CODE_EXT.some((ext) => lower.endsWith(ext))) {
    return (
      <FileCode
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    );
  }

  return (
    <File
      className="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );
}

/**
 * The backend tree endpoint returns paths prefixed by the repository key:
 *   raw-repo/foo/bar.bin
 *
 * The `path=` query parameter and artifactsApi.get() expect repository-relative
 * paths:
 *   foo/bar.bin
 */
function repositoryRelativePath(
  repositoryKey: string,
  backendPath: string,
): string {
  if (backendPath === repositoryKey) {
    return "";
  }

  const prefix = `${repositoryKey}/`;
  if (backendPath.startsWith(prefix)) {
    return backendPath.slice(prefix.length);
  }

  // Defensive fallback in case a backend already returns relative paths.
  return backendPath;
}

interface TreeNodeRowProps {
  repositoryKey: string;
  node: TreeNode;
  depth: number;
  onFileSelect: (path: string, filename: string) => void;
  selectedPath?: string | null;
}

function TreeNodeRow({
  repositoryKey,
  node,
  depth,
  onFileSelect,
  selectedPath,
}: TreeNodeRowProps) {
  if (node.type === "artifact") {
    const relativePath = repositoryRelativePath(repositoryKey, node.path);
    const paddingLeft = depth * INDENT_PX + BASE_PAD_PX;
    const isSelected = selectedPath === relativePath;

    return (
      <button
        type="button"
        role="treeitem"
        aria-selected={isSelected}
        aria-label={`File ${relativePath}`}
        data-testid="artifact-tree-file"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50",
          isSelected && "bg-muted",
        )}
        style={{ paddingLeft }}
        onClick={() => onFileSelect(relativePath, node.name)}
      >
        <span className="size-4 shrink-0" aria-hidden="true" />
        <FileGlyph name={node.name} />
        <span className="flex-1 truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <FolderRow
      repositoryKey={repositoryKey}
      node={node}
      depth={depth}
      onFileSelect={onFileSelect}
      selectedPath={selectedPath}
    />
  );
}

interface FolderRowProps {
  repositoryKey: string;
  node: TreeNode;
  depth: number;
  onFileSelect: (path: string, filename: string) => void;
  selectedPath?: string | null;
}

function FolderRow({
  repositoryKey,
  node,
  depth,
  onFileSelect,
  selectedPath,
}: FolderRowProps) {
  // Closed by default. This is the lazy-loading boundary: children are not
  // requested until the operator expands this specific folder.
  const [isOpen, setIsOpen] = useState(false);
  const relativePath = repositoryRelativePath(repositoryKey, node.path);
  const paddingLeft = depth * INDENT_PX + BASE_PAD_PX;

  const {
    data: children = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["artifact-tree", repositoryKey, relativePath],
    queryFn: () =>
      treeApi.getChildren({
        repository_key: repositoryKey,
        path: relativePath,
      }),
    enabled: isOpen && node.has_children,
    staleTime: 30_000,
  });

  return (
    <div
      role="treeitem"
      aria-expanded={isOpen}
      aria-selected={false}
      aria-label={`Folder ${relativePath}`}
      aria-busy={isOpen && isLoading}
    >
      <button
        type="button"
        data-testid="artifact-tree-folder"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
        style={{ paddingLeft }}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        {isOpen ? (
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}

        {isOpen ? (
          <FolderOpen
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <Folder
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}

        <span className="flex-1 truncate font-medium">{node.name}</span>

        {node.children_count != null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {node.children_count} {node.children_count === 1 ? "file" : "files"}
          </span>
        )}
      </button>

      {isOpen && (
        <div role="group">
          {isLoading && (
            <div
              className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
              style={{
                paddingLeft:
                  (depth + 1) * INDENT_PX + BASE_PAD_PX + 16,
              }}
              data-testid="artifact-tree-folder-loading"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Loading…
            </div>
          )}

          {isError && (
            <div
              className="flex items-center gap-2 py-2 text-xs text-destructive"
              style={{
                paddingLeft:
                  (depth + 1) * INDENT_PX + BASE_PAD_PX + 16,
              }}
              data-testid="artifact-tree-folder-error"
            >
              <span>Failed to load folder.</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 underline"
                onClick={() => void refetch()}
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!isLoading &&
            !isError &&
            sortTreeNodes(children).map((child) => (
              <TreeNodeRow
                key={child.id}
                repositoryKey={repositoryKey}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                selectedPath={selectedPath}
              />
            ))}

          {!isLoading &&
            !isError &&
            node.has_children &&
            children.length === 0 && (
              <div
                className="py-2 text-xs text-muted-foreground"
                style={{
                  paddingLeft:
                    (depth + 1) * INDENT_PX + BASE_PAD_PX + 16,
                }}
              >
                Folder is empty.
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export interface ArtifactFolderTreeProps {
  repositoryKey: string;
  onFileSelect: (path: string, filename: string) => void;
  selectedPath?: string | null;
  emptyMessage?: string;
}

/**
 * Lazy folder-tree browser for RAW/Generic repositories.
 *
 * The root is fetched once. Each folder then loads exactly one level from
 * /api/v1/tree when expanded.
 */
export function ArtifactFolderTree({
  repositoryKey,
  onFileSelect,
  selectedPath,
  emptyMessage = "No artifacts in this repository.",
}: ArtifactFolderTreeProps) {
  const {
    data: rootNodes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["artifact-tree", repositoryKey, ""],
    queryFn: () =>
      treeApi.getChildren({
        repository_key: repositoryKey,
      }),
    enabled: !!repositoryKey,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4" data-testid="artifact-tree-loading">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-48" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-12 text-center"
        data-testid="artifact-tree-error"
      >
        <Folder
          className="size-8 text-muted-foreground/40"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          Could not load repository tree.
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm underline"
          onClick={() => void refetch()}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (rootNodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="artifact-tree-empty"
      >
        <Folder
          className="mb-2 size-8 text-muted-foreground/40"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FolderOpen className="size-3.5" aria-hidden="true" />
          Folder tree
        </span>
      </div>

      <div
        role="tree"
        aria-label="Repository folder tree"
        data-testid="artifact-folder-tree"
        className="py-1"
      >
        {sortTreeNodes(rootNodes).map((node) => (
          <TreeNodeRow
            key={node.id}
            repositoryKey={repositoryKey}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </div>
  );
}

export default ArtifactFolderTree;
