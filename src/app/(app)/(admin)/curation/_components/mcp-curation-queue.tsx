"use client";

import { SafeText } from "@/components/common/safe-text";
import { NAME_MAX_LENGTH } from "@/lib/untrusted-text";
import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, Check, FolderCheck, FolderX, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { formatRelativeTimestamp } from "@/lib/cache-time";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import type { McpCatalogItem, McpCatalogPage, McpCatalogPin, McpCatalogQuery } from "@/types/mcp";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReasonDialog } from "./reason-dialog";
import { McpNamespaceApproveDialog } from "./mcp-namespace-approve-dialog";
import { McpUpstreamCatalog } from "./mcp-upstream-catalog";
import {
  McpCatalogNotes,
  McpCatalogToolDiff,
  McpNotAvailable,
  McpReviewStatusBadge,
  McpRiskText,
  McpSummaryChips,
} from "./mcp-queue-parts";
import { catalogRisk, driftedPins, lintSummary, needsNameDecision, plural, reviewVersion } from "./mcp-review-format";

const REVIEW_TABS = ["queue", "approved", "blocked"] as const;
type ReviewTab = (typeof REVIEW_TABS)[number];
type Tab = ReviewTab | "catalog";
type Action = "approve" | "block";

const TAB_LABEL: Record<ReviewTab, string> = { queue: "Awaiting decision", approved: "Approved", blocked: "Blocked" };

/** `GET /catalog` query of each tab; the queue is `queue=true` (names, or a drifted version, awaiting a decision). */
const TAB_QUERY: Record<ReviewTab, McpCatalogQuery> = {
  queue: { queue: true },
  approved: { status: "approved" },
  blocked: { status: "blocked" },
};

/** The backend's page cap; a larger queue shows its first page and says so. */
const PAGE_LIMIT = 200;

/** Name rows per tab, from the repository-wide `counts`. */
function tabCount(tab: ReviewTab, page: McpCatalogPage | null | undefined): number | null {
  if (!page) return null;
  if (tab === "queue") return (page.counts.pending ?? 0) + (page.counts.review ?? 0);
  return page.counts[tab] ?? 0;
}

/** A decision target: the name row, or one `name@version` row (a drifted version). */
type Target = { item: McpCatalogItem; pin?: McpCatalogPin };

/**
 * Approval queue of a Remote MCP repository (artifact-keeper#5253, lens-ui
 * 4.2, decision 7), over `/api/v1/repositories/{key}/mcp/catalog`. A Remote
 * is deny-by-default: upstream names are served only once approved here.
 * Approval is per name (later versions flow while the gates pass) unless
 * "pin this version only" is ticked. A version whose upstream bytes changed
 * after approval comes back as its own row and is decided on its own.
 */
