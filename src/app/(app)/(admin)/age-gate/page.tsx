"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Hourglass, RefreshCw, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  ageGateApi,
  AGE_GATE_STATUSES,
  isReopenSupported,
  subscribeReopenSupport,
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
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";
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

/** Message-key lookup for the raw AgeGateStatus values. */
const STATUS_LABEL_KEYS: Record<AgeGateStatus, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

/** How far a held release fell short of its repository's minimum age. */
function formatAge(
  review: AgeGateReview,
  minAgeDays: number | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  const age =
    review.ageDaysAtRequest === null
      ? "—"
      : t("ageDaysOld", { days: review.ageDaysAtRequest });
  if (minAgeDays === undefined) return age;
  return `${age} ${t("minAgeSuffix", { min: minAgeDays })}`;
}

/** "pending", "pending or approved", "pending, approved or rejected". */
function joinStatuses(
  statuses: readonly AgeGateStatus[],
  t: (key: string) => string
): string {
  if (statuses.length <= 1) return statuses[0] ?? "";
  return `${statuses
    .slice(0, -1)
    .join(t("joinSeparator"))} ${t("or")} ${statuses[statuses.length - 1]}`;
}

/** Past-tense verb for a completed transition, used in toasts. */
function transitionVerb(
  target: AgeGateStatus,
  t: (key: string) => string
): string {
  if (target === "approved") return t("verbApproved");
  if (target === "rejected") return t("verbRejected");
  return t("verbReturned");
}

/**
 * Whether moving `from` to `to` needs a backend with the reopen endpoint.
 * Reopen is only called for transitions TO pending, but the backend that
 * shipped it (artifact-keeper#2968) is also the one that allowed direct
 * re-decide of a decided review — so a backend without reopen rejects every
 * transition out of a decided status, and all of them are gated on it.
 */
function needsReopen(from: string, to: AgeGateStatus): boolean {
  return from !== "pending" && from !== to;
}

/**
 * What a transition will do, said plainly enough that an admin can tell a
 * first decision from a reversal before they commit to it.
 */
function describeTransition(
  from: string,
  to: AgeGateStatus,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  if (from === "pending") {
    return to === "approved" ? t("describeApprove") : t("describeReject");
  }
  if (to === "pending") {
    return t("describeReturn", { from: t(STATUS_LABEL_KEYS[from as AgeGateStatus] ?? "statusPending") });
  }
  return t("describeChange", {
    from: t(STATUS_LABEL_KEYS[from as AgeGateStatus] ?? "statusPending"),
    to: t(STATUS_LABEL_KEYS[to] ?? "statusPending"),
  });
}

