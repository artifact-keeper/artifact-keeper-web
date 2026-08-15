"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Database, HardDrive, Layers, RefreshCcw, Info } from "lucide-react";

import { storageApi } from "@/lib/api/storage";
import { formatBytes } from "@/lib/utils";
import { formatRelativeTimestamp } from "@/lib/cache-time";
import type { Repository } from "@/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RepoStoragePanelProps {
  /**
   * The repository whose storage is being described. Only `key` (for the
   * lookup) and `storage_used_bytes` (a graceful fallback when the dedup
   * endpoint is unavailable) are read.
   */
  repository: Pick<Repository, "key" | "storage_used_bytes">;
  /**
   * Whether the current viewer is an administrator. Gates the instance-total
   * figure and the reclaimable-space estimate. Field visibility is ALSO
   * enforced by the backend (it omits the dedup breakdown for non-admins on
   * instance-scope backends); this flag is the client-side half of that gate.
   */
  isAdmin: boolean;
}

/** A single labelled metric with an icon. */
function Metric({
  label,
  value,
  icon,
  testId,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Repository storage panel (epic artifact-keeper#2056).
 *
 * Renders the real, deduplicated storage footprint for a repository: logical
 * vs physical bytes, the dedup ratio/savings, a unique-vs-shared breakdown bar,
 * the dedup scope with its caveat, computation freshness, and — for admins —
 * the instance-wide total and an on-demand "reclaimable now" estimate.
 *
 * Gracefully degrades: on `instance` scope the backend omits the dedup
 * breakdown for non-admins (artifact-keeper#2560), so those viewers see only
 * logical bytes and the blob count. If the endpoint is unavailable entirely the
 * panel falls back to the repository's coarse `storage_used_bytes`.
 */
export function RepoStoragePanel({ repository, isAdmin }: RepoStoragePanelProps) {
  const t = useTranslations("app/repositories/_components/repo-storage-panel");
  const repoKey = repository.key;

  const {
    data: usage,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["repository-storage", repoKey],
    queryFn: () => storageApi.getUsage(repoKey),
    enabled: !!repoKey,
  });

  // The reclaimable estimate is a dedup-aware GC dry-run, which can be an
  // expensive full scan — so it is admin-only and computed on demand rather
  // than automatically on page load.
  const [reclaimRequested, setReclaimRequested] = useState(false);
  const {
    data: gcPreview,
    isFetching: gcFetching,
    isError: gcError,
  } = useQuery({
    queryKey: ["repository-storage-gc-preview", repoKey],
    queryFn: () => storageApi.runGc(repoKey, true),
    enabled: reclaimRequested && isAdmin && !!repoKey,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card data-testid="storage-panel-loading">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Endpoint unavailable (e.g. a backend that predates #2056): fall back to the
  // coarse logical figure already carried on the repository record so the panel
  // still shows *something* meaningful rather than an error.
  if (isError || !usage) {
    return (
      <Card data-testid="storage-panel-fallback">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Metric
            label={t("logicalSize")}
            value={formatBytes(repository.storage_used_bytes)}
            icon={<Database className="size-3.5" />}
            testId="storage-logical"
          />
          <p className="text-xs text-muted-foreground">
            {t("unavailable")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const isInstanceScope = usage.dedup_scope === "instance";

  // The dedup breakdown fields travel together: present for admins and for
  // per-repo (filesystem) scope, omitted by the backend for non-admins on
  // instance scope. Gate on `physical_bytes` as the representative field.
  const hasBreakdown =
    usage.physical_bytes !== null && usage.physical_bytes !== undefined;

  const unique = usage.unique_bytes ?? 0;
  const shared = usage.shared_bytes ?? 0;
  const barTotal = unique + shared;
  const uniquePct = barTotal > 0 ? (unique / barTotal) * 100 : 0;
  const sharedPct = barTotal > 0 ? (shared / barTotal) * 100 : 0;

  // Savings = what deduplication removed from the logical footprint.
  const savingsBytes =
    hasBreakdown && usage.physical_bytes != null
      ? Math.max(usage.logical_bytes - usage.physical_bytes, 0)
      : null;
  const savingsPct =
    savingsBytes != null && usage.logical_bytes > 0
      ? Math.round((savingsBytes / usage.logical_bytes) * 100)
      : null;

  return (
    <Card data-testid="storage-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Badge
          variant="outline"
          className="text-xs font-normal"
          data-testid="storage-scope-badge"
        >
          {isInstanceScope ? t("instanceWide") : t("perRepo")}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric
            label={t("logicalSize")}
            value={formatBytes(usage.logical_bytes)}
            icon={<Database className="size-3.5" />}
            testId="storage-logical"
          />
          {hasBreakdown && usage.physical_bytes != null && (
            <Metric
              label={t("physicalStored")}
              value={formatBytes(usage.physical_bytes)}
              icon={<HardDrive className="size-3.5" />}
              testId="storage-physical"
            />
          )}
          {hasBreakdown && usage.dedup_ratio != null && (
            <Metric
              label={t("dedupRatio")}
              value={`${usage.dedup_ratio.toFixed(2)}×`}
              icon={<Layers className="size-3.5" />}
              testId="storage-ratio"
            />
          )}
          <Metric
            label={t("blobs")}
            value={usage.blob_count.toLocaleString()}
            testId="storage-blobs"
          />
        </div>

        {savingsBytes != null && savingsPct != null && (
          <p className="text-sm text-muted-foreground" data-testid="storage-savings">
            {t("savings", {
              bytes: formatBytes(savingsBytes),
              pct: savingsPct,
            })}
          </p>
        )}

        {/* Unique vs shared breakdown. For non-admin viewers the descriptive
            copy about cross-repository sharing is intentionally suppressed —
            only the neutral label is shown. */}
        {hasBreakdown && barTotal > 0 && (
          <div className="space-y-2" data-testid="storage-unique-shared">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary"
                style={{ width: `${uniquePct}%` }}
                data-testid="storage-bar-unique"
                aria-hidden
              />
              <div
                className="bg-amber-400 dark:bg-amber-500"
                style={{ width: `${sharedPct}%` }}
                data-testid="storage-bar-shared"
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-primary" />
                {t("unique", { bytes: formatBytes(unique) })}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-amber-400 dark:bg-amber-500" />
                {t("shared", { bytes: formatBytes(shared) })}
              </span>
            </div>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">
                {t("sharedExplanation")}
              </p>
            )}
          </div>
        )}

        {/* Instance-scope caveat. Admins get the full explanation next to the
            breakdown; non-admins (who receive no breakdown) get a short note
            explaining why detail is absent. */}
        {isInstanceScope && hasBreakdown && (
          <p
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
            data-testid="storage-instance-caveat"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("instanceCaveat")}
          </p>
        )}
        {isInstanceScope && !hasBreakdown && (
          <p
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
            data-testid="storage-instance-note"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("instanceNote")}
          </p>
        )}

        {/* Admin-only instance total. */}
        {isAdmin && usage.instance_unique_bytes != null && (
          <div
            className="border-t pt-3"
            data-testid="storage-instance-total"
          >
            <Metric
              label={t("instanceUnique")}
              value={formatBytes(usage.instance_unique_bytes)}
              icon={<HardDrive className="size-3.5" />}
            />
          </div>
        )}

        {/* Admin-only reclaimable estimate (GC dry-run). */}
        {isAdmin && (
          <div className="border-t pt-3" data-testid="storage-reclaimable">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("reclaimableNow")}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReclaimRequested(true)}
                disabled={gcFetching}
              >
                <RefreshCcw
                  className={`size-3.5 ${gcFetching ? "animate-spin" : ""}`}
                />
                {gcFetching
                  ? t("estimating")
                  : reclaimRequested
                    ? t("reEstimate")
                    : t("estimate")}
              </Button>
            </div>
            {gcError && (
              <p className="mt-2 text-xs text-destructive">
                {t("estimateFailed")}
              </p>
            )}
            {gcPreview && !gcFetching && (
              <p
                className="mt-2 text-sm"
                data-testid="storage-reclaimable-value"
              >
                {t("reclaimable", {
                  bytes: formatBytes(gcPreview.bytes_freed),
                  count: gcPreview.storage_keys_deleted.toLocaleString(),
                })}
              </p>
            )}
          </div>
        )}

        {usage.computed_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-testid="storage-computed-at">
                  {t("computed", {
                    time: formatRelativeTimestamp(usage.computed_at),
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {new Date(usage.computed_at).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RepoStoragePanel;
