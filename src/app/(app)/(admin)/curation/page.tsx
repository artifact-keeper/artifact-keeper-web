"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PackageCheck,
  Check,
  Ban,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import curationApi, { type CurationPackage } from "@/lib/api/curation";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import { formatBytes } from "@/lib/utils";

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

const STATUSES = ["pending", "approved", "blocked"] as const;

export default function CurationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [repoId, setRepoId] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "approve" | "block">(null);
  const [reason, setReason] = useState("");

  const { data: repos } = useQuery({
    queryKey: ["repositories-all", "staging"],
    queryFn: () => repositoriesApi.list({ per_page: 1000 }),
    enabled: !!user?.is_admin,
  });
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
      toast.success("Package approved");
    },
    onError: mutationErrorToast("Failed to approve package"),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => curationApi.block(id),
    onSuccess: () => {
      invalidate();
      toast.success("Package blocked");
    },
    onError: mutationErrorToast("Failed to block package"),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids, why }: { action: "approve" | "block"; ids: string[]; why: string }) =>
      action === "approve" ? curationApi.bulkApprove(ids, why) : curationApi.bulkBlock(ids, why),
    onSuccess: (count, { action }) => {
      invalidate();
      setBulkAction(null);
      setReason("");
      toast.success(`${count} package${count === 1 ? "" : "s"} ${action === "approve" ? "approved" : "blocked"}`);
    },
    onError: mutationErrorToast("Bulk action failed"),
  });

  const reEvaluateMutation = useMutation({
    mutationFn: () => curationApi.reEvaluate(repoId, "block"),
    onSuccess: (count) => {
      invalidate();
      toast.success(`Re-evaluated ${count} package${count === 1 ? "" : "s"}`);
    },
    onError: mutationErrorToast("Re-evaluation failed"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">Package curation requires administrator access.</p>
      </div>
    );
  }

  const rows = packages ?? [];
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));
  // PackageResponse carries no per-row curation status, so the queue's state is
  // the active filter. Only offer the transition that actually changes it:
  // don't show "Approve" on the approved queue or "Block" on the blocked queue.
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
          <h1 className="text-xl font-semibold">Package Curation</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve or block packages staged from upstream repositories.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={repoId} onValueChange={(v) => { setRepoId(v); setSelected(new Set()); }}>
          <SelectTrigger className="w-64" aria-label="Staging repository">
            <SelectValue placeholder="Select a staging repository" />
          </SelectTrigger>
          <SelectContent>
            {stagingRepos.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setSelected(new Set()); }}>
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
          disabled={!repoId || reEvaluateMutation.isPending}
          onClick={() => reEvaluateMutation.mutate()}
          title="Re-run curation rules. Packages not matched by any rule are blocked by default."
        >
          <RefreshCw className={`size-4 ${reEvaluateMutation.isPending ? "animate-spin" : ""}`} />
          Re-evaluate
        </Button>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            {canApprove && (
              <Button size="sm" onClick={() => setBulkAction("approve")}>
                <Check className="size-4" /> Approve
              </Button>
            )}
            {canBlock && (
              <Button size="sm" variant="destructive" onClick={() => setBulkAction("block")}>
                <Ban className="size-4" /> Block
              </Button>
            )}
          </div>
        )}
      </div>

      {!repoId && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Select a staging repository to review its curation queue.
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
          <p className="text-sm font-medium">Couldn&apos;t load the curation queue</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {repoId && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No {status} packages in this queue.
        </div>
      )}

      {repoId && !isLoading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.version}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="uppercase">{p.format}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{formatBytes(p.size_bytes)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={status === "blocked" ? "destructive" : status === "approved" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {canApprove && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Approve ${p.name}`} onClick={() => approveMutation.mutate(p.id)}>
                          <Check className="size-4 text-emerald-600" />
                        </Button>
                      )}
                      {canBlock && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Block ${p.name}`} onClick={() => blockMutation.mutate(p.id)}>
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
              {bulkAction === "approve" ? "Approve" : "Block"} {selected.size} package{selected.size === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              A reason is recorded in the audit log for this bulk action.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Reason (e.g. CVE-free, license OK)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Reason"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBulkAction(null); setReason(""); }}>Cancel</Button>
            <Button
              variant={bulkAction === "block" ? "destructive" : "default"}
              disabled={reason.trim() === "" || bulkMutation.isPending}
              onClick={() =>
                bulkAction &&
                bulkMutation.mutate({ action: bulkAction, ids: [...selected], why: reason.trim() })
              }
            >
              {bulkMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
