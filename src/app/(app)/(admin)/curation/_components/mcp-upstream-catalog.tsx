"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { mcpApi, MCP_SEARCH_MIN_CHARS } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import type { McpUpstreamEntry } from "@/types/mcp";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { McpNotAvailable, McpReviewStatusBadge, McpTransportChips } from "./mcp-queue-parts";

/**
 * The Remote's upstream catalog, browsable only here (never on `/v0.1`):
 * deny by default means an upstream entry is invisible to clients until an
 * administrator approves its name, so every row is greyed and says so.
 */
export function McpUpstreamCatalog({ repoKey }: { repoKey: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  const query = useInfiniteQuery({
    queryKey: mcpKeys.upstream(repoKey, { search }),
    queryFn: ({ pageParam }) =>
      mcpApi.upstreamCatalog(repoKey, { search: search || undefined, cursor: pageParam || undefined }),
    initialPageParam: "",
    getNextPageParam: (last) => last?.next_cursor || undefined,
  });

  const request = useMutation({
    mutationFn: (name: string) => mcpApi.requestApproval(repoKey, name),
    onSuccess: (_r, name) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success(`Approval requested for ${name}`);
    },
    onError: mutationErrorToast("Failed to request approval"),
  });

  const pages = query.data?.pages ?? [];
  const tooShort = draft.trim().length > 0 && draft.trim().length < MCP_SEARCH_MIN_CHARS;

  if (pages[0] === null) return <McpNotAvailable what="Upstream catalog browsing" />;

  const entries = pages.flatMap((p) => p?.servers ?? []);
  const upstreamError = pages.some((p) => !!p?.upstream_error);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooShort) setSearch(draft.trim());
        }}
      >
        <Input
          className="w-72"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search the upstream registry"
          aria-label="Search upstream catalog"
          aria-describedby="mcp-catalog-search-help"
        />
        <Button type="submit" variant="outline" size="sm" disabled={tooShort}>
          <Search className="size-4" /> Search
        </Button>
        <p id="mcp-catalog-search-help" className="text-xs text-muted-foreground">
          {tooShort
            ? `Enter at least ${MCP_SEARCH_MIN_CHARS} characters.`
            : "Not visible to clients until approved."}
        </p>
      </form>

      {upstreamError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Upstream unavailable</AlertTitle>
          <AlertDescription>
            The upstream registry could not be reached; nothing is served until
            it can be evaluated (fail closed).
          </AlertDescription>
        </Alert>
      )}

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

      {!query.isLoading && !query.isError && entries.length === 0 && !upstreamError && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {search ? "No upstream servers match." : "The upstream catalog is empty."}
        </div>
      )}

      {entries.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label="Upstream servers">
          {entries.map((e) => (
            <CatalogRow
              key={`${e.server.name}@${e.server.version}`}
              entry={e}
              requesting={request.isPending && request.variables === e.server.name}
              onRequest={() => request.mutate(e.server.name)}
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
  entry,
  requesting,
  onRequest,
}: {
  entry: McpUpstreamEntry;
  requesting: boolean;
  onRequest: () => void;
}) {
  const { server, review_status } = entry;
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2">
      {/* Greyed: an upstream entry is not served until its name is approved. */}
      <div className="min-w-0 flex-1 opacity-70">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">{server.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{server.version}</span>
          {review_status ? (
            <McpReviewStatusBadge status={review_status} />
          ) : (
            <Badge variant="outline">Not requested</Badge>
          )}
        </div>
        {server.description && <p className="mt-0.5 text-xs text-muted-foreground">{server.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <McpTransportChips server={server} />
          <span className="text-xs text-muted-foreground">Not visible to clients until approved</span>
        </div>
      </div>
      {!review_status && (
        <Button size="sm" variant="outline" onClick={onRequest} disabled={requesting} aria-label={`Request approval for ${server.name}`}>
          {requesting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Request approval
        </Button>
      )}
    </li>
  );
}
