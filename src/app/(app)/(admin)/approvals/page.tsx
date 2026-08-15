"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { approvalsApi } from "@/lib/api/approvals";
import { mutationErrorToast } from "@/lib/error-utils";
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
  const t = useTranslations("admin.approvals");
  const result = request.policy_result;
  if (!result) {
    return (
      <span className="text-sm text-muted-foreground">{t("noPolicyData")}</span>
    );
  }

  const violationCount = result.violations?.length ?? 0;

  if (result.passed) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm text-emerald-700 dark:text-emerald-400">
          {t("policyPassed")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <ShieldAlert className="size-3.5 text-red-600 dark:text-red-400" />
      <span className="text-sm text-red-700 dark:text-red-400">
        {t("violationCount", { count: violationCount })}
      </span>
    </div>
  );
}

const STATUS_LABELS: Record<ApprovalRequest["status"], string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

function ApprovalStatusBadge({ status }: { status: ApprovalRequest["status"] }) {
  const t = useTranslations("admin.approvals");
  const colors = APPROVAL_STATUS_COLORS[status];
  return (
    <Badge
      variant="outline"
      className={`border font-medium capitalize ${colors}`}
    >
      {t(STATUS_LABELS[status])}
    </Badge>
  );
}

// -- page --

export default function ApprovalsPage() {
  const t = useTranslations("admin.approvals");
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

  function resetActionDialog() {
    setActionDialog(null);
    setActionNotes("");
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approvalsApi.approve(id, notes),
    onSuccess: () => {
      toast.success(t("toastApproved"));
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      resetActionDialog();
    },
    onError: mutationErrorToast(t("toastApproveFailed")),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approvalsApi.reject(id, notes),
    onSuccess: () => {
      toast.success(t("toastRejected"));
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      resetActionDialog();
    },
    onError: mutationErrorToast(t("toastRejectFailed")),
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
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
        </Alert>
      </div>
    );
  }

  // -- shared column definitions --

  const artifactColumn: DataTableColumn<ApprovalRequest> = {
    id: "artifact",
    header: t("colArtifact"),
    accessor: (r) => r.artifact_id,
    cell: (r) => (
      <span className="text-sm font-medium font-mono truncate max-w-[200px] block">
        {r.artifact_id}
      </span>
    ),
  };

  const promotionPathColumn: DataTableColumn<ApprovalRequest> = {
    id: "promotion_path",
    header: t("colPromotionPath"),
    accessor: (r) => r.source_repository,
    cell: (r) => (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-medium">{r.source_repository}</span>
        <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{r.target_repository}</span>
      </div>
    ),
  };

  // -- pending table columns --

  const pendingColumns: DataTableColumn<ApprovalRequest>[] = [
    artifactColumn,
    promotionPathColumn,
    {
      id: "requested_by",
      header: t("colRequestedBy"),
      accessor: (r) => r.requested_by,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.requested_by}</span>
      ),
    },
    {
      id: "requested_at",
      header: t("colRequested"),
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
      header: t("colPolicy"),
      cell: (r) => <PolicySummary request={r} />,
    },
    {
      id: "actions",
      header: t("colActions"),
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
            {t("approve")}
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
            {t("reject")}
          </Button>
        </div>
      ),
    },
  ];

  // -- history table columns --

  const historyColumns: DataTableColumn<ApprovalRequest>[] = [
    artifactColumn,
    promotionPathColumn,
    {
      id: "status",
      header: t("colStatus"),
      accessor: (r) => r.status,
      sortable: true,
      cell: (r) => <ApprovalStatusBadge status={r.status} />,
    },
    {
      id: "requested_by",
      header: t("colRequestedBy"),
      accessor: (r) => r.requested_by,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.requested_by}</span>
      ),
    },
    {
      id: "reviewed_by",
      header: t("colReviewedBy"),
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
      header: t("colReviewed"),
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
      header: t("colNotes"),
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
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("refreshAria")}
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
            label={t("statPending")}
            value={pendingTotal}
            color={pendingTotal > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={CheckCircle2}
            label={t("statApproved")}
            value={historyData?.items?.filter((i) => i.status === "approved").length ?? 0}
            color="green"
          />
          <StatCard
            icon={XCircle}
            label={t("statRejected")}
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
            {t("tabPending")}
            {pendingTotal > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 text-xs tabular-nums"
              >
                {pendingTotal}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">{t("tabHistory")}</TabsTrigger>
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
              title={t("emptyPendingTitle")}
              description={t("emptyPendingDescription")}
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
              emptyMessage={t("emptyPendingMessage")}
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">
              {t("filterByStatus")}
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
                <SelectItem value="__all__">{t("filterAll")}</SelectItem>
                <SelectItem value="approved">{t("filterApproved")}</SelectItem>
                <SelectItem value="rejected">{t("filterRejected")}</SelectItem>
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
              title={t("emptyHistoryTitle")}
              description={t("emptyHistoryDescription")}
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
              emptyMessage={t("emptyHistoryMessage")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Approve / Reject Dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(open) => {
          if (!open) resetActionDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve"
                ? t("dialogApproveTitle")
                : t("dialogRejectTitle")}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "approve"
                ? t("dialogApproveDescription")
                : t("dialogRejectDescription")}
            </DialogDescription>
          </DialogHeader>

          {actionDialog && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("dialogArtifact")}</span>
                  <span className="font-mono text-xs">
                    {actionDialog.request.artifact_id}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("dialogFrom")}</span>
                  <span className="font-medium">
                    {actionDialog.request.source_repository}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("dialogTo")}</span>
                  <span className="font-medium">
                    {actionDialog.request.target_repository}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("dialogRequestedBy")}</span>
                  <span>{actionDialog.request.requested_by}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action-notes">{t("notesLabel")}</Label>
                <Textarea
                  id="action-notes"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={
                    actionDialog.type === "approve"
                      ? t("notesPlaceholderApprove")
                      : t("notesPlaceholderReject")
                  }
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetActionDialog}
              disabled={isActioning}
            >
              {t("cancel")}
            </Button>
            <Button
              variant={actionDialog?.type === "approve" ? "default" : "destructive"}
              onClick={handleAction}
              disabled={isActioning}
            >
              {isActioning && (
                <Loader2 className="size-4 mr-1 animate-spin" />
              )}
              {actionDialog?.type === "approve" ? t("approve") : t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
