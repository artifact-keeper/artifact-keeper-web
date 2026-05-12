"use client";

import { useMemo, useState } from "react";
import { Container, Info, Layers as LayersIcon, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/common/copy-button";
import { QuarantineBadge } from "@/components/common/quarantine-badge";
import { isActivelyQuarantined } from "@/lib/quarantine";
import { formatBytes } from "@/lib/utils";
import type { Artifact } from "@/types";

import { groupDockerArtifacts, truncateDigest } from "../_lib/docker-grouping";

interface DockerTagListProps {
  artifacts: Artifact[];
  loading?: boolean;
  /** Click handler for a tag row — typically opens the manifest detail dialog. */
  onTagClick?: (manifest: Artifact) => void;
  onScan?: (manifest: Artifact) => void;
  scanPending?: boolean;
  emptyMessage?: string;
}

/**
 * Renders Docker repository artifacts grouped by manifest tag (issue #330).
 *
 * Backend has no native tag aggregation yet, so this component aggregates
 * on the client using {@link groupDockerArtifacts}.  Raw layer blobs and
 * digest-only manifests are hidden by default; the count is surfaced as a
 * small footer with a "show layers" expansion for advanced users.
 */
export function DockerTagList({
  artifacts,
  loading = false,
  onTagClick,
  onScan,
  scanPending = false,
  emptyMessage = "No image tags found in this repository.",
}: DockerTagListProps) {
  const [showLayers, setShowLayers] = useState(false);

  const grouped = useMemo(() => groupDockerArtifacts(artifacts), [artifacts]);
  const hiddenCount =
    grouped.blobs.length + grouped.manifestsByDigest.length + grouped.other.length;

  if (loading) {
    return (
      <div className="space-y-2" data-testid="docker-tag-list-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!grouped.tags.length) {
    return (
      <div className="space-y-3" data-testid="docker-tag-list-empty">
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
        {hiddenCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {hiddenCount} blob{hiddenCount === 1 ? "" : "s"} / digest-only
            manifest{hiddenCount === 1 ? "" : "s"} present but no tagged images
            were detected. Switch to flat view to inspect them.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="docker-tag-list">
      <div className="rounded-md border">
        <table className="w-full text-sm" role="table">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Tag
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Digest
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-right">
                Size
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last pushed
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {grouped.tags.map((group) => (
              <tr
                key={group.key}
                className="hover:bg-muted/30"
                data-testid="docker-tag-row"
                data-tag={group.key}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-primary hover:underline"
                    onClick={() => onTagClick?.(group.manifest)}
                  >
                    <Container className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span className="font-medium">{group.tag}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.image}
                      </span>
                    </div>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <code className="font-mono text-xs text-muted-foreground">
                      {truncateDigest(group.manifest.checksum_sha256) ||
                        truncateDigest(group.tag)}
                    </code>
                    {group.manifest.checksum_sha256 && (
                      <CopyButton value={group.manifest.checksum_sha256} />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1">
                        {formatBytes(group.size_bytes)}
                        <Info className="size-3 opacity-60" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Manifest size only. Total layer size will be aggregated
                      once backend support lands.
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(group.manifest.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  {isActivelyQuarantined(group.manifest) ? (
                    <QuarantineBadge
                      reason={group.manifest.quarantine_reason}
                      quarantineUntil={group.manifest.quarantine_until}
                    />
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      OK
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {onScan && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onScan(group.manifest)}
                            disabled={scanPending}
                            aria-label={`Scan ${group.image}:${group.tag}`}
                          >
                            <Shield className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Scan</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <LayersIcon className="size-3.5" aria-hidden="true" />
            {hiddenCount} layer{hiddenCount === 1 ? "" : "s"} /
            {grouped.manifestsByDigest.length > 0 && (
              <> {grouped.manifestsByDigest.length} digest-only manifest{
                grouped.manifestsByDigest.length === 1 ? "" : "s"
              }</>
            )} hidden
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setShowLayers((s) => !s)}
            aria-expanded={showLayers}
            data-testid="toggle-layers"
          >
            {showLayers ? "Hide layers" : "Show layers"}
          </Button>
        </div>
      )}

      {showLayers && hiddenCount > 0 && (
        <div className="rounded-md border" data-testid="docker-layer-list">
          <ul className="divide-y" role="list">
            {[...grouped.manifestsByDigest, ...grouped.blobs, ...grouped.other].map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <code className="truncate font-mono text-muted-foreground" title={a.path}>
                  {a.path}
                </code>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(a.size_bytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
