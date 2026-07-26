"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hourglass, Check, X, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import ageGateApi, { type AgeGateReview } from "@/lib/api/age-gate";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

const STATUSES = ["pending", "approved", "rejected"] as const;

/** How far a held release fell short of its repository's minimum age. */
function formatAge(review: AgeGateReview, minAgeDays: number | undefined): string {
  const age = review.ageDaysAtRequest === null ? "—" : `${review.ageDaysAtRequest}d old`;
  if (minAgeDays === undefined) return age;
  return `${age} (min ${minAgeDays}d)`;
}

export default function AgeGatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<string>("pending");
  const [actionTarget, setActionTarget] = useState<
    { review: AgeGateReview; action: "approve" | "reject" } | null
  >(null);
  const [reason, setReason] = useState("");

  const reviewsQueryKey = ["age-gate-reviews", status];
  const {
    data: reviews,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: reviewsQueryKey,
    queryFn: () => ageGateApi.listReviews({ status }),
    enabled: !!user?.is_admin,
  });

  const rows = reviews ?? [];
  const repositoryKeys = useMemo(
    () => [...new Set((reviews ?? []).map((r) => r.repositoryKey))],
    [reviews],
  );

  const { data: repoConfigs } = useQuery({
    queryKey: ["age-gate-repo-configs", repositoryKeys],
    queryFn: () => ageGateApi.getRepoConfigs(repositoryKeys),
    enabled: !!user?.is_admin && repositoryKeys.length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["age-gate-reviews"] });
  };

  const closeDialog = () => {
    setActionTarget(null);
    setReason("");
  };

  const actionMutation = useMutation({
    mutationFn: ({
      review,
      action,
      why,
    }: {
      review: AgeGateReview;
      action: "approve" | "reject";
      why: string;
    }) =>
      action === "approve"
        ? ageGateApi.approveReview(review.id, why || undefined)
        : ageGateApi.rejectReview(review.id, why || undefined),
    onSuccess: (_result, { review, action }) => {
      invalidate();
      closeDialog();
      toast.success(
        `${action === "approve" ? "Approved" : "Rejected"} ${review.packageName}@${review.packageVersion}`,
      );
    },
    onError: mutationErrorToast("Age gate review failed"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Hourglass className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">The age gate review queue requires administrator access.</p>
      </div>
    );
  }

  const canApprove = status !== "approved";
  const canReject = status !== "rejected";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Hourglass className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Age Gate Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            Review upstream releases held back for being younger than a repository&apos;s minimum age.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load the age gate queue</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No {status} releases in the age gate queue.
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Age at request</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.packageName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.packageVersion}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{r.repositoryKey}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatAge(r, repoConfigs?.[r.repositoryKey]?.minAgeDays)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(r.requestedAt)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={r.status === "rejected" ? "destructive" : r.status === "approved" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {canApprove && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Approve ${r.packageName}`}
                          onClick={() => setActionTarget({ review: r, action: "approve" })}
                        >
                          <Check className="size-4 text-emerald-600" />
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Reject ${r.packageName}`}
                          onClick={() => setActionTarget({ review: r, action: "reject" })}
                        >
                          <X className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={actionTarget !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === "approve" ? "Approve" : "Reject"} {actionTarget?.review.packageName}@{actionTarget?.review.packageVersion}
            </DialogTitle>
            <DialogDescription>
              A reason is recorded in the audit log for this decision.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Reason"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button
              variant={actionTarget?.action === "reject" ? "destructive" : "default"}
              disabled={actionMutation.isPending}
              onClick={() =>
                actionTarget &&
                actionMutation.mutate({ review: actionTarget.review, action: actionTarget.action, why: reason.trim() })
              }
            >
              {actionMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
