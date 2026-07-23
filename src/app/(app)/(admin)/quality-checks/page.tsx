"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, PlayCircle, EyeOff, Eye, AlertCircle, RotateCcw, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";

import qualityChecksApi, {
  type QualityCheck,
  type QualityIssue,
} from "@/lib/api/quality-checks";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const CHECKS_KEY = ["quality-checks"];

function severityVariant(sev: string): "destructive" | "secondary" | "outline" {
  const s = sev.toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

export default function QualityChecksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<QualityCheck | null>(null);
  const [suppressTarget, setSuppressTarget] = useState<QualityIssue | null>(null);
  const [reason, setReason] = useState("");

  const { data: checks, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: CHECKS_KEY,
    queryFn: () => qualityChecksApi.list(),
    enabled: !!user?.is_admin,
  });

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ["quality-check-issues", selected?.id],
    queryFn: () => qualityChecksApi.listIssues(selected!.id),
    enabled: !!selected,
  });

  const invalidateIssues = () =>
    queryClient.invalidateQueries({ queryKey: ["quality-check-issues", selected?.id] });

  const triggerMutation = useMutation({
    mutationFn: () => qualityChecksApi.trigger({}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CHECKS_KEY });
      toast.success(res.message || `Queued ${res.queued} artifact(s)`);
    },
    onError: mutationErrorToast("Failed to trigger checks"),
  });

  const suppressMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      qualityChecksApi.suppressIssue(vars.id, vars.reason),
    onSuccess: () => {
      invalidateIssues();
      setSuppressTarget(null);
      setReason("");
      toast.success("Issue suppressed");
    },
    onError: mutationErrorToast("Failed to suppress issue"),
  });

  const unsuppressMutation = useMutation({
    mutationFn: (id: string) => qualityChecksApi.unsuppressIssue(id),
    onSuccess: () => {
      invalidateIssues();
      toast.success("Issue un-suppressed");
    },
    onError: mutationErrorToast("Failed to un-suppress issue"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <ShieldCheck className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">Quality checks require administrator access.</p>
      </div>
    );
  }

  const rows = checks ?? [];
  const canSuppress = reason.trim() !== "" && !suppressMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Quality Checks</h1>
            <p className="text-sm text-muted-foreground">
              Artifact quality-check results and their findings.
            </p>
          </div>
        </div>
        <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
          {triggerMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          Run checks
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load quality checks</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <ListChecks className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No quality-check results yet.</p>
          <p className="text-xs">Run checks to evaluate your artifacts.</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium capitalize">{c.check_type}</span>
                  {c.passed === true && <Badge variant="secondary">passed</Badge>}
                  {c.passed === false && <Badge variant="destructive">failed</Badge>}
                  {c.score != null && <span className="text-xs text-muted-foreground">score {c.score}</span>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{c.issues_count} issue{c.issues_count === 1 ? "" : "s"}</span>
                  {c.critical_count > 0 && <Badge variant="destructive">{c.critical_count} critical</Badge>}
                  {c.high_count > 0 && <Badge variant="destructive">{c.high_count} high</Badge>}
                  {c.medium_count > 0 && <Badge variant="secondary">{c.medium_count} medium</Badge>}
                  {c.error_message && <span className="truncate max-w-[16rem] text-destructive">· {c.error_message}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`View issues for ${c.check_type}`} onClick={() => setSelected(c)} disabled={c.issues_count === 0}>
                View issues
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Issues dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="capitalize">{selected?.check_type} issues</DialogTitle>
            <DialogDescription>Suppress findings that are accepted or false positives.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {issuesLoading && <Skeleton className="h-16 w-full" />}
            {!issuesLoading && (issues?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No issues.</p>
            )}
            {!issuesLoading &&
              (issues ?? []).map((iss) => (
                <div key={iss.id} className={`rounded-md border p-3 ${iss.is_suppressed ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={severityVariant(iss.severity)} className="capitalize">{iss.severity}</Badge>
                        <span className="truncate text-sm font-medium">{iss.title}</span>
                        {iss.is_suppressed && <Badge variant="outline">suppressed</Badge>}
                      </div>
                      {iss.description && <p className="mt-1 text-xs text-muted-foreground">{iss.description}</p>}
                      {iss.location && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{iss.location}</p>}
                    </div>
                    {iss.is_suppressed ? (
                      <Button variant="ghost" size="sm" aria-label={`Un-suppress ${iss.title}`} onClick={() => unsuppressMutation.mutate(iss.id)}>
                        <Eye className="size-4" /> Restore
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={`Suppress ${iss.title}`} onClick={() => { setSuppressTarget(iss); setReason(""); }}>
                        <EyeOff className="size-4" /> Suppress
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppress reason dialog */}
      <Dialog open={suppressTarget !== null} onOpenChange={(o) => { if (!o) { setSuppressTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress issue</DialogTitle>
            <DialogDescription>A reason is recorded for the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="qc-reason" className="sr-only">Reason</Label>
            <Input id="qc-reason" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Accepted risk / false positive" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSuppressTarget(null); setReason(""); }}>Cancel</Button>
            <Button disabled={!canSuppress} onClick={() => suppressTarget && suppressMutation.mutate({ id: suppressTarget.id, reason: reason.trim() })}>
              {suppressMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Suppress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
