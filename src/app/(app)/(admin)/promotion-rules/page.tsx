"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { GitPullRequestArrow, Plus, Trash2, Pencil, FlaskConical, AlertCircle, RotateCcw, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import {
  promotionRulesApi,
  type PromotionRule,
  type CreatePromotionRuleRequest,
} from "@/lib/api/promotion-rules";
import { useRepositories } from "@/hooks/use-repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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

const QUERY_KEY = ["promotion-rules"];
const SEVERITIES = ["any", "low", "medium", "high", "critical"] as const;

interface FormState {
  name: string;
  source_repo_id: string;
  target_repo_id: string;
  auto_promote: boolean;
  require_signature: boolean;
  is_enabled: boolean;
  max_cve_severity: string; // "any" => null
  min_health_score: number | undefined;
  min_staging_hours: number | undefined;
  max_artifact_age_days: number | undefined;
  /** Comma-separated license identifiers; parsed to string[] on submit. */
  allowed_licenses: string;
}

const emptyForm: FormState = {
  name: "",
  source_repo_id: "",
  target_repo_id: "",
  auto_promote: false,
  require_signature: false,
  is_enabled: true,
  max_cve_severity: "any",
  min_health_score: undefined,
  min_staging_hours: undefined,
  max_artifact_age_days: undefined,
  allowed_licenses: "",
};

