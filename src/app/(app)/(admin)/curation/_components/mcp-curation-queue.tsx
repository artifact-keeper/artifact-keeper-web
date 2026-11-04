"use client";

import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, Check, FolderCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { formatRelativeTimestamp } from "@/lib/cache-time";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import type { McpReview } from "@/types/mcp";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReasonDialog } from "./reason-dialog";
import { McpNamespaceApproveDialog } from "./mcp-namespace-approve-dialog";
import { McpUpstreamCatalog } from "./mcp-upstream-catalog";
import { McpNotAvailable, McpReviewStatusBadge, McpRiskText, McpTransportChips } from "./mcp-queue-parts";
import { lintSummary, plural, reviewRisk, reviewVersion, toolDiffSummary } from "./mcp-review-format";

const REVIEW_TABS = ["pending", "approved", "blocked"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];
type Tab = ReviewTab | "catalog";
type Action = "approve" | "block";

const TAB_LABEL: Record<ReviewTab, string> = { pending: "Pending", approved: "Approved", blocked: "Blocked" };

/**
 * Approval queue of a Remote MCP repository (artifact-keeper#5253, lens-ui
 * 4.2, decision 7). A Remote is deny-by-default: upstream names are served
 * only once approved here. Approval is per name (later versions flow while
 * the gates pass) unless "pin this version only" is ticked.
 */
export function McpCurationQueue({ repoKey }: { repoKey: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<Action | null>(null);
  const [rowAction, setRowAction] = useState<{ action: Action; review: McpReview } | null>(null);
  const [pinVersion, setPinVersion] = useState(false);
  const [namespaceOpen, setNamespaceOpen] = useState(false);

  const results = useQueries({
    queries: REVIEW_TABS.map((status) => ({
      queryKey: mcpKeys.reviews(repoKey, status),
      queryFn: () => mcpApi.listReviews(repoKey, { status }),
    })),
  });
  const byStatus = Object.fromEntries(REVIEW_TABS.map((s, i) => [s, results[i]])) as Record<
    ReviewTab,
    (typeof results)[number]
  >;

  const done = () => {
    queryClient.invalidateQueries({ queryKey: mcpKeys.all });
    setSelected(new Set());
    setBulkAction(null);
    setRowAction(null);
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, reason, version }: { id: string; reason: string; version?: string }) =>
      mcpApi.approveReview(id, { reason: reason || undefined, version }),
    onSuccess: (_r, { version }) => {
      done();
      toast.success(version ? `Approved version ${version} only` : "Server approved");
    },
    onError: mutationErrorToast("Failed to approve server"),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      mcpApi.blockReview(id, { reason: reason || undefined }),
    onSuccess: () => {
      done();
      toast.success("Server blocked");
    },
    onError: mutationErrorToast("Failed to block server"),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids, why }: { action: Action; ids: string[]; why: string }) =>
      action === "approve" ? mcpApi.bulkApprove(ids, why) : mcpApi.bulkBlock(ids, why),
    onSuccess: (count, { action }) => {
      done();
      toast.success(`${plural(count, "server")} ${action === "approve" ? "approved" : "blocked"}`);
    },
    onError: mutationErrorToast("Bulk action failed"),
  });

  if (byStatus.pending.data === null) return <McpNotAvailable what="The MCP approval queue" />;

  const pendingNames = (byStatus.pending.data ?? []).map((r) => r.name);
  const reviewTab = tab === "catalog" ? null : tab;
  const rowPinVersion = rowAction ? reviewVersion(rowAction.review) : null;

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Tab);
          setSelected(new Set());
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            {REVIEW_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {TAB_LABEL[s]}
                {byStatus[s].data ? <span className="ml-1 text-muted-foreground">{byStatus[s].data.length}</span> : null}
              </TabsTrigger>
            ))}
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>

          {reviewTab && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {selected.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                  {reviewTab !== "approved" && (
                    <Button size="sm" onClick={() => setBulkAction("approve")}>
                      <Check className="size-4" /> Approve selected
                    </Button>
                  )}
                  {reviewTab !== "blocked" && (
                    <Button size="sm" variant="destructive" onClick={() => setBulkAction("block")}>
                      <Ban className="size-4" /> Block selected
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setNamespaceOpen(true)}>
                <FolderCheck className="size-4" /> Approve namespace
              </Button>
            </div>
          )}
        </div>

        {REVIEW_TABS.map((s) => (
          <TabsContent key={s} value={s}>
            <ReviewList
              status={s}
              result={byStatus[s]}
              selected={selected}
              onSelect={setSelected}
              onAction={(action, review) => {
                setPinVersion(false);
                setRowAction({ action, review });
              }}
            />
          </TabsContent>
        ))}
        <TabsContent value="catalog">
          <McpUpstreamCatalog repoKey={repoKey} />
        </TabsContent>
      </Tabs>

      <ReasonDialog
        open={bulkAction !== null}
        title={`${bulkAction === "block" ? "Block" : "Approve"} ${plural(selected.size, "server")}`}
        description="A reason is recorded in the audit log for this bulk action."
        destructive={bulkAction === "block"}
        pending={bulkMutation.isPending}
        onCancel={() => setBulkAction(null)}
        onConfirm={(why) => bulkAction && bulkMutation.mutate({ action: bulkAction, ids: [...selected], why })}
      />

      <ReasonDialog
        open={rowAction !== null}
        title={`${rowAction?.action === "block" ? "Block" : "Approve"} ${rowAction?.review.name ?? ""}`}
        description={
          rowAction?.action === "block"
            ? "Blocked names are never served, whatever their version."
            : "Approving the name lets later versions flow while the gates pass."
        }
        destructive={rowAction?.action === "block"}
        requireReason={rowAction?.action === "block"}
        pending={approveMutation.isPending || blockMutation.isPending}
        onCancel={() => setRowAction(null)}
        onConfirm={(reason) => {
          if (!rowAction) return;
          const { id } = rowAction.review;
          if (rowAction.action === "block") blockMutation.mutate({ id, reason });
          else approveMutation.mutate({ id, reason, version: pinVersion && rowPinVersion ? rowPinVersion : undefined });
        }}
      >
        {rowAction?.action === "approve" && rowPinVersion && (
          <div className="flex items-center gap-2">
            <Checkbox id="mcp-pin-version" checked={pinVersion} onCheckedChange={(v) => setPinVersion(v === true)} />
            <Label htmlFor="mcp-pin-version" className="text-sm">
              Pin this version only ({rowPinVersion})
            </Label>
          </div>
        )}
      </ReasonDialog>

      <McpNamespaceApproveDialog
        repoKey={repoKey}
        open={namespaceOpen}
        onOpenChange={setNamespaceOpen}
        pendingNames={pendingNames}
      />
    </div>
  );
}

