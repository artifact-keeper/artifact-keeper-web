"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, AlertTriangle, Clock } from "lucide-react";

import securityApi from "@/lib/api/security";
import type { ScanResult } from "@/types/security";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

const SCAN_STATUS_BADGE: Record<string, string> = {
  completed: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  running: "text-blue-600 bg-blue-100 dark:bg-blue-950/40",
  failed: "text-red-600 bg-red-100 dark:bg-red-950/40",
  pending: "text-muted-foreground bg-muted",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "text-red-600 bg-red-100 dark:bg-red-950/40",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-950/40",
};

/**
 * Lists the security scans run against a specific artifact and links each to
 * its per-scan findings page. Pre-#368 the per-artifact Security tab only
 * showed SBOM CVE history and Dependency-Track findings, never the native
 * `scan_findings` table — so a user who triggered a scan couldn't see the
 * results on the artifact's own page. The SDK method
 * `securityApi.listArtifactScans(artifactId)` already existed but had no
 * consumer; this component is the consumer.
 */
export function ArtifactScansSection({ artifactId }: { artifactId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["security", "artifact-scans", artifactId],
    queryFn: () => securityApi.listArtifactScans(artifactId),
    retry: false,
  });

  const scans = data?.items ?? [];

  const columns: DataTableColumn<ScanResult>[] = [
    {
      id: "status",
      header: "Status",
      accessor: (s) => s.status,
      cell: (s) => (
        <Badge
          variant="outline"
          className={`border text-xs uppercase ${SCAN_STATUS_BADGE[s.status] ?? ""}`}
        >
          {s.status}
        </Badge>
      ),
    },
    {
      id: "scan_type",
      header: "Type",
      accessor: (s) => s.scan_type,
      cell: (s) => <span className="text-sm">{s.scan_type}</span>,
    },
    {
      id: "findings",
      header: "Findings",
      accessor: (s) => s.findings_count,
      sortable: true,
      cell: (s) => (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{s.findings_count}</span>
          {s.critical_count > 0 && (
            <Badge className={`${SEVERITY_BADGE.critical} border text-xs`}>
              {s.critical_count} crit
            </Badge>
          )}
          {s.high_count > 0 && (
            <Badge className={`${SEVERITY_BADGE.high} border text-xs`}>
              {s.high_count} high
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "completed_at",
      header: "Completed",
      accessor: (s) => s.completed_at ?? s.created_at,
      sortable: true,
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (s) => (
        <Link
          href={`/security/scans/${s.id}`}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          View findings
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4" data-testid="artifact-scans-section">
      <div className="flex items-center gap-3">
        <ShieldAlert className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Scan Results</h3>
        {scans.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {scans.length} scan{scans.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <AlertTriangle className="size-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-400">
              Could not load scan results
            </p>
            <p className="text-xs text-red-700 dark:text-red-500 mt-1">
              {error instanceof Error
                ? error.message
                : "Unable to load scan results for this artifact."}
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : scans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="size-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No security scans have been run against this artifact yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Trigger a scan from the artifact actions menu to populate this section.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={scans}
          page={1}
          pageSize={scans.length}
          total={scans.length}
          onPageChange={() => {}}
          emptyMessage="No scan results"
          rowKey={(s) => s.id}
        />
      )}
    </div>
  );
}
