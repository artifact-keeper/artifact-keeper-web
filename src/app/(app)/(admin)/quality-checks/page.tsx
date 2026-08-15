"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ShieldCheck, PlayCircle, EyeOff, Eye, AlertCircle, RotateCcw, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";

import {
  qualityChecksApi,
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
  const t = useTranslations("app/admin/quality-checks");
  const tSev = useTranslations("core/severity");
  useDocumentTitle(t("title"));
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
      toast.success(res.message || t("queuedArtifacts", { count: res.queued }));
    },
    onError: mutationErrorToast(t("toast.triggerFailed")),
  });

  const suppressMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      qualityChecksApi.suppressIssue(vars.id, vars.reason),
    onSuccess: () => {
      invalidateIssues();
      setSuppressTarget(null);
      setReason("");
      toast.success(t("toast.issueSuppressed"));
    },
    onError: mutationErrorToast(t("toast.suppressFailed")),
  });

  const unsuppressMutation = useMutation({
    mutationFn: (id: string) => qualityChecksApi.unsuppressIssue(id),
    onSuccess: () => {
      invalidateIssues();
      toast.success(t("toast.issueUnsuppressed"));
    },
    onError: mutationErrorToast(t("toast.unsuppressFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <ShieldCheck className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">{t("accessDenied")}</p>
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
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
        <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
          {triggerMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          {t("runChecks")}
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
          <p className="text-sm font-medium">{t("couldNotLoad")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, t("unknownError"))}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("retry")}
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <ListChecks className="size-8 mb-2 opacity-50" />
          <p className="text-sm">{t("emptyTitle")}</p>
          <p className="text-xs">{t("emptyHint")}</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium capitalize">{c.check_type}</span>
                  {c.passed === true && <Badge variant="secondary">{t("passed")}</Badge>}
                  {c.passed === false && <Badge variant="destructive">{t("failed")}</Badge>}
                  {c.score != null && <span className="text-xs text-muted-foreground">{t("score", { score: c.score })}</span>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("issuesCount", { count: c.issues_count })}</span>
                  {c.critical_count > 0 && <Badge variant="destructive">{t("criticalCount", { count: c.critical_count })}</Badge>}
                  {c.high_count > 0 && <Badge variant="destructive">{t("highCount", { count: c.high_count })}</Badge>}
                  {c.medium_count > 0 && <Badge variant="secondary">{t("mediumCount", { count: c.medium_count })}</Badge>}
                  {c.error_message && <span className="truncate max-w-[16rem] text-destructive">· {c.error_message}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={t("viewIssuesAria", { checkType: c.check_type })} onClick={() => setSelected(c)} disabled={c.issues_count === 0}>
                {t("viewIssues")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Issues dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="capitalize">{t("issuesTitle", { checkType: selected?.check_type ?? "" })}</DialogTitle>
            <DialogDescription>{t("issuesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {issuesLoading && <Skeleton className="h-16 w-full" />}
            {!issuesLoading && (issues?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noIssues")}</p>
            )}
            {!issuesLoading &&
              (issues ?? []).map((iss) => (
                <div key={iss.id} className={`rounded-md border p-3 ${iss.is_suppressed ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={severityVariant(iss.severity)} className="capitalize">{tSev(iss.severity.toLowerCase())}</Badge>
                        <span className="truncate text-sm font-medium">{iss.title}</span>
                        {iss.is_suppressed && <Badge variant="outline">{t("suppressed")}</Badge>}
                      </div>
                      {iss.description && <p className="mt-1 text-xs text-muted-foreground">{iss.description}</p>}
                      {iss.location && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{iss.location}</p>}
                    </div>
                    {iss.is_suppressed ? (
                      <Button variant="ghost" size="sm" aria-label={t("restoreAria", { title: iss.title })} onClick={() => unsuppressMutation.mutate(iss.id)}>
                        <Eye className="size-4" /> {t("restore")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={t("suppressAria", { title: iss.title })} onClick={() => { setSuppressTarget(iss); setReason(""); }}>
                        <EyeOff className="size-4" /> {t("suppress")}
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
            <DialogTitle>{t("suppressTitle")}</DialogTitle>
            <DialogDescription>{t("suppressDescription")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="qc-reason" className="sr-only">{t("reason")}</Label>
            <Input id="qc-reason" aria-label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSuppressTarget(null); setReason(""); }}>{t("cancel")}</Button>
            <Button disabled={!canSuppress} onClick={() => suppressTarget && suppressMutation.mutate({ id: suppressTarget.id, reason: reason.trim() })}>
              {suppressMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("suppress")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
