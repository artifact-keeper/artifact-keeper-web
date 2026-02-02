"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

import securityApi from "@/lib/api/security";
import apiClient from "@/lib/api-client";
import type { ScanResult } from "@/types/security";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- status & severity color maps --

const STATUS_COLORS: Record<string, string> = {
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  running:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  pending:
    "bg-secondary text-secondary-foreground border-border",
  failed:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const SEVERITY_PILL: Record<string, string> = {
  critical:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function SeverityCount({
  count,
  label,
  level,
}: {
  count: number;
  label: string;
  level: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${SEVERITY_PILL[level] ?? ""}`}
    >
      {count}
      {label}
    </span>
  );
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function SecurityScansPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // -- filter state --
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  // -- trigger scan dialog --
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>(
    undefined
  );

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "security",
      "scans",
      page,
      pageSize,
      statusFilter === "__all__" ? undefined : statusFilter,
    ],
    queryFn: () =>
      securityApi.listScans({
        page,
        per_page: pageSize,
        status: statusFilter === "__all__" ? undefined : statusFilter,
      }),
  });

  const { data: repos } = useQuery({
    queryKey: ["repositories-for-scan"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/v1/repositories", {
        params: { per_page: 100 },
      });
      return data?.items ?? data ?? [];
    },
    enabled: triggerOpen,
  });

  const { data: scanConfigs } = useQuery({
    queryKey: ["security", "scan-configs"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/v1/security/configs");
      return new Set(
        ((data as Array<{ repository_id: string }>) ?? []).map(
          (c) => c.repository_id
        )
      );
    },
    enabled: triggerOpen,
  });

  const triggerScanMutation = useMutation({
    mutationFn: securityApi.triggerScan,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["security", "scans"] });
      setTriggerOpen(false);
      setSelectedRepoId(undefined);
      toast.success(`Scan queued for ${res.artifacts_queued} artifact(s).`);
    },
  });

  // -- table columns --
  const columns: DataTableColumn<ScanResult>[] = [
    {
      id: "status",
      header: "Status",
      accessor: (r) => r.status,
      cell: (r) => (
        <Badge
          variant="outline"
          className={`border font-medium capitalize text-xs ${STATUS_COLORS[r.status] ?? ""}`}
        >
          {r.status}
        </Badge>
      ),
    },
    {
      id: "scan_type",
      header: "Scanner",
      accessor: (r) => r.scan_type,
      cell: (r) => (
        <Badge variant="secondary" className="text-xs font-normal">
          {r.scan_type}
        </Badge>
      ),
    },
    {
      id: "artifact",
      header: "Artifact",
      cell: (r) =>
        r.artifact_name ? (
          <span className="text-sm">
            <span className="font-medium">{r.artifact_name}</span>
            {r.artifact_version && (
              <span className="text-muted-foreground ml-1">
                {r.artifact_version}
              </span>
            )}
          </span>
        ) : (
          <code className="text-xs">{r.artifact_id.slice(0, 12)}...</code>
        ),
    },
    {
      id: "findings",
      header: "Findings",
      accessor: (r) => r.findings_count,
      sortable: true,
      cell: (r) =>
        r.findings_count === 0 ? (
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs font-medium"
          >
            Clean
          </Badge>
        ) : (
          <div className="flex items-center gap-1">
            <SeverityCount
              count={r.critical_count}
              label="C"
              level="critical"
            />
            <SeverityCount count={r.high_count} label="H" level="high" />
            <SeverityCount count={r.medium_count} label="M" level="medium" />
            <SeverityCount count={r.low_count} label="L" level="low" />
          </div>
        ),
    },
    {
      id: "started_at",
      header: "Started",
      accessor: (r) => r.started_at ?? "",
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.started_at ? new Date(r.started_at).toLocaleString() : "-"}
        </span>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDuration(r.started_at, r.completed_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/security/scans/${r.id}`);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan Results"
        description="View and manage security scan results across all repositories."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["security", "scans"],
                })
              }
            >
              <RefreshCw
                className={`size-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <Button onClick={() => setTriggerOpen(true)}>
              <Zap className="size-4" />
              Trigger Scan
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {statusFilter !== "__all__" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("__all__");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        loading={isLoading}
        emptyMessage="No scan results found."
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/security/scans/${r.id}`)}
      />

      {/* Trigger Scan Dialog */}
      <Dialog
        open={triggerOpen}
        onOpenChange={(o) => {
          setTriggerOpen(o);
          if (!o) setSelectedRepoId(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trigger Security Scan</DialogTitle>
            <DialogDescription>
              Select a repository to scan all its artifacts for vulnerabilities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Repository</Label>
              <Select
                value={selectedRepoId ?? ""}
                onValueChange={(v) => setSelectedRepoId(v || undefined)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a repository..." />
                </SelectTrigger>
                <SelectContent>
                  {(
                    (repos as Array<{
                      id: string;
                      name: string;
                      key: string;
                      format: string;
                    }>) ?? []
                  ).map((r) => {
                    const enabled = scanConfigs?.has(r.id) ?? true;
                    return (
                      <SelectItem
                        key={r.id}
                        value={r.id}
                        disabled={!enabled}
                      >
                        {r.name || r.key} ({r.format})
                        {!enabled && " -- scanning disabled"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTriggerOpen(false);
                setSelectedRepoId(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedRepoId || triggerScanMutation.isPending}
              onClick={() => {
                if (selectedRepoId) {
                  triggerScanMutation.mutate({
                    repository_id: selectedRepoId,
                  });
                }
              }}
            >
              {triggerScanMutation.isPending ? "Starting..." : "Start Scan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
