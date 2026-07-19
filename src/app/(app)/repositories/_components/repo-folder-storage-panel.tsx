"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, Info, Layers } from "lucide-react";

import { treeApi } from "@/lib/api/tree";
import { formatBytes } from "@/lib/utils";
import type { TreeNode, FolderDedupUsage } from "@/types/tree";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RepoFolderStoragePanelProps {
  /** Repository whose top-level folders are being described. Only `key` is read. */
  repository: { key: string };
  /**
   * Whether the current viewer is an administrator. Gates the descriptive copy
   * about cross-repository sharing, mirroring the per-repository panel. Field
   * visibility itself is enforced by the backend.
   */
  isAdmin: boolean;
}

/** A per-folder row with its dedup breakdown. */
interface FolderRow {
  id: string;
  name: string;
  path: string;
  dedup: FolderDedupUsage;
}

/** A single labelled figure. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Unique-vs-shared mini bar for one folder. */
function UniqueSharedBar({
  unique,
  shared,
}: {
  unique: number;
  shared: number;
}) {
  const total = unique + shared;
  if (total <= 0) return null;
  const uniquePct = (unique / total) * 100;
  const sharedPct = (shared / total) * 100;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="bg-primary"
        style={{ width: `${uniquePct}%` }}
        data-testid="folder-bar-unique"
        aria-hidden
      />
      <div
        className="bg-amber-400 dark:bg-amber-500"
        style={{ width: `${sharedPct}%` }}
        data-testid="folder-bar-shared"
        aria-hidden
      />
    </div>
  );
}

/**
 * Per-folder deduplicated storage detail view (epic artifact-keeper#2056,
 * sub-task 4).
 *
 * Lists each top-level folder in the repository with its deduplicated storage
 * breakdown — logical vs physical bytes, dedup ratio, and a unique-vs-shared
 * split — so operators can see which folders actually consume physical storage
 * after content-addressable deduplication, not just their logical footprint.
 *
 * The folder-level figures are NOT part of the generated `@artifact-keeper/sdk`
 * (v1.6.0 exposes only the repo-level `/storage` operation), so they are read
 * from the tree response through the zod trust-boundary adapter in
 * `lib/api/tree.ts` and are treated as optional. When the backend reports no
 * per-folder dedup — the case for every backend that predates the folder-level
 * `/storage/tree` API — this component renders nothing rather than a panel of
 * zeros, and it lights up automatically once the data starts arriving.
 */
export function RepoFolderStoragePanel({
  repository,
  isAdmin,
}: RepoFolderStoragePanelProps) {
  const repoKey = repository.key;

  const { data: nodes } = useQuery({
    queryKey: ["repository-folder-storage", repoKey],
    queryFn: () =>
      treeApi.getChildren({
        repository_key: repoKey,
        include_metadata: true,
      }),
    enabled: !!repoKey,
  });

  const folders = useMemo<FolderRow[]>(() => {
    return (nodes ?? [])
      .map((node: TreeNode): FolderRow | null => {
        const dedup = node.metadata?.folder?.dedup;
        if (!dedup) return null;
        return { id: node.id, name: node.name, path: node.path, dedup };
      })
      .filter((row): row is FolderRow => row !== null);
  }, [nodes]);

  // Nothing to show until the backend reports per-folder dedup. Rendering an
  // empty "unavailable" panel here would be noise on every current backend, so
  // the component simply stays out of the layout until real data arrives.
  if (folders.length === 0) return null;

  return (
    <Card data-testid="folder-storage-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Per-folder storage</CardTitle>
        <Badge variant="outline" className="text-xs font-normal">
          Deduplicated
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {folders.map((folder) => {
            const { dedup } = folder;
            const unique = dedup.unique_bytes ?? 0;
            const shared = dedup.shared_bytes ?? 0;
            return (
              <li
                key={folder.id}
                className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0"
                data-testid="folder-storage-row"
              >
                <div className="flex items-center gap-2">
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    {folder.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {dedup.logical_bytes != null && (
                    <Figure
                      label="Logical"
                      value={formatBytes(dedup.logical_bytes)}
                    />
                  )}
                  {dedup.physical_bytes != null && (
                    <Figure
                      label="Physical"
                      value={formatBytes(dedup.physical_bytes)}
                    />
                  )}
                  {dedup.unique_bytes != null && (
                    <Figure label="Unique" value={formatBytes(unique)} />
                  )}
                  {dedup.shared_bytes != null && (
                    <Figure label="Shared" value={formatBytes(shared)} />
                  )}
                </div>
                {(dedup.unique_bytes != null || dedup.shared_bytes != null) && (
                  <UniqueSharedBar unique={unique} shared={shared} />
                )}
                {dedup.dedup_ratio != null && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Layers className="size-3.5" />
                    {dedup.dedup_ratio.toFixed(2)}× deduplication
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {isAdmin && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            &ldquo;Shared&rdquo; bytes are blobs a folder has in common with
            other folders or repositories; reclaiming them requires the last
            referencing path to release them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default RepoFolderStoragePanel;
