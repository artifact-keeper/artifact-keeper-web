"use client";

import { useTranslations } from "next-intl";
import { Container, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/common/copy-button";
import { DataTablePagination } from "@/components/common/data-table-pagination";
import { formatBytes } from "@/lib/utils";
import type { DockerTag } from "@/types";

import { truncateDigest } from "../_lib/docker-grouping";

interface DockerTagListProps {
  /** Server-grouped tag rollups (`?group_by=docker_tag`, backend ak#1336). */
  tags: DockerTag[];
  loading?: boolean;
  /**
   * Total tag count from the server.  Used for the "showing N of M" helper
   * text and to drive pagination.  Optional.
   */
  total?: number;
  /** Current 1-based page (server-side pagination). */
  page?: number;
  /** Tags per page. */
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Click handler for a tag row — typically opens the manifest detail dialog. */
  onTagClick?: (tag: DockerTag) => void;
  onScan?: (tag: DockerTag) => void;
  scanPending?: boolean;
  emptyMessage?: string;
}

/**
 * Renders Docker repository tags grouped server-side (issue #330).
 *
 * Uses `GET /api/v1/repositories/:key/artifacts?group_by=docker_tag`
 * (backend ak#1336) — the same pattern as the Maven component grouping —
 * instead of re-deriving tags client-side from one page of the flat
 * artifact list.  The old client-side grouping only ever saw the first
 * page of the flat list sorted by path, so any repository whose first
 * page contained no `…/manifests/<tag>` rows rendered "No image tags
 * found" even though tags existed; it also could not compute true image
 * sizes.  The server rollup returns every tag with its real (multi-arch
 * aware) total size, last push time, and scan status.
 *
 * Two things the old client-side rows had that the rollup does not:
 * quarantine verdicts and the `analyzable` flag.  The grouped view
 * therefore renders no quarantine claim at all — per the listing-badge
 * contract (#697/#700), an absent verdict means "the server did not
 * look", never "clear", so an OK badge here would be unbacked (#650).
 * Quarantine state stays visible in Flat view and in the artifact detail
 * dialog (which fetches GET /api/v1/quarantine/{id}).  Scan is likewise
 * not gated on `analyzable` (#2292): the backend rejects scans of
 * proxy-cached manifests and the mutation surfaces that as a toast.
 */
export function DockerTagList({
  tags,
  loading = false,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  onTagClick,
  onScan,
  scanPending = false,
  emptyMessage,
}: DockerTagListProps) {
  const t = useTranslations("app/repositories/_components/docker-tag-list");
  // Human label for the server's scan rollup status; `undefined`/`null` means
  // the tag's manifest has never been scanned.
  const scanStatusLabel = (status: string | null | undefined): string =>
    status ?? t("notScanned");
  // M7: actionable default — tells users how to add a tag, not just that there isn't one.
  const resolvedEmpty = emptyMessage ?? t("empty");
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
        <span className="sr-only">{t("loading")}</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!tags.length) {
    return (
      <div
        className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
        data-testid="docker-tag-list-empty"
      >
        {resolvedEmpty}
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
        <table className="w-full text-sm" aria-label={t("tableAria")}>
          <caption className="sr-only">
            {t("caption")}
          </caption>
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("tag")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("digest")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-right">
                {t("size")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("lastPushed")}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t("scan")}
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tags.map((tag) => (
              <tr
                key={`${tag.image}:${tag.tag}`}
                className="hover:bg-muted/30"
                data-testid="docker-tag-row"
                data-tag={`${tag.image}:${tag.tag}`}
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
                    aria-label={t("viewManifest", { image: tag.image, tag: tag.tag })}
                    onClick={() => onTagClick?.(tag)}
                  >
                    <Container className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-medium">
                        {tag.tag}
                        {tag.is_index && (
                          <Badge variant="outline" className="font-normal">
                            {t("multiArch")}
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tag.image}
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
                      aria-label={t("digestAria", { digest: tag.manifest_digest })}
                      title={tag.manifest_digest}
                    >
                      {truncateDigest(tag.manifest_digest)}
                    </code>
                    <CopyButton value={tag.manifest_digest} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  {formatBytes(tag.total_size_bytes)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(tag.last_pushed_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="font-normal">
                    {scanStatusLabel(tag.scan_status)}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {onScan && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onScan(tag)}
                            disabled={scanPending}
                            aria-label={t("scanAria", { image: tag.image, tag: tag.tag })}
                          >
                            <Shield className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("scan")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination over the tags themselves (server-side, like #443). */}
      {typeof total === "number" && (
        <DataTablePagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          itemLabel={t("itemLabel")}
        />
      )}
    </div>
  );
}
