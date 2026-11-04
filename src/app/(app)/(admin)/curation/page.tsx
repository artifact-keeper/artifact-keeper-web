"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PackageCheck,
  Check,
  Ban,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { curationApi, type CurationPackage } from "@/lib/api/curation";
import { useRepositories } from "@/hooks/use-repositories";
import { isRemoteMcpRepo } from "@/lib/mcp/format";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { CurationRulesManager } from "./_components/curation-rules-manager";
import { McpCurationQueue } from "./_components/mcp-curation-queue";
import { ReasonDialog } from "./_components/reason-dialog";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

const STATUSES = ["pending", "approved", "blocked"] as const;

// useSearchParams() requires a Suspense boundary for static prerendering.
export default function CurationPage() {
  return (
    <Suspense fallback={null}>
      <CurationPageContent />
    </Suspense>
  );
}

function CurationPageContent() {
  useDocumentTitle("Package Curation");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // `?repo=<key>` deep link (dashboard "awaiting approval" tile).
  const deepLinkKey = useSearchParams()?.get("repo") ?? "";

  const [pickedRepoId, setRepoId] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "approve" | "block">(null);

  const { data: repos } = useRepositories(
    { per_page: 1000 },
    { enabled: !!user?.is_admin },
  );
  // Staging repositories hold the package queue; Remote MCP repositories
  // are deny-by-default allowlists with their own approval queue (#5253).
  const curatedRepos = useMemo(
    () => (repos?.items ?? []).filter((r) => r.repo_type === "staging" || isRemoteMcpRepo(r)),
    [repos?.items],
  );
  const repoId =
    pickedRepoId || curatedRepos.find((r) => r.key === deepLinkKey)?.id || "";
  const selectedRepo = curatedRepos.find((r) => r.id === repoId);
  const mcpRepo = selectedRepo && isRemoteMcpRepo(selectedRepo) ? selectedRepo : null;

  const packagesQueryKey = ["curation", repoId, status];
  const { data: packages, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: packagesQueryKey,
    queryFn: () => curationApi.listPackages(repoId, { status }),
    enabled: !!user?.is_admin && repoId !== "" && !mcpRepo,
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
          <h1 className="text-xl font-semibold">Package Curation</h1>
          <p className="text-sm text-muted-foreground">
            Review packages staged from upstream repositories and servers
            requested from Remote MCP registries, and author the rules that
            gate them.
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList>
          <TabsTrigger value="queue">Review Queue</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={repoId} onValueChange={(v) => { setRepoId(v); setSelected(new Set()); }}>
          <SelectTrigger className="w-64" aria-label="Curation repository">
            <SelectValue placeholder="Select a repository" />
          </SelectTrigger>
          <SelectContent>
            {curatedRepos.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {isRemoteMcpRepo(r) ? `${r.key} (MCP remote)` : r.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!mcpRepo && (
          <>

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
          </>
        )}

        {!mcpRepo && selected.size > 0 && (
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

      <ListTruncationNotice
        shown={repos?.items.length ?? 0}
        total={repos?.pagination?.total ?? 0}
      />

      {!repoId && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Select a staging repository or an MCP remote to review its curation queue.
        </div>
      )}

      {mcpRepo && <McpCurationQueue key={mcpRepo.key} repoKey={mcpRepo.key} />}

      {repoId && !mcpRepo && (
        <>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && isError && (
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

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No {status} packages in this queue.
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
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
                  <td className="px-3 py-2">
                    <Badge
                      variant={p.status === "blocked" ? "destructive" : p.status === "approved" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {p.status}
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

        </>
      )}

      <ReasonDialog
        open={bulkAction !== null}
        title={`${bulkAction === "approve" ? "Approve" : "Block"} ${selected.size} package${selected.size === 1 ? "" : "s"}`}
        description="A reason is recorded in the audit log for this bulk action."
        destructive={bulkAction === "block"}
        pending={bulkMutation.isPending}
        onCancel={() => setBulkAction(null)}
        onConfirm={(why) => bulkAction && bulkMutation.mutate({ action: bulkAction, ids: [...selected], why })}
      />
        </TabsContent>

        <TabsContent value="rules">
          <CurationRulesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
