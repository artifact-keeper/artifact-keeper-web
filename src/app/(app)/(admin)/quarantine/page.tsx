"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, RefreshCw, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  holdsApi,
  HOLD_KINDS,
  DEFAULT_HOLD_KINDS,
  HOLD_SUMMARY_QUERY_KEY,
  QUARANTINE_HOLDS_QUERY_KEY,
  formatHoldRemaining,
  joinHoldKinds,
  type HoldKind,
  type QuarantineHold,
} from "@/lib/api/holds";
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
import { HoldsNav } from "@/components/common/holds-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const KIND_BADGE_CLASS: Record<HoldKind, string> = {
  active:
    "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  expired: "text-muted-foreground",
  rejected:
    "border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400",
};

type HoldAction = { hold: QuarantineHold; target: "release" | "reject" };

function useNowTick(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function QuarantineHoldsPage() {
  useDocumentTitle("Quarantine");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [kinds, setKinds] = useState<HoldKind[]>([...DEFAULT_HOLD_KINDS]);
  const [action, setAction] = useState<HoldAction | null>(null);
  const [reason, setReason] = useState("");

  const kindsKey = [...kinds].sort().join(",");
  const {
    data: holdPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: [...QUARANTINE_HOLDS_QUERY_KEY, kindsKey],
    queryFn: () => holdsApi.listQuarantine({ kinds, perPage: 100 }),
    enabled: !!user?.is_admin && kinds.length > 0,
  });

  const rows = useMemo(() => holdPage?.items ?? [], [holdPage]);
  const now = useNowTick();
  const elapsed = Math.max(0, Math.floor((now - (dataUpdatedAt || now)) / 1000));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUARANTINE_HOLDS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: HOLD_SUMMARY_QUERY_KEY });
  };

  const closeDialog = () => {
    setAction(null);
    setReason("");
  };

  const toggleKind = (kind: HoldKind, checked: boolean) => {
    setKinds((current) =>
      checked
        ? HOLD_KINDS.filter((k) => k === kind || current.includes(k))
        : current.filter((k) => k !== kind),
    );
  };

  const releaseMutation = useMutation({
    mutationFn: (hold: QuarantineHold) => holdsApi.release(hold.artifactId),
    onSuccess: (_result, hold) => {
      invalidate();
      closeDialog();
      toast.success(`Released ${hold.name}${hold.version ? `@${hold.version}` : ""}`);
    },
    onError: mutationErrorToast("Could not release quarantine"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ hold, why }: { hold: QuarantineHold; why: string }) =>
      holdsApi.reject(hold.artifactId, why),
    onSuccess: (_result, { hold }) => {
      invalidate();
      closeDialog();
      toast.success(`Rejected ${hold.name}${hold.version ? `@${hold.version}` : ""}`);
    },
    onError: mutationErrorToast("Could not reject artifact"),
  });

  const mutationPending = releaseMutation.isPending || rejectMutation.isPending;

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <ShieldAlert className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">The quarantine queue requires administrator access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Quarantine</h1>
          <p className="text-sm text-muted-foreground">
            Packages held after upload: timed windows, permanent blocks, and leftover expired labels.
          </p>
        </div>
      </div>

      <HoldsNav />

      <div className="flex flex-wrap items-center gap-4">
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">Filter by hold kind</legend>
          {HOLD_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={kinds.includes(k)}
                onCheckedChange={(checked) => toggleKind(k, checked === true)}
                aria-label={`Show ${k}`}
              />
              {k}
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

      {kinds.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Select at least one kind to list quarantined packages.
        </div>
      )}

      {kinds.length > 0 && isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {kinds.length > 0 && !isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load the quarantine queue</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {kinds.length > 0 && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {kinds.length === HOLD_KINDS.length
            ? "No packages in quarantine."
            : `No ${joinHoldKinds(kinds)} packages in quarantine.`}
        </div>
      )}

      {kinds.length > 0 && !isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
                <th className="px-3 py-2 font-medium">Uploaded</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((hold) => (
                <tr key={hold.artifactId}>
                  <td className="px-3 py-2 font-medium">{hold.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hold.version ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/repositories/${encodeURIComponent(hold.repositoryKey)}`}
                      title={`Open ${hold.repositoryKey}`}
                    >
                      <Badge variant="outline">{hold.repositoryKey}</Badge>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`capitalize ${KIND_BADGE_CLASS[hold.kind]}`}>
                      {hold.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div title={hold.quarantineUntil ?? undefined}>
                      {formatHoldRemaining(hold, elapsed)}
                    </div>
                    {hold.quarantineReason && (
                      <div className="mt-0.5 max-w-xs italic">&ldquo;{hold.quarantineReason}&rdquo;</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(hold.createdAt)}</td>
                  <td className="px-3 py-2">
                    {hold.kind === "rejected" ? (
                      <span className="text-xs text-muted-foreground/60">Terminal</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReason("");
                            setAction({ hold, target: "release" });
                          }}
                        >
                          Release
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReason("");
                            setAction({ hold, target: "reject" });
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListTruncationNotice shown={rows.length} total={holdPage?.total ?? 0} />

      <Dialog open={action !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.target === "release" ? "Release " : "Reject "}
              {action?.hold.name}
              {action?.hold.version ? `@${action.hold.version}` : ""}
            </DialogTitle>
            <DialogDescription>
              {action?.target === "release"
                ? action.hold.kind === "expired"
                  ? "This clears the expired quarantine label. Downloads already work because the window lapsed."
                  : "This lifts the hold. Clients can download the package immediately."
                : "Rejecting is permanent: the artifact stays blocked and cannot be released afterwards. The reason is stored on the artifact and recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>

          {action?.target === "reject" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Confirm you mean to permanently refuse {action.hold.name}
                {action.hold.version ? `@${action.hold.version}` : ""}.
              </AlertDescription>
            </Alert>
          )}

          {action?.target === "reject" && (
            <div className="space-y-1 py-2">
              <Textarea
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Rejection reason"
              />
              <p className="text-xs text-muted-foreground">
                Recorded in the audit log with this decision.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button
              variant={action?.target === "reject" ? "destructive" : "default"}
              disabled={mutationPending}
              onClick={() => {
                if (!action) return;
                if (action.target === "release") {
                  releaseMutation.mutate(action.hold);
                } else {
                  rejectMutation.mutate({ hold: action.hold, why: reason.trim() });
                }
              }}
            >
              {mutationPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