export function McpCurationQueue({ repoKey }: { repoKey: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("queue");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<Action | null>(null);
  const [rowAction, setRowAction] = useState<{ action: Action; target: Target } | null>(null);
  const [pinVersion, setPinVersion] = useState(false);
  const [patternAction, setPatternAction] = useState<Action | null>(null);

  const results = useQueries({
    queries: REVIEW_TABS.map((t) => ({
      queryKey: mcpKeys.reviews(repoKey, t),
      queryFn: () => mcpApi.listCatalog(repoKey, { ...TAB_QUERY[t], limit: PAGE_LIMIT }),
    })),
  });
  const byTab = Object.fromEntries(REVIEW_TABS.map((s, i) => [s, results[i]])) as Record<
    ReviewTab,
    (typeof results)[number]
  >;

  const done = () => {
    queryClient.invalidateQueries({ queryKey: mcpKeys.all });
    setSelected(new Set());
    setBulkAction(null);
    setRowAction(null);
  };

  const decideMutation = useMutation({
    mutationFn: async ({ action, target, reason, pin }: { action: Action; target: Target; reason: string; pin?: string }) => {
      const why = reason || undefined;
      if (pin) return mcpApi.pinVersion(repoKey, target.item.name, pin, why);
      return mcpApi.decide(repoKey, target.pin?.id ?? target.item.id, action, why);
    },
    onSuccess: (result, { action, target, pin }) => {
      done();
      const what = pin ? `version ${pin} only` : target.pin ? `version ${target.pin.version}` : "server";
      toast.success(`${action === "approve" ? "Approved" : "Blocked"} ${what}`);
      if (result.ingestError) toast.warning(`Approved, but not ingested yet: ${result.ingestError}`);
    },
    onError: mutationErrorToast("Decision failed"),
  });

  // `POST /catalog/bulk-decide` (repository admins included), one call for the selection.
  const bulkMutation = useMutation({
    mutationFn: ({ action, ids, why }: { action: Action; ids: string[]; why: string }) =>
      mcpApi.bulkDecide(repoKey, ids, action, why || undefined),
    onSuccess: (r, { action }) => {
      done();
      toast.success(`${plural(r.decided.length, "server")} ${action === "approve" ? "approved" : "blocked"}`);
      const left: string[] = [];
      if (r.unchanged.length > 0) left.push(`${r.unchanged.length} already ${action === "approve" ? "approved" : "blocked"}`);
      if (r.skippedDenied.length > 0) left.push(`${r.skippedDenied.length} refused by a deny glob`);
      if (r.notFound.length > 0) left.push(`${r.notFound.length} no longer in the catalog`);
      if (left.length > 0) toast.warning(`Left alone: ${left.join("; ")}`);
    },
    onError: mutationErrorToast("Bulk action failed"),
  });

  if (byTab.queue.data === null) return <McpNotAvailable what="The MCP approval queue" />;

  const reviewTab = tab === "catalog" ? null : tab;
  const rowPinVersion = rowAction && !rowAction.target.pin ? reviewVersion(rowAction.target.item) : null;
  const rowLabel = rowAction ? `${rowAction.target.item.name}${rowAction.target.pin ? ` ${rowAction.target.pin.version}` : ""}` : "";

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
            {REVIEW_TABS.map((s) => {
              const n = tabCount(s, byTab.queue.data);
              return (
                <TabsTrigger key={s} value={s}>
                  {TAB_LABEL[s]}
                  {n !== null ? <span className="ml-1 text-muted-foreground">{n}</span> : null}
                </TabsTrigger>
              );
            })}
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
              <Button size="sm" variant="outline" onClick={() => setPatternAction("approve")}>
                <FolderCheck className="size-4" /> Approve namespace
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPatternAction("block")}>
                <FolderX className="size-4" /> Block namespace
              </Button>
            </div>
          )}
        </div>

        {REVIEW_TABS.map((s) => (
          <TabsContent key={s} value={s}>
            <ReviewList
              repoKey={repoKey}
              tab={s}
              result={byTab[s]}
              selected={selected}
              onSelect={setSelected}
              onAction={(action, target) => {
                setPinVersion(false);
                setRowAction({ action, target });
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
        title={`${rowAction?.action === "block" ? "Block" : "Approve"} ${rowLabel}`}
        description={
          rowAction?.target.pin
            ? rowAction.action === "block"
              ? "This version is never served; the rest of the server is unaffected."
              : "Serves the stored document of this version again (not the changed upstream bytes)."
            : rowAction?.action === "block"
              ? "Blocked names are never served, whatever their version."
              : "Approving the name lets later versions flow while the gates pass."
        }
        destructive={rowAction?.action === "block"}
        requireReason={rowAction?.action === "block"}
        pending={decideMutation.isPending}
        onCancel={() => setRowAction(null)}
        onConfirm={(reason) => {
          if (!rowAction) return;
          decideMutation.mutate({
            action: rowAction.action,
            target: rowAction.target,
            reason,
            pin: rowAction.action === "approve" && pinVersion && rowPinVersion ? rowPinVersion : undefined,
          });
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
        action={patternAction ?? "approve"}
        open={patternAction !== null}
        onOpenChange={(o) => {
          if (!o) setPatternAction(null);
        }}
      />
    </div>
  );
}

interface ReviewListProps {
  repoKey: string;
  tab: ReviewTab;
  result: {
    data?: McpCatalogPage | null;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    isFetching: boolean;
  };
  selected: Set<string>;
  onSelect: (s: Set<string>) => void;
  onAction: (action: Action, target: Target) => void;
}

function ReviewList({ repoKey, tab, result, selected, onSelect, onAction }: ReviewListProps) {
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
  const rows = result.data?.items ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        {tab === "queue" ? "No MCP servers await a decision." : `No ${tab} MCP servers.`}
      </div>
    );
  }
  // Bulk decisions act on name rows; a drifted version is decided on its own.
  const selectable = rows.filter((r) => tab !== "queue" || needsNameDecision(r));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onSelect(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))}
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
                repoKey={repoKey}
                item={r}
                tab={tab}
                checked={selected.has(r.id)}
                selectable={tab !== "queue" || needsNameDecision(r)}
                onToggle={() => toggle(r.id)}
                onAction={onAction}
              />
            ))}
          </tbody>
        </table>
      </div>
      {result.data?.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Showing the first {rows.length}. Narrow the list with the Catalog tab&apos;s search.
        </p>
      )}
    </div>
  );
}

