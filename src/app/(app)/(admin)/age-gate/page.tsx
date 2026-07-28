"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hourglass, RefreshCw, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import ageGateApi, {
  AGE_GATE_STATUSES,
  AgeGatePartialTransitionError,
  type AgeGateReview,
  type AgeGateStatus,
} from "@/lib/api/age-gate";
import { adminApi } from "@/lib/api/admin";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

/** Colour the status control so a decided row still reads at a glance. */
const STATUS_TRIGGER_CLASS: Record<string, string> = {
  pending: "text-amber-600 dark:text-amber-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
};

/** How far a held release fell short of its repository's minimum age. */
function formatAge(review: AgeGateReview, minAgeDays: number | undefined): string {
  const age = review.ageDaysAtRequest === null ? "—" : `${review.ageDaysAtRequest}d old`;
  if (minAgeDays === undefined) return age;
  return `${age} (min ${minAgeDays}d)`;
}

/** "pending", "pending or approved", "pending, approved or rejected". */
function joinStatuses(statuses: readonly AgeGateStatus[]): string {
  if (statuses.length <= 1) return statuses[0] ?? "";
  return `${statuses.slice(0, -1).join(", ")} or ${statuses[statuses.length - 1]}`;
}

/** Past-tense verb for a completed transition, used in toasts. */
function transitionVerb(target: AgeGateStatus): string {
  if (target === "approved") return "Approved";
  if (target === "rejected") return "Rejected";
  return "Returned to pending";
}

/**
 * What a transition will do, said plainly enough that an admin can tell a
 * one-call decision from a reopen-then-decide before they commit to it.
 */
function describeTransition(from: string, to: AgeGateStatus): string {
  if (from === "pending") {
    return to === "approved"
      ? "This releases the version to any client that requests it. The review can be reopened later to withhold it again."
      : "The version stays withheld and clients requesting it keep getting the gate response.";
  }
  if (to === "pending") {
    return `This reverses the recorded ${from} decision and puts the version back behind the gate until someone decides it again.`;
  }
  return `This runs in two steps: the recorded ${from} decision is reversed first, then the review is ${to}. If the second step fails the review is left pending, not ${from}.`;
}

