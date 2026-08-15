"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  PackageCheck,
  Check,
  Ban,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { curationApi, type CurationPackage } from "@/lib/api/curation";
import { useRepositories } from "@/hooks/use-repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { CurationRulesManager } from "./_components/curation-rules-manager";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

const STATUSES = ["pending", "approved", "blocked"] as const;

const STATUS_KEYS: Record<string, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  blocked: "statusBlocked",
};

export default function CurationPage() {
  const t = useTranslations("adminCuration");
  useDocumentTitle(t("title"));
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [repoId, setRepoId] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "approve" | "block">(null);
  const [reason, setReason] = useState("");

  const { data: repos } = useRepositories(
    { per_page: 1000 },
    { enabled: !!user?.is_admin },
  );
  const stagingRepos = useMemo(
    () => (repos?.items ?? []).filter((r) => r.repo_type === "staging"),
    [repos?.items],
  );

  const packagesQueryKey = ["curation", repoId, status];
  const { data: packages, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: packagesQueryKey,
    queryFn: () => curationApi.listPackages(repoId, { status }),
    enabled: !!user?.is_admin && repoId !== "",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["curation", repoId] });
    setSelected(new Set());
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => curationApi.approve(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("approved"));
    },
    onError: mutationErrorToast(t("approveFailed")),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => curationApi.block(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("blocked"));
    },
    onError: mutationErrorToast(t("blockFailed")),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids, why }: { action: "approve" | "block"; ids: string[]; why: string }) =>
      action === "approve" ? curationApi.bulkApprove(ids, why) : curationApi.bulkBlock(ids, why),
    onSuccess: (count, { action }) => {
      invalidate();
      setBulkAction(null);
      setReason("");
      toast.success(
        t("bulkDone", {
          count,
          verb: action === "approve" ? t("approved") : t("blocked"),
        }),
      );
    },
    onError: mutationErrorToast(t("bulkFailed")),
  });

  const reEvaluateMutation = useMutation({
    mutationFn: () => curationApi.reEvaluate(repoId, "block"),
    onSuccess: (count) => {
      invalidate();
      toast.success(t("reEvaluated", { count }));
    },
    onError: mutationErrorToast(t("reEvaluateFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  const rows = packages ?? [];
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));
  // Actions follow the active queue filter: only offer the transition that
  // actually changes state — don't show "Approve" on the approved queue or
  // "Block" on the blocked queue. (Per-row state is rendered from the new
  // CurationPackageResponse.status; #574 SDK 1.5.0 migration.)
  const canApprove = status !== "approved";
  const canBlock = status !== "blocked";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((p) => p.id)));
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <PackageCheck className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList>
          <TabsTrigger value="queue">{t("tabQueue")}</TabsTrigger>
          <TabsTrigger value="rules">{t("tabRules")}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={repoId} onValueChange={(v) => { setRepoId(v); setSelected(new Set()); }}>
          <SelectTrigger className="w-64" aria-label={t("stagingRepoAria")}>
            <SelectValue placeholder={t("stagingRepoPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {stagingRepos.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setSelected(new Set()); }}>
          <SelectTrigger className="w-40" aria-label={t("statusFilterAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(STATUS_KEYS[s])}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          disabled={!repoId || reEvaluateMutation.isPending}
          onClick={() => reEvaluateMutation.mutate()}
          title={t("reEvaluateTitle")}
        >
          <RefreshCw className={`size-4 ${reEvaluateMutation.isPending ? "animate-spin" : ""}`} />
          {t("reEvaluate")}
        </Button>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("selectedCount", { count: selected.size })}</span>
            {canApprove && (
              <Button size="sm" onClick={() => setBulkAction("approve")}>
                <Check className="size-4" /> {t("approve")}
              </Button>
            )}
            {canBlock && (
              <Button size="sm" variant="destructive" onClick={() => setBulkAction("block")}>
                <Ban className="size-4" /> {t("block")}
              </Button>
            )}
          </div>
        )}
      </div>

      <ListTruncationNotice
        shown={repos?.items.length ?? 0}
        total={repos?.pagination?.total ?? 0}
      />

      {!repoId && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("selectRepoPrompt")}
        </div>
      )}

      {repoId && isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {repoId && !isLoading && isError && (
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

      {repoId && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {t("noPackages", { status: t(STATUS_KEYS[status]) })}
        </div>
      )}

      {repoId && !isLoading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={t("selectAll")} />
                </th>
                <th className="px-3 py-2 font-medium">{t("colPackage")}</th>
                <th className="px-3 py-2 font-medium">{t("colVersion")}</th>
                <th className="px-3 py-2 font-medium">{t("colFormat")}</th>
                <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p: CurationPackage) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      aria-label={t("selectRow", { name: p.name })}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.version}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="uppercase">{p.format}</Badge></td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={p.status === "blocked" ? "destructive" : p.status === "approved" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {t(STATUS_KEYS[p.status] ?? "statusPending")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {canApprove && (
                        <Button variant="ghost" size="icon-sm" aria-label={t("approveRow", { name: p.name })} onClick={() => approveMutation.mutate(p.id)}>
                          <Check className="size-4 text-emerald-600" />
                        </Button>
                      )}
                      {canBlock && (
                        <Button variant="ghost" size="icon-sm" aria-label={t("blockRow", { name: p.name })} onClick={() => blockMutation.mutate(p.id)}>
                          <Ban className="size-4 text-destructive" />
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

      {/* Bulk reason dialog */}
      <Dialog open={bulkAction !== null} onOpenChange={(o) => { if (!o) { setBulkAction(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {(bulkAction === "approve" ? t("approve") : t("block"))} {t("packageCount", { count: selected.size })}
            </DialogTitle>
            <DialogDescription>
              {t("bulkDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={t("reasonLabel")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBulkAction(null); setReason(""); }}>{t("cancel")}</Button>
            <Button
              variant={bulkAction === "block" ? "destructive" : "default"}
              disabled={reason.trim() === "" || bulkMutation.isPending}
              onClick={() =>
                bulkAction &&
                bulkMutation.mutate({ action: bulkAction, ids: [...selected], why: reason.trim() })
              }
            >
              {bulkMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="rules">
          <CurationRulesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