interface ReviewListProps {
  status: ReviewTab;
  result: { data?: McpReview[] | null; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; isFetching: boolean };
  selected: Set<string>;
  onSelect: (s: Set<string>) => void;
  onAction: (action: Action, review: McpReview) => void;
}

function ReviewList({ status, result, selected, onSelect, onAction }: ReviewListProps) {
  if (result.isLoading) {
    return (
      <div className="space-y-2" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (result.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
        <AlertCircle className="mb-2 size-8 text-destructive opacity-80" />
        <p className="text-sm font-medium">Couldn&apos;t load the approval queue</p>
        <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(result.error, "Unknown error")}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => result.refetch()} disabled={result.isFetching}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    );
  }
  const rows = result.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        No {status} MCP servers.
      </div>
    );
  }
  const allSelected = rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left">
          <tr>
            <th className="w-10 px-3 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => onSelect(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                aria-label="Select all"
              />
            </th>
            <th className="px-3 py-2 font-medium">Server</th>
            <th className="px-3 py-2 font-medium">Risk</th>
            <th className="px-3 py-2 font-medium">Findings</th>
            <th className="px-3 py-2 font-medium">First seen</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              status={status}
              checked={selected.has(r.id)}
              onToggle={() => toggle(r.id)}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewRow({
  review,
  status,
  checked,
  onToggle,
  onAction,
}: {
  review: McpReview;
  status: ReviewTab;
  checked: boolean;
  onToggle: () => void;
  onAction: (action: Action, review: McpReview) => void;
}) {
  const risk = reviewRisk(review);
  const lint = lintSummary(review.findings);
  const tools = toolDiffSummary(review.tool_diff);
  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select ${review.name}`} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">{review.name}</span>
          {review.version ? (
            <Badge variant="secondary" className="font-mono text-[11px]">pinned {review.version}</Badge>
          ) : review.server?.version ? (
            <span className="font-mono text-xs text-muted-foreground">latest {review.server.version}</span>
          ) : null}
          {review.status !== status && <McpReviewStatusBadge status={review.status} />}
        </div>
        {review.server && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <McpTransportChips server={review.server} />
          </div>
        )}
        {review.reason && <p className="mt-1 text-xs text-muted-foreground">Reason: {review.reason}</p>}
      </td>
      <td className="px-3 py-2 align-top">
        {risk ? <McpRiskText level={risk.level} score={risk.score} /> : <span className="text-xs text-muted-foreground">unknown</span>}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {lint && <p className={review.findings?.some((f) => f.action === "block") ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>Lint: {lint}</p>}
        {tools && <p className="text-amber-700 dark:text-amber-400">{tools}</p>}
        {!lint && !tools && <span className="text-muted-foreground">None</span>}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {review.first_seen_at ? (
          <time dateTime={review.first_seen_at} title={review.first_seen_at}>
            {formatRelativeTimestamp(review.first_seen_at)}
          </time>
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex justify-end gap-1">
          {status !== "approved" && (
            <Button variant="ghost" size="icon-sm" aria-label={`Approve ${review.name}`} onClick={() => onAction("approve", review)}>
              <Check className="size-4 text-emerald-600" />
            </Button>
          )}
          {status !== "blocked" && (
            <Button variant="ghost" size="icon-sm" aria-label={`Block ${review.name}`} onClick={() => onAction("block", review)}>
              <Ban className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