function ActionButtons({
  label,
  showApprove,
  showBlock,
  onApprove,
  onBlock,
}: {
  label: string;
  showApprove: boolean;
  showBlock: boolean;
  onApprove: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      {showApprove && (
        <Button variant="ghost" size="icon-sm" aria-label={`Approve ${label}`} onClick={onApprove}>
          <Check className="size-4 text-emerald-600" />
        </Button>
      )}
      {showBlock && (
        <Button variant="ghost" size="icon-sm" aria-label={`Block ${label}`} onClick={onBlock}>
          <Ban className="size-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

function ReviewRow({
  repoKey,
  item,
  tab,
  checked,
  selectable,
  onToggle,
  onAction,
}: {
  repoKey: string;
  item: McpCatalogItem;
  tab: ReviewTab;
  checked: boolean;
  selectable: boolean;
  onToggle: () => void;
  onAction: (action: Action, target: Target) => void;
}) {
  const drifted = tab === "queue" ? driftedPins(item) : [];
  const risk = catalogRisk(item);
  const lint = lintSummary(item.summary?.lint);
  const nameRow = tab !== "queue" || needsNameDecision(item);
  return (
    <>
      <tr>
        <td className="px-3 py-2 align-top">
          {selectable && <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select ${item.name}`} />}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <SafeText max={NAME_MAX_LENGTH} className="font-medium break-all" value={item.name} />
            {item.latestVersion && <span className="font-mono text-xs text-muted-foreground">latest {item.latestVersion}</span>}
            {(tab === "queue" || item.status !== tab) && <McpReviewStatusBadge status={item.status} />}
            {item.upstreamStatus && item.upstreamStatus !== "active" && (
              <Badge variant="outline" className="text-[11px]">upstream {item.upstreamStatus}</Badge>
            )}
          </div>
          {item.title && <SafeText as="p" max={NAME_MAX_LENGTH} className="mt-0.5 text-xs font-medium" value={item.title} />}
          {item.description && <SafeText as="p" className="mt-0.5 text-xs text-muted-foreground" value={item.description} />}
          {item.summary && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <McpSummaryChips summary={item.summary} />
            </div>
          )}
          <div className="text-xs">
            <McpCatalogNotes item={item} />
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          {risk ? <McpRiskText level={risk.level} score={risk.score} /> : <span className="text-xs text-muted-foreground">unknown</span>}
        </td>
        <td className="px-3 py-2 align-top text-xs">
          {lint && (
            <p className={item.summary?.lint && item.summary.lint.block > 0 ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>
              Lint ({item.summary?.lint?.version}): {lint}
            </p>
          )}
          <McpCatalogToolDiff repoKey={repoKey} item={item} />
        </td>
        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
          <time dateTime={item.firstSeenAt} title={item.firstSeenAt}>
            {formatRelativeTimestamp(item.firstSeenAt)}
          </time>
        </td>
        <td className="px-3 py-2 align-top">
          {nameRow && (
            <ActionButtons
              label={item.name}
              showApprove={tab !== "approved"}
              showBlock={tab !== "blocked"}
              onApprove={() => onAction("approve", { item })}
              onBlock={() => onAction("block", { item })}
            />
          )}
        </td>
      </tr>
      {drifted.map((pin) => (
        <tr key={pin.id} className="bg-amber-50/40 dark:bg-amber-950/10">
          <td />
          <td className="px-3 py-2 align-top text-xs" colSpan={4}>
            <span className="font-mono">
              {item.name} {pin.version}
            </span>
            <span className="ml-2 text-amber-700 dark:text-amber-400">
              Upstream content changed after approval; held until decided again.
            </span>
          </td>
          <td className="px-3 py-2 align-top">
            <ActionButtons
              label={`${item.name} ${pin.version}`}
              showApprove
              showBlock
              onApprove={() => onAction("approve", { item, pin })}
              onBlock={() => onAction("block", { item, pin })}
            />
          </td>
        </tr>
      ))}
    </>
  );
}
