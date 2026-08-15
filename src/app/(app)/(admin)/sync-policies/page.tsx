"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Workflow, Plus, Trash2, Pencil, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  syncPoliciesApi,
  filterToArtifactFilter,
  type SyncPolicy,
  type CreateSyncPolicyRequest,
} from "@/lib/api/sync-policies";
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

const QUERY_KEY = ["sync-policies"];
const MODES = ["push", "pull", "mirror"] as const;

const MODE_LABEL_KEYS: Record<string, string> = {
  push: "modePush",
  pull: "modePull",
  mirror: "modeMirror",
};

const emptyForm: CreateSyncPolicyRequest = {
  name: "",
  description: "",
  filter: "",
  replication_mode: "push",
  priority: 100,
};

export default function SyncPoliciesPage() {
  const t = useTranslations("app/admin/sync-policies");
  useDocumentTitle(t("title"));
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SyncPolicy | null>(null);
  const [form, setForm] = useState<CreateSyncPolicyRequest>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SyncPolicy | null>(null);

  const { data: policies, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => syncPoliciesApi.list(),
    enabled: !!user?.is_admin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; form: CreateSyncPolicyRequest }) => {
      if (vars.id) {
        // UpdateSyncPolicyPayload has no `filter` shorthand — translate the glob
        // into the structured artifact_filter the update endpoint accepts.
        return syncPoliciesApi.update(vars.id, {
          name: vars.form.name,
          description: vars.form.description,
          replication_mode: vars.form.replication_mode,
          priority: vars.form.priority,
          artifact_filter: filterToArtifactFilter(vars.form.filter ?? ""),
        });
      }
      return syncPoliciesApi.create(vars.form);
    },
    onSuccess: (_p, vars) => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(vars.id ? t("updated") : t("created"));
    },
    onError: mutationErrorToast(t("saveFailed")),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      syncPoliciesApi.toggle(vars.id, vars.enabled),
    onSuccess: () => invalidate(),
    onError: mutationErrorToast(t("toggleFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => syncPoliciesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success(t("deleted"));
    },
    onError: mutationErrorToast(t("deleteFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Workflow className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(p: SyncPolicy) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      filter: p.filter,
      replication_mode: p.replication_mode,
      priority: p.priority,
    });
    setDialogOpen(true);
  }

  const canSave = form.name.trim() !== "" && !saveMutation.isPending;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({ id: editing?.id ?? null, form: { ...form, name: form.name.trim() } });
  }

  const rows = policies ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("newPolicy")}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, t("unknownError"))}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("retry")}
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <Workflow className="size-8 mb-2 opacity-50" />
          <p className="text-sm">{t("noPolicies")}</p>
          <p className="text-xs">{t("noPoliciesHint")}</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={p.enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, enabled: v })}
                  aria-label={t("enableAria", { name: p.name })}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="outline">{t(MODE_LABEL_KEYS[p.replication_mode] ?? "modePush")}</Badge>
                    <span className="text-xs text-muted-foreground">{t("priority", { priority: p.priority })}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.filter ? t("listFilter", { filter: p.filter }) : p.description || t("allArtifacts")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={t("editAria", { name: p.name })} onClick={() => openEdit(p)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("deleteAria", { name: p.name })} onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? t("dialogTitleEdit") : t("dialogTitleNew")}</DialogTitle>
              <DialogDescription>
                {t("dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-name">{t("nameLabel")}</Label>
                <Input id="sp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mirror-releases" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-desc">{t("descLabel")}</Label>
                <Input id="sp-desc" value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-mode">{t("modeLabel")}</Label>
                  <Select value={form.replication_mode} onValueChange={(v) => setForm((f) => ({ ...f, replication_mode: v }))}>
                    <SelectTrigger id="sp-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>{t(MODE_LABEL_KEYS[mode] ?? "modePush")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-priority">{t("priorityLabel")}</Label>
                  <Input
                    id="sp-priority"
                    type="number"
                    min={0}
                    value={form.priority ?? ""}
                    onChange={(e) => {
                      // Empty/invalid input -> undefined (omitted, backend default)
                      // rather than 0 (Number("") === 0) or NaN (serializes to null).
                      const n = e.target.valueAsNumber;
                      setForm((f) => ({ ...f, priority: Number.isNaN(n) ? undefined : n }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-filter">{t("filterLabel")}</Label>
                <Input id="sp-filter" value={form.filter ?? ""} onChange={(e) => setForm((f) => ({ ...f, filter: e.target.value }))} placeholder="*.tar.gz" />
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
