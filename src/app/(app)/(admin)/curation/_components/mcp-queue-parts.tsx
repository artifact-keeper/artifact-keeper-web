"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import type { McpCatalogItem } from "@/types/mcp";
import { diffVersion, requestNote, typosquatNote, unresolvedNote } from "./mcp-review-format";

/** Muted note for a surface the backend does not serve. */
export function McpNotAvailable({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {what} is not available on this server.
    </p>
  );
}

const REVIEW_STATUS_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  blocked: "destructive",
  approved: "secondary",
};

export function McpReviewStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={REVIEW_STATUS_VARIANT[status] ?? "outline"} className="capitalize">
      {status === "review" ? "needs review" : status}
    </Badge>
  );
}

/**
 * The server-side signals of a catalog row: deny-list match, lookalike flag,
 * approval requests and unresolved packages. Everything comes from the
 * catalog item, never from the upstream document's own text.
 */
export function McpCatalogNotes({ item }: { item: McpCatalogItem }) {
  const typo = typosquatNote(item);
  const requested = requestNote(item);
  const unresolved = unresolvedNote(item);
  return (
    <>
      {item.denied && (
        <p className="mt-1 text-xs text-destructive">Matches a deny glob: never served, whatever its status.</p>
      )}
      {typo && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{typo}</p>}
      {requested && <p className="mt-1 text-xs text-muted-foreground">{requested}</p>}
      {unresolved && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{unresolved}</p>}
      {item.evaluationReason && <p className="mt-1 text-xs text-muted-foreground">Reason: {item.evaluationReason}</p>}
    </>
  );
}

/**
 * The tool diff of the row's ingested version (`GET .../capabilities/diff`,
 * the approval queue's use of it): `summary.text` against the previous
 * snapshot or version. Nothing while loading, when nothing was ingested, or
 * when there is no snapshot.
 */
export function McpCatalogToolDiff({ repoKey, item }: { repoKey: string; item: McpCatalogItem }) {
  const v = diffVersion(item);
  const { data } = useQuery({
    queryKey: [...mcpKeys.capabilities(repoKey, item.name, v?.version ?? ""), "diff"],
    queryFn: () => mcpApi.capabilitiesDiff(repoKey, item.name, v!.version),
    enabled: !!v,
    retry: false,
  });
  if (!data || data.summary.identical) return null;
  const destructive = data.summary.destructiveAdded.length > 0;
  return (
    <p className={`text-xs ${destructive ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
      {data.summary.text}
    </p>
  );
}
