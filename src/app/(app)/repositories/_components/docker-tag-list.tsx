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

// Stable id for aria-controls on the "Show layers" disclosure.  Module-level
// constant so it's identical across renders without needing useId.
const LAYER_PANEL_ID = "docker-layer-list-panel";

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
  // M7: actionable default — tells users how to add a tag, not just that there isn't one.
  emptyMessage = "No image tags found. Push an image (`docker push <registry>/<image>:<tag>`) to see it here, or switch to Flat view to inspect raw blobs.",
}: DockerTagListProps) {
  const [showLayers, setShowLayers] = useState(false);

  const grouped = useMemo(() => groupDockerArtifacts(artifacts), [artifacts]);
  const hiddenCount =
    grouped.blobs.length + grouped.manifestsByDigest.length + grouped.other.length;

  if (loading) {
    return (
      // M3: announce loading to AT so SR users hear "Loading image tags" instead
      // of silence between toggle click and skeleton render.
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="space-y-2"
        data-testid="docker-tag-list-loading"
      >
        <span className="sr-only">Loading image tags…</span>
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
      {/*
        N4: 6-column table will overflow at 360px viewports.  Wrap in
        overflow-x-auto so the page itself doesn't horizontally scroll.
      */}
      <div className="overflow-x-auto rounded-md border">
        {/*
          M5: real <table> already has implicit role="table" — drop the
          redundant attribute.  Add aria-label + visually-hidden caption
          so SR users hear "Image tags table" instead of "table with 6
          columns" with no name.
        */}
        <table className="w-full text-sm" aria-label="Image tags">
          <caption className="sr-only">
            Docker image tags in this repository
          </caption>
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
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
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
                  {/*
                    N2: explicit aria-label gives a coherent reading order
                    ("View library/node:14 manifest") instead of the
                    visual-order children that would announce as
                    "fourteen, library slash node".
                  */}
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-primary hover:underline"
                    aria-label={`View ${group.image}:${group.tag} manifest`}
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
                    {/*
                      The visible label is truncated but screen readers and
                      hover tooltips expose the full digest via aria-label
                      and title.
                    */}
                    <code
                      className="font-mono text-xs text-muted-foreground"
                      aria-label={
                        group.manifest.checksum_sha256
                          ? `Digest ${group.manifest.checksum_sha256}`
                          : `Tag ${group.tag}`
                      }
                      title={group.manifest.checksum_sha256 || group.tag}
                    >
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
                      {/*
                        Button rather than span so keyboard users can focus
                        the trigger and the Radix tooltip will surface the
                        "manifest size only" caveat on focus, not just hover.
                      */}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`${formatBytes(group.size_bytes)} (manifest size only — backend layer aggregation pending)`}
                      >
                        {formatBytes(group.size_bytes)}
                        <Info className="size-3 opacity-60" aria-hidden="true" />
                      </button>
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
          {/*
            N3: aria-controls links the disclosure button to the panel
            below so SR users know exactly which region is being toggled.
          */}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setShowLayers((s) => !s)}
            aria-expanded={showLayers}
            aria-controls={LAYER_PANEL_ID}
            data-testid="toggle-layers"
          >
            {showLayers ? "Hide layers" : "Show layers"}
          </Button>
        </div>
      )}

      {showLayers && hiddenCount > 0 && (
        <div
          id={LAYER_PANEL_ID}
          className="rounded-md border"
          data-testid="docker-layer-list"
        >
          <ul className="divide-y" role="list">
            {[...grouped.manifestsByDigest, ...grouped.blobs, ...grouped.other].map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                {/*
                  M6: `title=""` is mouse-only and inconsistently announced
                  by SR.  Render the full path as truncated visible text
                  AND in an sr-only span so AT users get the unredacted
                  value regardless of input modality.
                */}
                <code className="truncate font-mono text-muted-foreground" aria-hidden="true">
                  {a.path}
                </code>
                <span className="sr-only">Full path: {a.path}</span>
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
