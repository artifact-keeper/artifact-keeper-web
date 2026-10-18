"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileArchive,
  Package,
  Download,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { treeApi } from "@/lib/api/tree";
import { cn, formatBytes } from "@/lib/utils";
import type { TreeNode } from "@/types/tree";
import {
  packageFilesRootPath,
  repositoryRelativeTreePath,
} from "@/lib/package-files";

// ---- Helpers ----

function getFileIcon(node: TreeNode) {
  if (node.type === "folder" || node.type === "repository" || node.type === "root") {
    return null; // handled by open/closed state in the tree node
  }
  if (node.type === "package" || node.type === "version") {
    return <Package className="size-4 text-muted-foreground" />;
  }
  const name = node.name.toLowerCase();
  if (
    name.endsWith(".tar.gz") ||
    name.endsWith(".zip") ||
    name.endsWith(".jar") ||
    name.endsWith(".war") ||
    name.endsWith(".tgz") ||
    name.endsWith(".gz") ||
    name.endsWith(".bz2") ||
    name.endsWith(".xz")
  ) {
    return <FileArchive className="size-4 text-muted-foreground" />;
  }
  if (
    name.endsWith(".json") ||
    name.endsWith(".xml") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml") ||
    name.endsWith(".toml") ||
    name.endsWith(".pom") ||
    name.endsWith(".py") ||
    name.endsWith(".rs") ||
    name.endsWith(".js") ||
    name.endsWith(".ts")
  ) {
    return <FileCode className="size-4 text-muted-foreground" />;
  }
  return <File className="size-4 text-muted-foreground" />;
}

function isFolderLike(node: TreeNode): boolean {
  return (
    node.type === "folder" ||
    node.type === "repository" ||
    node.type === "root" ||
    node.type === "package" ||
    node.type === "version"
  );
}

// ---- TreeNodeRow ----

function TreeNodeRow({
  node,
  repositoryKey,
  depth,
  onFileSelect,
  selectedPath,
}: {
  node: TreeNode;
  repositoryKey: string;
  depth: number;
  onFileSelect?: (node: TreeNode) => void;
  selectedPath?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = isFolderLike(node);

  // Tree nodes come back with the repository key prepended
  // ("maven-releases/com/example"), but `path` is a repository-relative
  // prefix, so sending `node.path` as-is listed nothing (#987).
  const childPath = repositoryRelativeTreePath(repositoryKey, node.path);
  const { data: children, isLoading } = useQuery({
    queryKey: ["tree-children", repositoryKey, childPath],
    queryFn: () =>
      treeApi.getChildren({
        repository_key: repositoryKey,
        path: childPath,
        include_metadata: true,
      }),
    enabled: isFolder && isOpen && node.has_children,
  });

  const handleToggle = useCallback(() => {
    if (isFolder && node.has_children) {
      setIsOpen((prev) => !prev);
    }
  }, [isFolder, node.has_children]);

  const artifactMeta = node.metadata?.artifact;
  const paddingLeft = depth * 16 + 8;

  if (!isFolder) {
    const isSelected = selectedPath === node.path;
    return (
      <button
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm w-full text-left",
          isSelected && "bg-muted"
        )}
        style={{ paddingLeft }}
        onClick={() => onFileSelect?.(node)}
      >
        {getFileIcon(node)}
        <span className="truncate flex-1">{node.name}</span>
        {artifactMeta && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span>{formatBytes(artifactMeta.size_bytes)}</span>
            {artifactMeta.download_count > 0 && (
              <span className="flex items-center gap-1">
                <Download className="size-3" />
                {artifactMeta.download_count}
              </span>
            )}
          </div>
        )}
      </button>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 w-full text-left text-sm"
          style={{ paddingLeft }}
          onClick={handleToggle}
        >
          {node.has_children ? (
            isOpen ? (
              <ChevronDown className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="size-4 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="size-4 text-muted-foreground shrink-0" />
          ) : (
            <Folder className="size-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate flex-1">{node.name}</span>
          {node.children_count != null && node.children_count > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {node.children_count}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isLoading && (
          <div className="space-y-1 py-1" style={{ paddingLeft: paddingLeft + 16 }}>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-40" />
          </div>
        )}
        {!isLoading && children && children.length === 0 && (
          <div
            className="py-2 text-xs text-muted-foreground"
            style={{ paddingLeft: paddingLeft + 16 }}
          >
            Empty
          </div>
        )}
        {!isLoading &&
          children &&
          children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              repositoryKey={repositoryKey}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- FileTree ----

export function FileTree({
  repositoryKey,
  rootPath,
  onFileSelect,
  selectedPath,
}: {
  repositoryKey: string;
  rootPath?: string;
  onFileSelect?: (node: TreeNode) => void;
  selectedPath?: string | null;
}) {
  // The tree endpoint matches `path` as a repository-relative prefix with no
  // leading or trailing slash.
  const rootPrefix = rootPath?.replace(/^\/+|\/+$/g, "") || undefined;
  const { data: nodes, isLoading } = useQuery({
    queryKey: ["tree-children", repositoryKey, rootPrefix ?? ""],
    queryFn: () =>
      treeApi.getChildren({
        repository_key: repositoryKey,
        path: rootPrefix,
        include_metadata: true,
      }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Folder className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No files found</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          repositoryKey={repositoryKey}
          depth={0}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

// ---- PackageFileTree ----

/**
 * The Files tab of a package: the tree under the directory that holds the
 * package's files, derived from its format and catalog name (#987). Formats
 * that keep files flat (rpm, debian, conda, alpine, pacman) have no such
 * directory, so the tab says so instead of showing an empty tree.
 */
export function PackageFileTree({
  repositoryKey,
  format,
  packageName,
  onFileSelect,
  selectedPath,
}: {
  repositoryKey: string;
  format: string | undefined;
  packageName: string;
  onFileSelect?: (node: TreeNode) => void;
  selectedPath?: string | null;
}) {
  const rootPath = packageFilesRootPath(format, packageName);
  if (rootPath === null) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="package-files-flat-layout"
      >
        <Folder className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground max-w-md">
          This format stores package files in a shared folder layout, not one
          folder per package. Browse them from the repository&apos;s Artifacts
          tab.
        </p>
      </div>
    );
  }
  return (
    <FileTree
      repositoryKey={repositoryKey}
      rootPath={rootPath}
      onFileSelect={onFileSelect}
      selectedPath={selectedPath}
    />
  );
}
