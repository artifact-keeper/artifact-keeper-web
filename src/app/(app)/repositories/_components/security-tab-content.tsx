"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

import sbomApi from "@/lib/api/sbom";
import type { CveHistoryEntry, CveStatus } from "@/types/sbom";
import type { Artifact } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

interface SecurityTabContentProps {
  artifact: Artifact;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "text-red-600 bg-red-100 dark:bg-red-950/40",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-950/40",
  medium: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/40",
  low: "text-blue-600 bg-blue-100 dark:bg-blue-950/40",
};

const STATUS_CONFIG: Record<string, { icon: typeof ShieldAlert; color: string; label: string }> = {
  open: { icon: ShieldAlert, color: "text-red-500", label: "Open" },
  fixed: { icon: ShieldCheck, color: "text-green-500", label: "Fixed" },
  acknowledged: { icon: Eye, color: "text-yellow-500", label: "Acknowledged" },
  false_positive: { icon: XCircle, color: "text-muted-foreground", label: "False Positive" },
};

export function SecurityTabContent({ artifact }: SecurityTabContentProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: cveHistory, isLoading } = useQuery({
    queryKey: ["cve-history", artifact.id],
    queryFn: () => sbomApi.getCveHistory(artifact.id),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ cveId, status, reason }: { cveId: string; status: CveStatus; reason?: string }) =>
      sbomApi.updateCveStatus(cveId, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cve-history", artifact.id] });
      toast.success("CVE status updated");
    },
    onError: (err: Error) => {
      toast.error(`Failed to update CVE status: ${err.message}`);
    },
  });

  // Compute severity breakdown
  const breakdown = (cveHistory ?? []).reduce(
    (acc, cve) => {
      const sev = (cve.severity?.toLowerCase() ?? "low") as keyof typeof acc.severity;
      if (sev in acc.severity) acc.severity[sev]++;
      const status = cve.status as keyof typeof acc.status;
      if (status in acc.status) acc.status[status]++;
      return acc;
    },
    {
      severity: { critical: 0, high: 0, medium: 0, low: 0 },
      status: { open: 0, fixed: 0, acknowledged: 0, false_positive: 0 },
    },
  );

  const total = cveHistory?.length ?? 0;

  // Sort by severity (critical first), then by date
  const sortedCves = [...(cveHistory ?? [])].sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity?.toLowerCase() ?? "low"] ?? 3;
    const sevB = SEVERITY_ORDER[b.severity?.toLowerCase() ?? "low"] ?? 3;
    if (sevA !== sevB) return sevA - sevB;
    return new Date(b.first_detected_at).getTime() - new Date(a.first_detected_at).getTime();
  });

  const columns: DataTableColumn<CveHistoryEntry>[] = [
    {
      id: "cve_id",
      header: "CVE ID",
      accessor: (c) => c.cve_id,
      sortable: true,
      cell: (c) => <span className="font-medium text-sm font-mono">{c.cve_id}</span>,
    },
    {
      id: "severity",
      header: "Severity",
      accessor: (c) => SEVERITY_ORDER[c.severity?.toLowerCase() ?? "low"] ?? 3,
      sortable: true,
      cell: (c) => (
        <Badge variant="outline" className={`text-xs uppercase ${SEVERITY_BADGE[c.severity?.toLowerCase() ?? ""] ?? ""}`}>
          {c.severity ?? "Unknown"}
        </Badge>
      ),
    },
    {
      id: "component",
      header: "Component",
      accessor: (c) => c.affected_component ?? "",
      cell: (c) => (
        <div className="max-w-[180px]">
          <span className="text-sm truncate block">{c.affected_component ?? "-"}</span>
          {c.affected_version && (
            <span className="text-xs text-muted-foreground">@ {c.affected_version}</span>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (c) => c.status,
      cell: (c) => {
        const config = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-1.5">
            <Icon className={`size-3.5 ${config.color}`} />
            <span className="text-xs capitalize">{config.label}</span>
          </div>
        );
      },
    },
    {
      id: "cvss",
      header: "CVSS",
      accessor: (c) => c.cvss_score ?? 0,
      sortable: true,
      cell: (c) =>
        c.cvss_score != null ? (
          <span className="text-sm font-medium tabular-nums">{c.cvss_score.toFixed(1)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: "detected",
      header: "Detected",
      accessor: (c) => c.first_detected_at,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {new Date(c.first_detected_at).toLocaleDateString()}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" disabled={updateStatusMutation.isPending}>
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ cveId: c.id, status: "acknowledged", reason: "Acknowledged via UI" })}
              disabled={c.status === "acknowledged"}
            >
              <Eye className="size-4 mr-2 text-yellow-500" />
              Acknowledge
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ cveId: c.id, status: "false_positive", reason: "Marked as false positive" })}
              disabled={c.status === "false_positive"}
            >
              <XCircle className="size-4 mr-2 text-muted-foreground" />
              False Positive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ cveId: c.id, status: "fixed" })}
              disabled={c.status === "fixed"}
            >
              <CheckCircle2 className="size-4 mr-2 text-green-500" />
              Mark Fixed
            </DropdownMenuItem>
            {c.status !== "open" && (
              <DropdownMenuItem
                onClick={() => updateStatusMutation.mutate({ cveId: c.id, status: "open" })}
              >
                <ShieldAlert className="size-4 mr-2 text-red-500" />
                Reopen
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Security Vulnerabilities</h3>
        {total > 0 && (
          <Badge variant="secondary" className="text-xs">
            {total} total
          </Badge>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldCheck className="size-12 text-green-500/50 mb-4" />
          <p className="text-sm text-muted-foreground">
            No vulnerabilities detected for this artifact.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate an SBOM and run a security scan to check for CVEs.
          </p>
        </div>
      ) : (
        <>
          {/* Severity Breakdown Bar */}
          <div className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {(["critical", "high", "medium", "low"] as const).map((sev) => {
                const count = breakdown.severity[sev];
                if (count === 0) return null;
                const pct = (count / total) * 100;
                return (
                  <div
                    key={sev}
                    className={`${SEVERITY_COLORS[sev]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${sev}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="flex gap-4 flex-wrap">
              {(["critical", "high", "medium", "low"] as const).map((sev) => (
                <div key={sev} className="flex items-center gap-1.5 text-xs">
                  <div className={`size-2.5 rounded-full ${SEVERITY_COLORS[sev]}`} />
                  <span className="capitalize">{sev}</span>
                  <span className="font-medium">{breakdown.severity[sev]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG.open][]).map(([key, config]) => {
              const Icon = config.icon;
              const count = breakdown.status[key as keyof typeof breakdown.status] ?? 0;
              return (
                <div key={key} className="flex items-center gap-2 rounded-lg border bg-card p-3">
                  <Icon className={`size-4 ${config.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                    <p className="text-lg font-semibold">{count}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CVE Table */}
          <DataTable
            columns={columns}
            data={sortedCves}
            page={page}
            pageSize={10}
            total={sortedCves.length}
            onPageChange={setPage}
            emptyMessage="No CVEs found"
            rowKey={(c) => c.id}
          />
        </>
      )}
    </div>
  );
}
