"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileArchive,
  Download,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import {
  buildArtifactTree,
  countTreeFiles,
  type ArtifactTreeNode,
} from "@/lib/artifact-tree";
import type { Artifact } from "@/types";

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

function FileGlyph({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (ARCHIVE_EXT.some((ext) => lower.endsWith(ext))) {
    return <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  if (CODE_EXT.some((ext) => lower.endsWith(ext))) {
    return <FileCode className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return <File className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const INDENT_PX = 16;
const BASE_PAD_PX = 8;

function TreeNodeRow({
  node,
  depth,
  onFileSelect,
  selectedPath,
}: {
  node: ArtifactTreeNode;
  depth: number;
  onFileSelect: (artifact: Artifact) => void;
  selectedPath?: string | null;
}) {
  const t = useTranslations("artifactTree");
  const paddingLeft = depth * INDENT_PX + BASE_PAD_PX;

  // --- File leaf ---
  if (node.type === "file") {
    const isSelected = selectedPath === node.path;
    const { artifact } = node;
    return (
      <button
        type="button"
        role="treeitem"
        aria-selected={isSelected}
        aria-label={t("fileAria", { path: node.path })}
        data-testid="artifact-tree-file"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50",
          isSelected && "bg-muted",
        )}
        style={{ paddingLeft }}
        onClick={() => onFileSelect(artifact)}
      >
        {/* spacer to align with folder chevrons */}
        <span className="size-4 shrink-0" aria-hidden="true" />
        <FileGlyph name={node.name} />
        <span className="flex-1 truncate">{node.name}</span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span>{formatBytes(artifact.size_bytes)}</span>
          {artifact.download_count > 0 && (
            <span className="flex items-center gap-1">
              <Download className="size-3" aria-hidden="true" />
              {formatNumber(artifact.download_count)}
            </span>
          )}
        </span>
      </button>
    );
  }

  // --- Folder node ---
  return (
    <FolderRow
      node={node}
      depth={depth}
      onFileSelect={onFileSelect}
      selectedPath={selectedPath}
    />
  );
}

function FolderRow({
  node,
  depth,
  onFileSelect,
  selectedPath,
}: {
  node: Extract<ArtifactTreeNode, { type: "folder" }>;
  depth: number;
  onFileSelect: (artifact: Artifact) => void;
  selectedPath?: string | null;
}) {
  // Top-level folders start expanded so the browser isn't a wall of collapsed
  // rows; deeper folders start collapsed for progressive disclosure.
  const [isOpen, setIsOpen] = useState(depth === 0);
  const t = useTranslations("artifactTree");
  const paddingLeft = depth * INDENT_PX + BASE_PAD_PX;

  return (
    <div
      role="treeitem"
      aria-expanded={isOpen}
      aria-selected={false}
      aria-label={t("folderAria", { path: node.path })}
    >
      <button
        type="button"
        data-testid="artifact-tree-folder"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
        style={{ paddingLeft }}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        {isOpen ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="flex-1 truncate font-medium">{node.name}</span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span>
            {t("fileCount", { count: node.fileCount })}
          </span>
          <span>{formatBytes(node.totalSize)}</span>
        </span>
      </button>
      {isOpen && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface ArtifactFolderTreeProps {
  artifacts: Artifact[];
  onFileSelect: (artifact: Artifact) => void;
  loading?: boolean;
  selectedPath?: string | null;
  emptyMessage?: string;
}

/**
 * Folder-tree browser for RAW/Generic repositories (issue #2791).
 *
 * Groups the repository's flat artifact list into a navigable directory tree
 * (client-side, via `buildArtifactTree`), with expandable/collapsible folders
 * and clickable file leaves. Selecting a file hands the full `Artifact` back to
 * the caller, which opens the existing artifact detail dialog (view / download).
 */
export function ArtifactFolderTree({
  artifacts,
  onFileSelect,
  loading = false,
  selectedPath,
  emptyMessage,
}: ArtifactFolderTreeProps) {
  const t = useTranslations("artifactTree");
  const resolvedEmpty = emptyMessage ?? t("empty");
  const tree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const totalFiles = useMemo(() => countTreeFiles(tree), [tree]);

  if (loading) {
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

  if (tree.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="artifact-tree-empty"
      >
        <Folder className="mb-2 size-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{resolvedEmpty}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FolderOpen className="size-3.5" aria-hidden="true" />
          {t("folderTree")}
        </span>
        <span>
          {t("fileCount", { count: totalFiles })}
        </span>
      </div>
      <div
        role="tree"
        aria-label={t("treeAria")}
        data-testid="artifact-folder-tree"
        className="py-1"
      >
        {tree.map((node) => (
          <TreeNodeRow
            key={node.path}
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
