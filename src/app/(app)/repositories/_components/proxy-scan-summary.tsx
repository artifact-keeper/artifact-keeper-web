"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, ShieldQuestion } from "lucide-react";

import { proxyScansApi } from "@/lib/api/proxy-scans";
import {
  PROXY_SCAN_DISTINCT_DIGESTS_COPY,
  PROXY_SCAN_NO_CVE_DETAIL_COPY,
  PROXY_SCAN_PENDING_INGEST_COPY,
  PROXY_SCAN_UNAVAILABLE_COPY,
  describeProxyVerdict,
  formatScannedDate,
  resolveProxyScanListView,
  severityBuckets,
  showsInheritedVerdict,
} from "@/lib/proxy-scan";
import type {
  ProxyScanEnforcement,
  ProxyScanEntry,
  ProxyScanSummary,
} from "@/types/proxy-scans";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

import {
  ProxyEnforcementBanner,
  ProxyScanAccessNotice,
  ProxySeverityBadges,
} from "./proxy-scan-panel";

/**
 * Repository-level proxy scan summary and cached-path listing.
 *
 * The list is not optional. Counts alone answer "3 vulnerable digests" but not
 * *which* ones — the operator's first question — which would force a click
 * through every artifact modal to find them. The per-row badge in the artifact
 * *listing* is deferred because that listing is anonymous-readable on public
 * repositories; that rationale does not apply here, behind the endpoint's own
 * authentication bar.
 *
 * Visible to any authenticated user with repository visibility, matching the
 * endpoint's authorization. It is deliberately not admin-gated: the scan
 * *config* form on the same tab is an admin control, but the verdicts are a
 * read that every developer pulling from this repository has a stake in.
 */

const PAGE_SIZE = 20;

const STATE_BADGE: Record<string, string> = {
  clean: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  vulnerable: "text-red-600 bg-red-100 dark:bg-red-950/40",
  not_scanned: "text-muted-foreground bg-muted",
};

const STATE_LABEL: Record<string, string> = {
  clean: "Clean",
  vulnerable: "Vulnerable",
  not_scanned: "Not scanned",
};

function SummaryTile({
  label,
  count,
  hint,
  className,
  testId,
}: {
  label: string;
  count: number;
  hint?: string;
  className?: string;
  testId: string;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-3 ${className ?? ""}`}
      data-testid={testId}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{count}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function ProxyScanSummaryTiles({ summary }: { summary: ProxyScanSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <SummaryTile
        testId="proxy-summary-clean"
        label="Clean digests"
        count={summary.clean}
      />
      <SummaryTile
        testId="proxy-summary-vulnerable"
        label="Vulnerable digests"
        count={summary.vulnerable}
      />
      <SummaryTile
        testId="proxy-summary-not-scanned"
        label="Not scanned"
        count={summary.not_scanned}
      />
      {/* Placeholder rows are excluded from the state counts because they have
          no digest to join on. Reported separately so the totals reconcile
          with the artifact listing instead of silently undercounting. */}
      <SummaryTile
        testId="proxy-summary-pending-ingest"
        label="Pending ingest"
        count={summary.pending_ingest}
        hint={PROXY_SCAN_PENDING_INGEST_COPY}
      />
    </div>
  );
}

function pathColumns(
  enforcement: ProxyScanEnforcement,
): DataTableColumn<ProxyScanEntry>[] {
  return [
    {
      id: "path",
      header: "Cache path",
      accessor: (e) => e.path,
      sortable: true,
      cell: (e) => (
        <span className="text-sm break-all" title={e.path}>
          {e.path}
        </span>
      ),
    },
    {
      id: "state",
      header: "Status",
      accessor: (e) => e.state,
      sortable: true,
      cell: (e) => (
        <div className="space-y-1">
          <Badge
            variant="outline"
            className={`text-xs ${STATE_BADGE[e.state] ?? ""}`}
          >
            {STATE_LABEL[e.state] ?? e.state}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {describeProxyVerdict(e, enforcement).detail}
          </p>
        </div>
      ),
    },
    {
      id: "findings",
      header: "Findings",
      accessor: (e) => e.findings_count,
      sortable: true,
      cell: (e) =>
        e.findings_count > 0 ? (
          <ProxySeverityBadges
            buckets={severityBuckets(e)}
            findingsCount={e.findings_count}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "scanned_at",
      header: "Scanned",
      accessor: (e) => e.scanned_at ?? "",
      sortable: true,
      cell: (e) => {
        const date = formatScannedDate(e.scanned_at);
        return (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {date ?? "—"}
          </div>
        );
      },
    },
  ];
}

export function ProxyScanSummarySection({
  repositoryKey,
}: {
  repositoryKey: string;
}) {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["proxy-scans", repositoryKey, page],
    queryFn: () => proxyScansApi.list(repositoryKey, { page, per_page: PAGE_SIZE }),
    retry: false,
  });

  const enforcement: ProxyScanEnforcement = {
    scan_on_proxy: data?.scan_on_proxy ?? false,
    proxy_scan_action: data?.proxy_scan_action ?? "fail_open",
  };

  // A 401 must render the same sign-in copy the per-artifact panel uses, not
  // an empty table that reads as "nothing cached, nothing wrong".
  const view = resolveProxyScanListView({ isLoading, error });

  const summary: ProxyScanSummary = data?.summary ?? {
    clean: 0,
    vulnerable: 0,
    not_scanned: 0,
    pending_ingest: 0,
  };
  const items = data?.items ?? [];

  // A repository that does not scan its own proxy downloads but is displaying
  // verdicts is showing verdicts another repository recorded for
  // byte-identical content.
  const inherited =
    showsInheritedVerdict("clean", enforcement) &&
    summary.clean + summary.vulnerable > 0;

  return (
    <div className="space-y-4" data-testid="proxy-scan-summary">
      <div className="flex items-center gap-3">
        <ShieldQuestion className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Proxy Cache Scan Status</h3>
      </div>

      {view.kind === "loading" ? (
        <Skeleton className="h-40 w-full" />
      ) : view.kind === "failure" ? (
        <ProxyScanAccessNotice failure={view.failure} />
      ) : view.kind === "unavailable" ? (
        <p className="text-sm text-muted-foreground" data-testid="proxy-scan-unavailable">
          {PROXY_SCAN_UNAVAILABLE_COPY}
        </p>
      ) : (
        <>
          <ProxyScanSummaryTiles summary={summary} />
          <p className="text-xs text-muted-foreground">
            {PROXY_SCAN_DISTINCT_DIGESTS_COPY}
          </p>

          {inherited && <ProxyEnforcementBanner />}

          <DataTable
            columns={pathColumns(enforcement)}
            data={items}
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? items.length}
            onPageChange={setPage}
            emptyMessage="No proxy-cached content in this repository yet."
            rowKey={(e) => e.path}
          />

          <p className="text-xs text-muted-foreground">
            {PROXY_SCAN_NO_CVE_DETAIL_COPY}
          </p>
        </>
      )}
    </div>
  );
}
