"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  Undo2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Info,
  Bug,
} from "lucide-react";
import { toast } from "sonner";

import securityApi from "@/lib/api/security";
import type { ScanFinding } from "@/types/security";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

import { StatCard } from "@/components/common/stat-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- constants --

const STATUS_BADGE: Record<string, string> = {
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  running:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  pending: "bg-secondary text-secondary-foreground border-border",
  failed:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  medium:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  info: "bg-secondary text-secondary-foreground border-border",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const ACK_REASONS = [
  { value: "false_positive", label: "False Positive" },
  { value: "risk_accepted", label: "Risk Accepted" },
  { value: "mitigated", label: "Mitigated" },
  { value: "other", label: "Other" },
];

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function SecurityScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // -- pagination & filter --
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [severityFilter, setSeverityFilter] = useState<string>("__all__");

  // -- acknowledge dialog --
  const [ackOpen, setAckOpen] = useState(false);
  const [ackFindingId, setAckFindingId] = useState<string | null>(null);
  const [ackReason, setAckReason] = useState("risk_accepted");
  const [ackNotes, setAckNotes] = useState("");

  // -- revoke dialog --
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeFindingId, setRevokeFindingId] = useState<string | null>(null);

  // -- queries --
  const { data: scan, isLoading: scanLoading } = useQuery({
    queryKey: ["security", "scan", id],
    queryFn: () => securityApi.getScan(id!),
    enabled: !!id,
  });

  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: ["security", "findings", id, page, pageSize],
    queryFn: () =>
      securityApi.listFindings(id!, { page, per_page: pageSize }),
    enabled: !!id,
  });

  // -- mutations --
  const acknowledgeMutation = useMutation({
    mutationFn: ({
      findingId,
      reason,
    }: {
      findingId: string;
      reason: string;
    }) => securityApi.acknowledgeFinding(findingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["security", "findings", id],
      });
      queryClient.invalidateQueries({ queryKey: ["security", "scan", id] });
      setAckOpen(false);
      setAckReason("risk_accepted");
      setAckNotes("");
      setAckFindingId(null);
      toast.success("Finding acknowledged.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: securityApi.revokeAcknowledgment,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["security", "findings", id],
      });
      queryClient.invalidateQueries({ queryKey: ["security", "scan", id] });
      setRevokeOpen(false);
      setRevokeFindingId(null);
      toast.success("Acknowledgment revoked.");
    },
  });

  // -- filter findings by severity locally --
  const allFindings = findingsData?.items ?? [];
  const filteredFindings =
    severityFilter === "__all__"
      ? allFindings
      : allFindings.filter((f) => f.severity === severityFilter);

  // -- table columns --
  const columns: DataTableColumn<ScanFinding>[] = [
    {
      id: "severity",
      header: "Severity",
      accessor: (r) => SEVERITY_ORDER[r.severity] ?? 5,
      sortable: true,
      cell: (r) => (
        <Badge
          variant="outline"
          className={`border font-semibold uppercase text-xs ${SEVERITY_BADGE[r.severity] ?? ""}`}
        >
          {r.severity}
        </Badge>
      ),
    },
    {
      id: "title",
      header: "Title",
      accessor: (r) => r.title,
      sortable: true,
      cell: (r) => (
        <div className="max-w-xs">
          <p className="text-sm font-medium truncate">{r.title}</p>
          {r.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {r.description}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "component",
      header: "Package",
      accessor: (r) => r.affected_component ?? "",
      cell: (r) => (
        <span className="text-sm">
          {r.affected_component ?? "-"}
        </span>
      ),
    },
    {
      id: "installed_version",
      header: "Installed",
      cell: (r) =>
        r.affected_version ? (
          <code className="text-xs text-red-600 dark:text-red-400">
            {r.affected_version}
          </code>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "fixed_version",
      header: "Fixed",
      cell: (r) =>
        r.fixed_version ? (
          <code className="text-xs text-emerald-600 dark:text-emerald-400">
            {r.fixed_version}
          </code>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "cve_id",
      header: "CVE",
      accessor: (r) => r.cve_id ?? "",
      cell: (r) =>
        r.cve_id ? (
          <a
            href={`https://nvd.nist.gov/vuln/detail/${r.cve_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.cve_id}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) =>
        r.is_acknowledged ? (
          <Badge
            variant="outline"
            className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 text-xs font-medium"
          >
            <CheckCircle className="size-3 mr-1" />
            Acknowledged
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-xs font-medium"
          >
            Open
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) =>
        r.is_acknowledged ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setRevokeFindingId(r.id);
              setRevokeOpen(true);
            }}
          >
            <Undo2 className="size-3.5 mr-1" />
            Revoke
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setAckFindingId(r.id);
              setAckOpen(true);
            }}
          >
            <CheckCircle className="size-3.5 mr-1" />
            Acknowledge
          </Button>
        ),
    },
  ];

  // -- loading state --
  if (scanLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => router.push("/security/scans")}
        >
          <ArrowLeft className="size-4 mr-1" />
          Scans
        </Button>
        <span>/</span>
        <span className="font-medium text-foreground">
          Scan #{id?.slice(0, 8)}
        </span>
      </div>

      {/* Scan metadata header */}
      {scan && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge
                  variant="outline"
                  className={`border font-medium capitalize text-xs ${STATUS_BADGE[scan.status] ?? ""}`}
                >
                  {scan.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Scanner</p>
                <Badge variant="secondary" className="text-xs font-normal">
                  {scan.scan_type}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Artifact
                </p>
                <p className="text-sm font-medium">
                  {scan.artifact_name ?? scan.artifact_id.slice(0, 12)}
                  {scan.artifact_version && (
                    <span className="text-muted-foreground ml-1">
                      {scan.artifact_version}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Duration
                </p>
                <p className="text-sm">
                  {formatDuration(scan.started_at, scan.completed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Started</p>
                <p className="text-sm">
                  {scan.started_at
                    ? new Date(scan.started_at).toLocaleString()
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Completed
                </p>
                <p className="text-sm">
                  {scan.completed_at
                    ? new Date(scan.completed_at).toLocaleString()
                    : "-"}
                </p>
              </div>
              {scan.error_message && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Error</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {scan.error_message}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stat cards */}
      {scan && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={Bug}
            label="Total Findings"
            value={scan.findings_count}
            color={scan.findings_count > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={AlertCircle}
            label="Critical"
            value={scan.critical_count}
            color={scan.critical_count > 0 ? "red" : "green"}
          />
          <StatCard
            icon={AlertTriangle}
            label="High"
            value={scan.high_count}
            color={scan.high_count > 0 ? "red" : "green"}
          />
          <StatCard
            icon={ShieldAlert}
            label="Medium"
            value={scan.medium_count}
            color={scan.medium_count > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={Info}
            label="Low"
            value={scan.low_count}
            color="blue"
          />
        </div>
      )}

      {/* Findings filter */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Findings</h2>
        <Select
          value={severityFilter}
          onValueChange={setSeverityFilter}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        {severityFilter !== "__all__" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSeverityFilter("__all__")}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Findings table */}
      <DataTable
        columns={columns}
        data={filteredFindings}
        total={
          severityFilter === "__all__"
            ? findingsData?.total
            : filteredFindings.length
        }
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        loading={findingsLoading}
        emptyMessage="No findings for this scan."
        rowKey={(r) => r.id}
      />

      {/* Acknowledge Finding Dialog */}
      <Dialog
        open={ackOpen}
        onOpenChange={(o) => {
          setAckOpen(o);
          if (!o) {
            setAckFindingId(null);
            setAckReason("risk_accepted");
            setAckNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledge Finding</DialogTitle>
            <DialogDescription>
              Acknowledging a finding marks it as an accepted risk. It will no
              longer count against the repository security score.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={ackReason} onValueChange={setAckReason}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACK_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={3}
                placeholder="Additional context for acknowledging this finding..."
                value={ackNotes}
                onChange={(e) => setAckNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAckOpen(false);
                setAckFindingId(null);
                setAckReason("risk_accepted");
                setAckNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={acknowledgeMutation.isPending}
              onClick={() => {
                if (ackFindingId) {
                  const reason = ackNotes.trim()
                    ? `${ackReason}: ${ackNotes.trim()}`
                    : ackReason;
                  acknowledgeMutation.mutate({
                    findingId: ackFindingId,
                    reason,
                  });
                }
              }}
            >
              {acknowledgeMutation.isPending
                ? "Acknowledging..."
                : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Acknowledgment Confirmation */}
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={(o) => {
          setRevokeOpen(o);
          if (!o) setRevokeFindingId(null);
        }}
        title="Revoke Acknowledgment"
        description="This finding will count against the repository security score again. Are you sure?"
        confirmText="Revoke"
        danger
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeFindingId) {
            revokeMutation.mutate(revokeFindingId);
          }
        }}
      />
    </div>
  );
}