function parseLicenses(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function toRequest(f: FormState): CreatePromotionRuleRequest {
  return {
    name: f.name.trim(),
    source_repo_id: f.source_repo_id,
    target_repo_id: f.target_repo_id,
    auto_promote: f.auto_promote,
    require_signature: f.require_signature,
    is_enabled: f.is_enabled,
    max_cve_severity: f.max_cve_severity === "any" ? null : f.max_cve_severity,
    min_health_score: f.min_health_score,
    min_staging_hours: f.min_staging_hours,
    max_artifact_age_days: f.max_artifact_age_days,
    allowed_licenses: parseLicenses(f.allowed_licenses),
  };
}

export default function PromotionRulesPage() {
  const t = useTranslations("adminPromotionRules");
  const tSev = useTranslations("severity");
  useDocumentTitle(t("title"));
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<PromotionRule | null>(null);

  const { data: rules, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => promotionRulesApi.list(),
    enabled: !!user?.is_admin,
  });

  const { data: repos } = useRepositories(
    { per_page: 1000 },
    { enabled: !!user?.is_admin },
  );
  const repoKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of repos?.items ?? []) map.set(r.id, r.key);
    return (id: string) => map.get(id) ?? id;
  }, [repos?.items]);
  const repoOptions = repos?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; form: FormState }) => {
      const req = toRequest(vars.form);
      if (vars.id) {
        // source/target are immutable; the SDK update body omits them.
        return promotionRulesApi.update(vars.id, {
          name: req.name,
          auto_promote: req.auto_promote,
          require_signature: req.require_signature,
          is_enabled: req.is_enabled,
          max_cve_severity: req.max_cve_severity,
          min_health_score: req.min_health_score,
          min_staging_hours: req.min_staging_hours,
          max_artifact_age_days: req.max_artifact_age_days,
          allowed_licenses: req.allowed_licenses,
        });
      }
      return promotionRulesApi.create(req);
    },
    onSuccess: (_p, vars) => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(vars.id ? t("toast.updated") : t("toast.created"));
    },
    onError: mutationErrorToast(t("toast.saveFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promotionRulesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success(t("toast.deleted"));
    },
    onError: mutationErrorToast(t("toast.deleteFailed")),
  });

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => promotionRulesApi.evaluate(id),
    onSuccess: (res) => {
      toast.success(t("evaluateResult", { ruleName: res.rule_name, passed: res.passed, total: res.total, failed: res.failed }));
    },
    onError: mutationErrorToast(t("toast.evaluationFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <GitPullRequestArrow className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(r: PromotionRule) {
    setEditing(r);
    setForm({
      name: r.name,
      source_repo_id: r.source_repo_id,
      target_repo_id: r.target_repo_id,
      auto_promote: r.auto_promote,
      require_signature: r.require_signature,
      is_enabled: r.is_enabled,
      max_cve_severity: r.max_cve_severity ?? "any",
      min_health_score: r.min_health_score ?? undefined,
      min_staging_hours: r.min_staging_hours ?? undefined,
      max_artifact_age_days: r.max_artifact_age_days ?? undefined,
      allowed_licenses: r.allowed_licenses.join(", "),
    });
    setDialogOpen(true);
  }

  const canSave =
    form.name.trim() !== "" &&
    form.source_repo_id !== "" &&
    form.target_repo_id !== "" &&
    !saveMutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({ id: editing?.id ?? null, form });
  }

  const numField = (v: string): number | undefined => {
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  };

  const rows = rules ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitPullRequestArrow className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("newRule")}
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
          <GitPullRequestArrow className="size-8 mb-2 opacity-50" />
          <p className="text-sm">{t("emptyTitle")}</p>
          <p className="text-xs">{t("emptyHint")}</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {r.auto_promote && <Badge variant="secondary">{t("autoPromote")}</Badge>}
                  {!r.is_enabled && <Badge variant="outline">{t("disabled")}</Badge>}
                  {r.require_signature && <Badge variant="outline">{t("signed")}</Badge>}
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{repoKey(r.source_repo_id)}</span>
                  <ArrowRight className="size-3" />
                  <span className="font-mono">{repoKey(r.target_repo_id)}</span>
                  {r.max_cve_severity && <span>· {t("maxCve", { severity: r.max_cve_severity })}</span>}
                  {r.min_health_score != null && <span>· {t("healthMin", { score: r.min_health_score })}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={t("evaluateAria", { name: r.name })} disabled={evaluateMutation.isPending} onClick={() => evaluateMutation.mutate(r.id)}>
                  <FlaskConical className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("editAria", { name: r.name })} onClick={() => openEdit(r)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("deleteAria", { name: r.name })} onClick={() => setDeleteTarget(r)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
              <DialogDescription>
                {t("dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="pr-name">{t("name")}</Label>
                <Input id="pr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("namePlaceholder")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-source">{t("sourceStaging")}</Label>
                  {editing ? (
                    <Input id="pr-source" value={repoKey(form.source_repo_id)} disabled />
                  ) : (
                    <Select value={form.source_repo_id} onValueChange={(v) => setForm((f) => ({ ...f, source_repo_id: v }))}>
                      <SelectTrigger id="pr-source" aria-label={t("sourceRepository")}><SelectValue placeholder={t("selectSource")} /></SelectTrigger>
                      <SelectContent>
                        {repoOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-target">{t("targetRelease")}</Label>
                  {editing ? (
                    <Input id="pr-target" value={repoKey(form.target_repo_id)} disabled />
                  ) : (
                    <Select value={form.target_repo_id} onValueChange={(v) => setForm((f) => ({ ...f, target_repo_id: v }))}>
                      <SelectTrigger id="pr-target" aria-label={t("targetRepository")}><SelectValue placeholder={t("selectTarget")} /></SelectTrigger>
                      <SelectContent>
                        {repoOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-cve">{t("maxCveSeverity")}</Label>
                  <Select value={form.max_cve_severity} onValueChange={(v) => setForm((f) => ({ ...f, max_cve_severity: v }))}>
                    <SelectTrigger id="pr-cve" aria-label={t("maxCveSeverity")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "any" ? t("severityAny") : tSev(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-health">{t("minHealthScore")}</Label>
                  <Input id="pr-health" type="number" min={0} value={form.min_health_score ?? ""} onChange={(e) => setForm((f) => ({ ...f, min_health_score: numField(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-staging">{t("minStagingHours")}</Label>
                  <Input id="pr-staging" type="number" min={0} value={form.min_staging_hours ?? ""} onChange={(e) => setForm((f) => ({ ...f, min_staging_hours: numField(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-age">{t("maxArtifactAge")}</Label>
                  <Input id="pr-age" type="number" min={0} value={form.max_artifact_age_days ?? ""} onChange={(e) => setForm((f) => ({ ...f, max_artifact_age_days: numField(e.target.value) }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-licenses">{t("allowedLicenses")}</Label>
                <Input id="pr-licenses" value={form.allowed_licenses} onChange={(e) => setForm((f) => ({ ...f, allowed_licenses: e.target.value }))} placeholder={t("allowedLicensesPlaceholder")} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-auto">{t("autoPromoteLabel")}</Label>
                <Switch id="pr-auto" checked={form.auto_promote} onCheckedChange={(v) => setForm((f) => ({ ...f, auto_promote: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-sig">{t("requireSignature")}</Label>
                <Switch id="pr-sig" checked={form.require_signature} onCheckedChange={(v) => setForm((f) => ({ ...f, require_signature: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-enabled">{t("enabled")}</Label>
                <Switch id="pr-enabled" checked={form.is_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={!canSave}>
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleteTarget?.name ?? "" })}
        confirmText={t("deleteConfirm")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