export default function AgeGatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statuses, setStatuses] = useState<AgeGateStatus[]>(["pending"]);
  const [transition, setTransition] = useState<
    { review: AgeGateReview; target: AgeGateStatus } | null
  >(null);
  const [reason, setReason] = useState("");

  // A reopen carries a mandatory reason, and every transition out of a decided
  // status starts with one. Deciding a pending review does not.
  const reasonRequired = transition !== null && transition.review.status !== "pending";
  const reasonMissing = reasonRequired && reason.trim() === "";

  const statusKey = [...statuses].sort().join(",");
  const {
    data: reviews,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["age-gate-reviews", statusKey],
    queryFn: () => ageGateApi.listReviews({ statuses }),
    enabled: !!user?.is_admin && statuses.length > 0,
  });

  const rows = useMemo(() => reviews ?? [], [reviews]);
  const repositoryKeys = useMemo(() => [...new Set(rows.map((r) => r.repositoryKey))], [rows]);

  const { data: repoConfigs } = useQuery({
    queryKey: ["age-gate-repo-configs", repositoryKeys],
    queryFn: () => ageGateApi.getRepoConfigs(repositoryKeys),
    enabled: !!user?.is_admin && repositoryKeys.length > 0,
  });

  // The review carries the reviewer's user id and nothing else, so the names
  // come from the admin user list. A failed lookup degrades to a short id
  // rather than hiding who decided.
  const hasReviewers = rows.some((r) => r.reviewedBy);
  const { data: users } = useQuery({
    queryKey: ["age-gate-reviewers"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!user?.is_admin && hasReviewers,
  });
  const reviewerNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const u of users ?? []) names[u.id] = u.display_name || u.username;
    return names;
  }, [users]);
  const reviewerName = (id: string) => reviewerNames[id] ?? `${id.slice(0, 8)}…`;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["age-gate-reviews"] });
  };

  const closeDialog = () => {
    setTransition(null);
    setReason("");
  };

  const toggleStatus = (status: AgeGateStatus, checked: boolean) => {
    setStatuses((current) =>
      checked
        ? AGE_GATE_STATUSES.filter((s) => s === status || current.includes(s))
        : current.filter((s) => s !== status),
    );
  };

  const changeStatusMutation = useMutation({
    mutationFn: ({
      review,
      target,
      why,
    }: {
      review: AgeGateReview;
      target: AgeGateStatus;
      why: string;
    }) => ageGateApi.changeReviewStatus(review, target, why),
    onSuccess: (_result, { review, target }) => {
      invalidate();
      closeDialog();
      toast.success(
        `${transitionVerb(target)} ${review.packageName}@${review.packageVersion}`,
      );
    },
    onError: (err, { review }) => {
      // A half-completed reopen-then-decide really did change the review, so
      // refetch and say what it is now. Reporting a plain failure here would
      // leave the operator believing the old decision still stands.
      if (err instanceof AgeGatePartialTransitionError) {
        invalidate();
        closeDialog();
        toast.error(
          `${review.packageName}@${review.packageVersion}: ${err.message} ${toUserMessage(err.failure, "The second step failed.")}`,
        );
        return;
      }
      mutationErrorToast("Age gate review failed")(err);
    },
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Hourglass className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">The age gate review queue requires administrator access.</p>
      </div>
    );
  }

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

      <div className="flex flex-wrap items-center gap-4">
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">Filter by status</legend>
          {AGE_GATE_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={statuses.includes(s)}
                onCheckedChange={(checked) => toggleStatus(s, checked === true)}
                aria-label={`Show ${s}`}
              />
              {s}
            </label>
          ))}
        </fieldset>

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

      {statuses.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Select at least one status to list reviews.
        </div>
      )}

      {statuses.length > 0 && isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {statuses.length > 0 && !isLoading && isError && (
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

      {statuses.length > 0 && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {statuses.length === AGE_GATE_STATUSES.length
            ? "No releases in the age gate queue."
            : `No ${joinStatuses(statuses)} releases in the age gate queue.`}
        </div>
      )}

      {statuses.length > 0 && !isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Age at request</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.reviewedBy || r.reviewedAt || r.reviewReason ? (
                      <div className="max-w-xs space-y-0.5">
                        {(r.reviewedBy || r.reviewedAt) && (
                          <div>
                            {r.reviewedBy ? reviewerName(r.reviewedBy) : "Unknown reviewer"}
                            {r.reviewedAt && (
                              <span title={r.reviewedAt}> on {formatDate(r.reviewedAt)}</span>
                            )}
                          </div>
                        )}
                        {r.reviewReason && <div className="italic">&ldquo;{r.reviewReason}&rdquo;</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">Not yet decided</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={r.status}
                      onValueChange={(v) => {
                        if (v === r.status) return;
                        setReason("");
                        setTransition({ review: r, target: v as AgeGateStatus });
                      }}
                    >
                      <SelectTrigger
                        className={`w-36 capitalize ${STATUS_TRIGGER_CLASS[r.status] ?? ""}`}
                        aria-label={`Status for ${r.packageName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_GATE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={transition !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transition?.target === "approved" && "Approve "}
              {transition?.target === "rejected" && "Reject "}
              {transition?.target === "pending" && "Return "}
              {transition?.review.packageName}@{transition?.review.packageVersion}
              {transition?.target === "pending" && " to pending"}
            </DialogTitle>
            <DialogDescription>
              {transition ? describeTransition(transition.review.status, transition.target) : null}
            </DialogDescription>
          </DialogHeader>

          {transition?.target === "approved" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Confirm you mean to release {transition.review.packageName}@
                {transition.review.packageVersion} into the estate.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1 py-2">
            <Textarea
              placeholder={reasonRequired ? "Reason (required)" : "Reason (optional)"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Reason"
              aria-describedby="age-gate-reason-help"
              aria-invalid={reasonMissing}
            />
            <p id="age-gate-reason-help" className="text-xs text-muted-foreground">
              {reasonRequired
                ? "Required. Reversing a recorded decision needs a reason for the audit log."
                : "Recorded in the audit log with this decision."}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button
              variant={transition?.target === "rejected" ? "destructive" : "default"}
              disabled={changeStatusMutation.isPending || reasonMissing}
              onClick={() =>
                transition &&
                changeStatusMutation.mutate({
                  review: transition.review,
                  target: transition.target,
                  why: reason.trim(),
                })
              }
            >
              {changeStatusMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
