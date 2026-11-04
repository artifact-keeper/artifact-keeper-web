"use client";

import { KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { secretsOf, transportsOf } from "@/lib/mcp/server-json";
import { MCP_RISK_LEVEL_LABEL, type McpRiskLevel } from "@/lib/mcp/risk";
import type { McpServerJson } from "@/types/mcp";
import { plural } from "./mcp-review-format";

/** Muted note for a Phase 2/3 surface the backend does not serve. */
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
 * Transport chips plus the secret count. Text chips rather than the gallery
 * badges keep the queue row dense; the labels come from `transportsOf`, so
 * they read the same everywhere.
 */
export function McpTransportChips({ server }: { server: McpServerJson }) {
  const secrets = secretsOf(server).length;
  return (
    <>
      {transportsOf(server).map((t) => (
        <Badge key={t.key} variant="outline" className="font-mono text-[11px]">
          {t.label}
        </Badge>
      ))}
      {secrets > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
          aria-label={plural(secrets, "secret")}
          title={plural(secrets, "secret")}
        >
          <KeyRound className="size-3" aria-hidden="true" />
          {secrets}
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
