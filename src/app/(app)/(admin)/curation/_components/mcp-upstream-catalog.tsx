"use client";

import { NAME_MAX_LENGTH } from "@/lib/untrusted-text";
import { SafeText } from "@/components/common/safe-text";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import type { McpCatalogItem } from "@/types/mcp";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { McpCatalogNotes, McpNotAvailable, McpReviewStatusBadge, McpSummaryChips } from "./mcp-queue-parts";

/**
 * The Remote's upstream catalog (`GET /catalog`), browsable only here, never
 * on `/v0.1`. The sync records every upstream name with a cached summary, so
 * browsing never calls upstream. Deny by default means a name is invisible to
 * clients until an administrator approves it, so unapproved rows are greyed
 * and say so; any reader may ask for one.
 */

/** Backend cap on `search` (characters). */
const SEARCH_MAX_CHARS = 200;
export function McpUpstreamCatalog({ repoKey }: { repoKey: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  const query = useInfiniteQuery({
    queryKey: mcpKeys.upstream(repoKey, { search }),
    queryFn: ({ pageParam }) =>
      mcpApi.listCatalog(repoKey, { search: search || undefined, cursor: pageParam || undefined }),
    initialPageParam: "",
    getNextPageParam: (last) => last?.nextCursor || undefined,
  });

  const request = useMutation({
    mutationFn: (item: McpCatalogItem) => mcpApi.requestApproval(repoKey, item.id),
    onSuccess: (_r, item) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success(`Approval requested for ${item.name}`);
    },
    onError: mutationErrorToast("Failed to request approval"),
  });

  const pages = query.data?.pages ?? [];
  const tooLong = draft.trim().length > SEARCH_MAX_CHARS;

  if (pages[0] === null) return <McpNotAvailable what="Upstream catalog browsing" />;

  const entries = pages.flatMap((p) => p?.items ?? []);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooLong) setSearch(draft.trim());
        }}
      >
        <Input
          className="w-72"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search upstream server names"
          aria-label="Search upstream catalog"
          aria-describedby="mcp-catalog-search-help"
        />
        <Button type="submit" variant="outline" size="sm" disabled={tooLong}>
          <Search className="size-4" /> Search
        </Button>
        <p id="mcp-catalog-search-help" className="text-xs text-muted-foreground">
          {tooLong
            ? `At most ${SEARCH_MAX_CHARS} characters.`
            : "Not visible to clients until approved."}
        </p>
      </form>

      {query.isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {toUserMessage(query.error, "Couldn't load the upstream catalog")}
        </p>
      )}

      {!query.isLoading && !query.isError && entries.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {search ? "No upstream servers match." : "The upstream catalog is empty (has the Remote synced yet?)."}
        </div>
      )}

      {entries.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label="Upstream servers">
          {entries.map((e) => (
            <CatalogRow
              key={e.id}
              item={e}
              requesting={request.isPending && request.variables?.id === e.id}
              onRequest={() => request.mutate(e)}
            />
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function CatalogRow({
  item,
  requesting,
  onRequest,
}: {
  item: McpCatalogItem;
  requesting: boolean;
  onRequest: () => void;
}) {
  const served = item.status === "approved" && item.denied !== true;
  const requestable = item.denied !== true && (item.status === "pending" || item.status === "review");
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2">
      {/* Greyed: an upstream name is not served until it is approved. */}
      <div className={`min-w-0 flex-1 ${served ? "" : "opacity-70"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <SafeText max={NAME_MAX_LENGTH} className="font-medium break-all" value={item.name} />
          {item.latestVersion && <span className="font-mono text-xs text-muted-foreground">{item.latestVersion}</span>}
          <McpReviewStatusBadge status={item.status} />
        </div>
        {item.description && <SafeText as="p" className="mt-0.5 text-xs text-muted-foreground" value={item.description} />}
        {item.summary && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <McpSummaryChips summary={item.summary} />
          </div>
        )}
        <McpCatalogNotes item={item} />
        {!served && <p className="mt-1 text-xs text-muted-foreground">Not visible to clients until approved</p>}
      </div>
      {requestable && (
        <Button size="sm" variant="outline" onClick={onRequest} disabled={requesting} aria-label={`Request approval for ${item.name}`}>
          {requesting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Request approval
        </Button>
      )}
    </li>
  );
}