export default function AgeGatePage() {
  const t = useTranslations("app/admin/age-gate");
  useDocumentTitle(t("title"));
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statuses, setStatuses] = useState<AgeGateStatus[]>(["pending"]);
  const [transition, setTransition] = useState<
    { review: AgeGateReview; target: AgeGateStatus } | null
  >(null);
  const [reason, setReason] = useState("");

  // Latched off the first time the endpoint 404s, so a backend without
  // artifact-keeper#2968 stops being offered transitions it cannot perform.
  const reopenSupported = useSyncExternalStore(
    subscribeReopenSupport,
    isReopenSupported,
    isReopenSupported,
  );

  // Reversing a recorded decision always requires a reason for the audit
  // log; deciding a pending review for the first time does not.
  const reasonRequired = transition !== null && transition.review.status !== "pending";
  const reasonMissing = reasonRequired && reason.trim() === "";

  const statusKey = [...statuses].sort().join(",");
  const {
    data: reviewPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["age-gate-reviews", statusKey],
    // Capped page without pagination; the truncation notice below surfaces it
    // when the server's total exceeds what this one fetch returned.
    queryFn: () => ageGateApi.listReviews({ statuses, perPage: 100 }),
    enabled: !!user?.is_admin && statuses.length > 0,
  });

  const rows = useMemo(() => reviewPage?.items ?? [], [reviewPage]);
  const repositoryKeys = useMemo(() => [...new Set(rows.map((r) => r.repositoryKey))], [rows]);

  const { data: repoConfigs } = useQuery({
    queryKey: ["age-gate-repo-configs", repositoryKeys],
    queryFn: () => ageGateApi.getRepoConfigs(repositoryKeys),
    enabled: !!user?.is_admin && repositoryKeys.length > 0,
  });

  // The review carries the reviewer's user id and nothing else, so the names
  // come from the admin user list. Only the first page is fetched: a reviewer
  // beyond it degrades to a shortened id rather than hiding who decided.
  const hasReviewers = rows.some((r) => r.reviewedBy);
  const { data: users } = useQuery({
    queryKey: ["age-gate-reviewers"],
    queryFn: () => adminApi.listUsers({ perPage: 100 }),
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
        `${transitionVerb(target, t)} ${review.packageName}@${review.packageVersion}`,
      );
    },
    onError: mutationErrorToast(t("toastFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Hourglass className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Hourglass className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">{t("filterByStatus")}</legend>
          {AGE_GATE_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={statuses.includes(s)}
                onCheckedChange={(checked) => toggleStatus(s, checked === true)}
                aria-label={t("showStatus", { status: t(STATUS_LABEL_KEYS[s]) })}
              />
              {t(STATUS_LABEL_KEYS[s])}
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
          {t("refresh")}
        </Button>
      </div>

      {!reopenSupported && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            {t("reopenUnsupported")}
          </AlertDescription>
        </Alert>
      )}

      {statuses.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("selectStatusPrompt")}
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
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, t("unknownError"))}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("retry")}
          </Button>
        </div>
      )}

      {statuses.length > 0 && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {statuses.length === AGE_GATE_STATUSES.length
            ? t("noReleases")
            : t("noReleasesFor", { statuses: joinStatuses(statuses, t) })}
        </div>
      )}

      {statuses.length > 0 && !isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t("colPackage")}</th>
                <th className="px-3 py-2 font-medium">{t("colVersion")}</th>
                <th className="px-3 py-2 font-medium">{t("colRepository")}</th>
                <th className="px-3 py-2 font-medium">{t("colAge")}</th>
                <th className="px-3 py-2 font-medium">{t("colRequested")}</th>
                <th className="px-3 py-2 font-medium">{t("colDecision")}</th>
                <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.packageName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.packageVersion}</td>
                  <td className="px-3 py-2">
                    {/* Deep-link to the repo's settings tab, where the same
                        repository's age gate policy is configured (#701). */}
                    <Link
                      href={`/repositories/${encodeURIComponent(r.repositoryKey)}?tab=settings`}
                      title={t("ageGateSettings", { repo: r.repositoryKey })}
                    >
                      <Badge variant="outline">{r.repositoryKey}</Badge>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatAge(r, repoConfigs?.[r.repositoryKey]?.minAgeDays, t)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(r.requestedAt)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {/* Keyed off status, not reviewer metadata: the backend
                        leaves reviewed_by/reviewed_at set on a reopened
                        (pending) row, pointing at the admin who reopened it. */}
                    {r.status !== "pending" && (r.reviewedBy || r.reviewedAt || r.reviewReason) ? (
                      <div className="max-w-xs space-y-0.5">
                        {(r.reviewedBy || r.reviewedAt) && (
                          <div>
                            {r.reviewedBy ? reviewerName(r.reviewedBy) : t("unknownReviewer")}
                            {r.reviewedAt && (
                              <span title={r.reviewedAt}> {t("reviewedOn", { date: formatDate(r.reviewedAt) })}</span>
                            )}
                          </div>
                        )}
                        {r.reviewReason && <div className="italic">&ldquo;{r.reviewReason}&rdquo;</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">{t("notDecided")}</span>
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
                        aria-label={t("statusFor", { name: r.packageName })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_GATE_STATUSES.map((s) => (
                          <SelectItem
                            key={s}
                            value={s}
                            className="capitalize"
                            // Without the reopen endpoint these transitions
                            // cannot even start, so they are shown unavailable
                            // rather than offered and then failed.
                            disabled={!reopenSupported && needsReopen(r.status, s)}
                          >
                            {t(STATUS_LABEL_KEYS[s])}
                          </SelectItem>
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

      <ListTruncationNotice shown={rows.length} total={reviewPage?.total ?? 0} />

      <Dialog open={transition !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transition?.target === "approved" && `${t("verbApprove")} `}
              {transition?.target === "rejected" && `${t("verbReject")} `}
              {transition?.target === "pending" && `${t("verbReturn")} `}
              {transition?.review.packageName}@{transition?.review.packageVersion}
              {transition?.target === "pending" && ` ${t("toPending")}`}
            </DialogTitle>
            <DialogDescription>
              {transition ? describeTransition(transition.review.status, transition.target, t) : null}
            </DialogDescription>
          </DialogHeader>

          {transition?.target === "approved" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {t("confirmRelease", {
                  name: transition.review.packageName,
                  version: transition.review.packageVersion,
                })}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1 py-2">
            <Textarea
              placeholder={reasonRequired ? t("reasonRequired") : t("reasonOptional")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={t("reasonLabel")}
              aria-describedby="age-gate-reason-help"
              aria-invalid={reasonMissing}
            />
            <p id="age-gate-reason-help" className="text-xs text-muted-foreground">
              {reasonRequired ? t("reasonHelpRequired") : t("reasonHelpOptional")}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>{t("cancel")}</Button>
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
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
