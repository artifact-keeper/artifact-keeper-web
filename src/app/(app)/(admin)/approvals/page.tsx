"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ClipboardCheck,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import approvalsApi from "@/lib/api/approvals";
import type { ApprovalRequest } from "@/types/promotion";
import { APPROVAL_STATUS_COLORS } from "@/types/promotion";
import { formatDate } from "@/lib/utils";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// -- helpers --

function PolicySummary({ request }: { request: ApprovalRequest }) {
  const result = request.policy_result;
  if (!result) {
    return (
      <span className="text-sm text-muted-foreground">No policy data</span>
    );
  }

  const violationCount = result.violations?.length ?? 0;

  if (result.passed) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm text-emerald-700 dark:text-emerald-400">
          Passed
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />
      <span className="text-sm text-red-700 dark:text-red-400">
        {violationCount} violation{violationCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ApprovalStatusBadge({ status }: { status: ApprovalRequest["status"] }) {
  const colors = APPROVAL_STATUS_COLORS[status];
  return (
    <Badge
      variant="outline"
      className={`border font-medium capitalize ${colors}`}
    >
      {status}
    </Badge>
  );
}

// -- page --

export default function ApprovalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  // Pagination
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const perPage = 20;

  // History filter
  const [historyStatus, setHistoryStatus] = useState<string>("__all__");

  // Dialog state
  const [actionDialog, setActionDialog] = useState<{
    type: "approve" | "reject";
    request: ApprovalRequest;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  // -- queries --

  const {
    data: pendingData,
    isLoading: pendingLoading,
  } = useQuery({
    queryKey: ["approvals", "pending", pendingPage],
    queryFn: () =>
      approvalsApi.listPending({
        page: pendingPage,
        per_page: perPage,
      }),
    enabled: !!user?.is_admin,
  });

  const {
    data: historyData,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ["approvals", "history", historyPage, historyStatus],
    queryFn: () =>
      approvalsApi.listHistory({
        page: historyPage,
        per_page: perPage,
        status: historyStatus !== "__all__" ? historyStatus : undefined,
      }),
    enabled: !!user?.is_admin && activeTab === "history",
  });

  const pendingItems = pendingData?.items ?? [];
  const historyItems = historyData?.items ?? [];
  const pendingTotal = pendingData?.pagination?.total ?? 0;

  // -- mutations --

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approvalsApi.approve(id, notes),
    onSuccess: () => {
      toast.success("Approval request approved");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setActionDialog(null);
      setActionNotes("");
    },
    onError: () => toast.error("Failed to approve request"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approvalsApi.reject(id, notes),
    onSuccess: () => {
      toast.success("Approval request rejected");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setActionDialog(null);
      setActionNotes("");
    },
    onError: () => toast.error("Failed to reject request"),
  });

  const isActioning = approveMutation.isPending || rejectMutation.isPending;

  // -- handlers --

  function handleAction() {
    if (!actionDialog) return;
    const { type, request } = actionDialog;
    const notes = actionNotes.trim() || undefined;
    if (type === "approve") {
      approveMutation.mutate({ id: request.id, notes });
    } else {
      rejectMutation.mutate({ id: request.id, notes });
    }
  }

  // -- access check --

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval Queue" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  // -- pending table columns --

  const pendingColumns: DataTableColumn<ApprovalRequest>[] = [
    {
      id: "artifact",
      header: "Artifact",
      accessor: (r) => r.artifact_id,
      cell: (r) => (
        <span className="text-sm font-medium font-mono truncate max-w-[200px] block">
          {r.artifact_id}
        </span>
      ),
    },
    {
      id: "promotion_path",
      header: "Promotion Path",
      accessor: (r) => r.source_repository,
      cell: (r) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium">{r.source_repository}</span>
          <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium">{r.target_repository}</span>
        </div>
      ),
    },
    {
      id: "requested_by",
      header: "Requested By",
      accessor: (r) => r.requested_by,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.requested_by}</span>
      ),
    },
    {
      id: "requested_at",
      header: "Requested",
      accessor: (r) => r.requested_at,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(r.requested_at)}
        </span>
      ),
    },
    {
      id: "policy",
      header: "Policy",
      cell: (r) => <PolicySummary request={r} />,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
            onClick={(e) => {
              e.stopPropagation();
              setActionDialog({ type: "approve", request: r });
            }}
          >
            <CheckCircle2 className="size-3.5 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/40"
            onClick={(e) => {
              e.stopPropagation();
              setActionDialog({ type: "reject", request: r });
            }}
          >
            <XCircle className="size-3.5 mr-1" />
            Reject
          </Button>
        </div>
      ),
    },
  ];

  // -- history table columns --

  const historyColumns: DataTableColumn<ApprovalRequest>[] = [
    {
      id: "artifact",
      header: "Artifact",
      accessor: (r) => r.artifact_id,
      cell: (r) => (
        <span className="text-sm font-medium font-mono truncate max-w-[200px] block">
          {r.artifact_id}
        </span>
      ),
    },
    {
      id: "promotion_path",
      header: "Promotion Path",
      accessor: (r) => r.source_repository,
      cell: (r) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium">{r.source_repository}</span>
          <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium">{r.target_repository}</span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (r) => r.status,
      sortable: true,
      cell: (r) => <ApprovalStatusBadge status={r.status} />,
    },
    {
      id: "requested_by",
      header: "Requested By",
      accessor: (r) => r.requested_by,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.requested_by}</span>
      ),
    },
    {
      id: "reviewed_by",
      header: "Reviewed By",
      accessor: (r) => r.reviewed_by ?? "",
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.reviewed_by ?? "-"}
        </span>
      ),
    },
    {
      id: "reviewed_at",
      header: "Reviewed",
      accessor: (r) => r.reviewed_at ?? "",
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.reviewed_at ? formatDate(r.reviewed_at) : "-"}
        </span>
      ),
    },
    {
      id: "review_notes",
      header: "Notes",
      cell: (r) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {r.review_notes || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Queue"
        description="Review and manage pending artifact promotion approval requests."
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["approvals"] })
            }
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      {/* Stats */}
      {pendingLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Clock}
            label="Pending Requests"
            value={pendingTotal}
            color={pendingTotal > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={CheckCircle2}
            label="Approved"
            value={historyData?.items?.filter((i) => i.status === "approved").length ?? 0}
            color="green"
          />
          <StatCard
            icon={XCircle}
            label="Rejected"
            value={historyData?.items?.filter((i) => i.status === "rejected").length ?? 0}
            color="red"
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "pending" | "history")}
      >
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingTotal > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 text-xs tabular-nums"
              >
                {pendingTotal}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-6">
          {pendingLoading ? (
            <DataTable
              columns={pendingColumns}
              data={[]}
              loading
            />
          ) : pendingItems.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No pending approvals"
              description="All promotion requests have been reviewed. New requests will appear here when artifacts are submitted for promotion."
            />
          ) : (
            <DataTable
              columns={pendingColumns}
              data={pendingItems}
              total={pendingData?.pagination?.total}
              page={pendingPage}
              pageSize={perPage}
              onPageChange={setPendingPage}
              rowKey={(r) => r.id}
              emptyMessage="No pending approval requests."
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">
              Filter by status
            </Label>
            <Select
              value={historyStatus}
              onValueChange={(v) => {
                setHistoryStatus(v);
                setHistoryPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {historyLoading ? (
            <DataTable
              columns={historyColumns}
              data={[]}
              loading
            />
          ) : historyItems.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No approval history"
              description="Completed approval reviews will appear here once requests have been approved or rejected."
            />
          ) : (
            <DataTable
              columns={historyColumns}
              data={historyItems}
              total={historyData?.pagination?.total}
              page={historyPage}
              pageSize={perPage}
              onPageChange={setHistoryPage}
              rowKey={(r) => r.id}
              emptyMessage="No approval history found."
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Approve / Reject Dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setActionNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve"
                ? "Approve Promotion"
                : "Reject Promotion"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "approve"
                ? "This will approve the artifact promotion from the source to the target repository."
                : "This will reject the artifact promotion request. The artifact will remain in the source repository."}
            </DialogDescription>
          </DialogHeader>

          {actionDialog && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Artifact</span>
                  <span className="font-mono text-xs">
                    {actionDialog.request.artifact_id}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium">
                    {actionDialog.request.source_repository}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium">
                    {actionDialog.request.target_repository}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Requested by</span>
                  <span>{actionDialog.request.requested_by}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action-notes">Notes (optional)</Label>
                <Textarea
                  id="action-notes"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={
                    actionDialog.type === "approve"
                      ? "Add any notes about this approval..."
                      : "Provide a reason for rejection..."
                  }
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setActionNotes("");
              }}
              disabled={isActioning}
            >
              Cancel
            </Button>
            <Button
              variant={actionDialog?.type === "approve" ? "default" : "destructive"}
              onClick={handleAction}
              disabled={isActioning}
            >
              {isActioning && (
                <Loader2 className="size-4 mr-1 animate-spin" />
              )}
              {actionDialog?.type === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
