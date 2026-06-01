"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Hourglass,
  Loader2,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import ageGateApi, { type AgeGateReview } from "@/lib/api/age-gate";
import { mutationErrorToast } from "@/lib/error-utils";
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

function StatusBadge({ status }: { status: AgeGateReview["status"] }) {
  const colors =
    status === "pending"
      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
      : status === "approved"
        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
        : "border-red-500/40 text-red-700 dark:text-red-400";
  return (
    <Badge variant="outline" className={`border font-medium capitalize ${colors}`}>
      {status}
    </Badge>
  );
}

function packageAgeDays(review: AgeGateReview): string {
  if (!review.upstream_published_at) return "—";
  const published = new Date(review.upstream_published_at).getTime();
  const days = Math.max(0, Math.floor((Date.now() - published) / 86_400_000));
  return `${days}d`;
}

export default function AgeGatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const perPage = 20;
  const [actionDialog, setActionDialog] = useState<{
    type: "approve" | "reject";
    review: AgeGateReview;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["age-gate", "reviews", "pending", pendingPage],
    queryFn: () =>
      ageGateApi.listReviews({
        status: "pending",
        page: pendingPage,
        per_page: perPage,
      }),
    enabled: !!user?.is_admin,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["age-gate", "reviews", "history", historyPage],
    queryFn: () =>
      ageGateApi.listReviews({
        page: historyPage,
        per_page: perPage,
      }),
    enabled: !!user?.is_admin && activeTab === "history",
  });

  const pendingItems = pendingData?.items ?? [];
  const historyItems =
    historyData?.items.filter((item) => item.status !== "pending") ?? [];
  const pendingTotal = pendingData?.pagination?.total ?? 0;

  const approveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      ageGateApi.approve(id, reason),
    onSuccess: () => {
      toast.success("Package version approved");
      queryClient.invalidateQueries({ queryKey: ["age-gate"] });
      setActionDialog(null);
      setActionReason("");
    },
    onError: mutationErrorToast("Failed to approve review"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      ageGateApi.reject(id, reason),
    onSuccess: () => {
      toast.success("Package version rejected");
      queryClient.invalidateQueries({ queryKey: ["age-gate"] });
      setActionDialog(null);
      setActionReason("");
    },
    onError: mutationErrorToast("Failed to reject review"),
  });

  const isActioning = approveMutation.isPending || rejectMutation.isPending;

  function handleAction() {
    if (!actionDialog) return;
    const reason = actionReason.trim() || undefined;
    if (actionDialog.type === "approve") {
      approveMutation.mutate({ id: actionDialog.review.id, reason });
    } else {
      rejectMutation.mutate({ id: actionDialog.review.id, reason });
    }
  }

  if (!user?.is_admin) {
    return (
      <EmptyState
        icon={Hourglass}
        title="Admin access required"
        description="You need administrator privileges to manage the age gate review queue."
      />
    );
  }

  const pendingColumns: DataTableColumn<AgeGateReview>[] = [
    {
      id: "repository",
      header: "Repository",
      accessor: (row) => row.repository_key,
    },
    {
      id: "package",
      header: "Package",
      cell: (row) => (
        <span className="font-mono text-sm">
          {row.package_name}@{row.package_version}
        </span>
      ),
    },
    {
      id: "published",
      header: "Published",
      cell: (row) =>
        row.upstream_published_at ? formatDate(row.upstream_published_at) : "—",
    },
    {
      id: "age",
      header: "Age",
      cell: (row) => packageAgeDays(row),
    },
    {
      id: "requests",
      header: "Requests",
      accessor: (row) => row.request_count,
    },
    {
      id: "requested",
      header: "Last requested",
      cell: (row) => formatDate(row.last_requested_at),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActionDialog({ type: "approve", review: row })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setActionDialog({ type: "reject", review: row })}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  const historyColumns: DataTableColumn<AgeGateReview>[] = [
    ...pendingColumns.filter((c) => c.id !== "actions"),
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Age Gate"
        description="Review proxy packages younger than the configured age threshold before they are served to clients."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending reviews"
          value={pendingTotal}
          icon={Clock}
          description="Awaiting admin decision"
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "pending" | "history")}
      >
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {pendingLoading ? (
            <DataTable columns={pendingColumns} data={[]} loading />
          ) : pendingItems.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No pending reviews"
              description="Young package versions will appear here when clients request them through an age-gated proxy."
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
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {historyLoading ? (
            <DataTable columns={historyColumns} data={[]} loading />
          ) : historyItems.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No review history"
              description="Approved and rejected reviews will appear here."
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
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" ? "Approve package" : "Reject package"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.review.package_name}@{actionDialog?.review.package_version}{" "}
              in {actionDialog?.review.repository_key}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Notes for the audit trail"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={actionDialog?.type === "reject" ? "destructive" : "default"}
              disabled={isActioning}
              onClick={handleAction}
            >
              {isActioning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : actionDialog?.type === "approve" ? (
                <>
                  <CheckCircle2 className="size-4" /> Approve
                </>
              ) : (
                <>
                  <XCircle className="size-4" /> Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
