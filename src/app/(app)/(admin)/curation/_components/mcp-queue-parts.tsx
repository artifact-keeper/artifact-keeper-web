"use client";

import { SafeText } from "@/components/common/safe-text";
import { NAME_MAX_LENGTH } from "@/lib/untrusted-text";
import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { MCP_RISK_LEVEL_LABEL, type McpRiskLevel } from "@/lib/mcp/risk";
import type { McpCatalogItem, McpCatalogSummary } from "@/types/mcp";
import { diffVersion, plural, requestNote, summaryTransports, typosquatNote, unresolvedNote } from "./mcp-review-format";

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
      {typo && <SafeText as="p" max={NAME_MAX_LENGTH} className="mt-1 text-xs text-amber-700 dark:text-amber-400" value={typo} />}
      {requested && <SafeText as="p" className="mt-1 text-xs text-muted-foreground" value={requested} />}
      {unresolved && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{unresolved}</p>}
      {item.evaluationReason && <SafeText as="p" className="mt-1 text-xs text-muted-foreground" value={`Reason: ${item.evaluationReason}`} />}
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
    <SafeText
      as="p"
      className={`text-xs ${destructive ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}
      value={data.summary.text}
    />
  );
}

/** Transport chips and the secret count of a catalog row's cached summary. */
export function McpSummaryChips({ summary }: { summary: McpCatalogSummary }) {
  return (
    <>
      {summaryTransports(summary).map((t) => (
        <Badge key={t.key} variant="outline" className="font-mono text-[11px]">
          {t.label}
        </Badge>
      ))}
      {summary.secretsCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
          aria-label={plural(summary.secretsCount, "secret")}
          title={plural(summary.secretsCount, "secret")}
        >
          <KeyRound className="size-3" aria-hidden="true" />
          {summary.secretsCount}
        </span>
      )}
    </>
  );
}

const RISK_CLASS: Record<McpRiskLevel, string> = {
  low: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
  medium: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400",
  high: "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
  critical: "border-red-500 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export function McpRiskText({ level, score }: { level: McpRiskLevel; score: number }) {
  return (
    <Badge variant="outline" className={RISK_CLASS[level]} title={`Risk score ${score}`}>
      Risk {MCP_RISK_LEVEL_LABEL[level]}
    </Badge>
  );
}
