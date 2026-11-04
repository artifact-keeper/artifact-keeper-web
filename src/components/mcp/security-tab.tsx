"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { assessRisk, type McpRiskSignal } from "@/lib/mcp/risk";
import type { McpSourceKind } from "@/lib/mcp/server-json";
import { SeverityBadge } from "@/components/common/severity-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { McpRiskLevelBadge } from "@/components/mcp/risk-badges";
import { healthFor, packageLinks, repoHref, type McpPackageLink } from "@/components/mcp/backing";
import type { McpHealth, McpPackagePin, McpPackagePolicy, McpServerJson, McpServerStatus } from "@/types/mcp";

/**
 * Security tab of an MCP server version: the risk signals as a checklist
 * (every signal with its reason), and one section per pinned package with
 * its scan state from the Phase 3 health roll-up. A backend without the
 * roll-up gets a link to the backing repository's own Security tab instead.
 */

export interface McpSecurityTabProps {
  repoKey: string;
  name: string;
  version: string;
  server: McpServerJson;
  pins?: McpPackagePin[];
  policy?: McpPackagePolicy;
  status?: McpServerStatus;
  source?: McpSourceKind;
}

function SignalIcon({ s }: { s: McpRiskSignal }) {
  if (s.tone === "red") return <ShieldAlert className="size-4 shrink-0 text-red-500" aria-hidden="true" />;
  if (s.tone === "amber") return <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />;
  return <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const COUNT_KEYS = ["critical", "high", "medium", "low"] as const;

function PackageSection({ link, health }: { link: McpPackageLink; health: McpHealth | null | undefined }) {
  const row = healthFor(link, health);
  const repo = link.repository;
  return (
    <section className="rounded-lg border p-3 space-y-2" aria-label={`Package ${link.coordinate}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-xs">{link.coordinate}</code>
        {repo && (
          <Link href={repoHref(repo)} className="text-xs text-primary hover:underline">
            {repo}
          </Link>
        )}
      </div>
      {health === null || (health && !row) ? (
        repo && (
          <p className="text-sm text-muted-foreground">
            {health === null ? "Scan roll-up is not available on this server. " : "No scan result yet. "}
            <Link href={repoHref(repo, "security")} className="text-primary hover:underline">
              See {repo} security
            </Link>
          </p>
        )
      ) : row ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Scan: {row.scan_state ?? "unknown"}</span>
          {row.max_severity && <SeverityBadge severity={row.max_severity} />}
          {COUNT_KEYS.filter((k) => (row[k] ?? 0) > 0).map((k) => (
            <span key={k} className="text-xs">
              {row[k]} {k}
            </span>
          ))}
          {row.gate && <span className="text-xs text-red-600 dark:text-red-400">held: {row.gate}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading scan state…</p>
      )}
    </section>
  );
}

export function McpSecurityTab({ repoKey, name, version, server, pins, policy, status, source }: McpSecurityTabProps) {
  const { data: health } = useQuery({
    queryKey: mcpKeys.health(repoKey, name, version),
    queryFn: () => mcpApi.health(repoKey, name, version),
  });
  const { data: capabilities } = useQuery({
    queryKey: mcpKeys.capabilities(repoKey, name, version),
    queryFn: () => mcpApi.capabilities(repoKey, name, version),
  });
  const risk = assessRisk({ server, status, source, policy, pins, health, capabilities });
  const pinned = packageLinks(server, pins, policy).filter((l) => l.mirrored);

  return (
    <div className="space-y-6">
      {policy === "open" && (server.packages?.length ?? 0) > 0 && (
        <Alert className="border-amber-300 dark:border-amber-800">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Open catalog</AlertTitle>
          <AlertDescription>
            This repository serves package references as published. They are not resolved, scanned or held by
            Artifact Keeper, so a vulnerable package does not hide this server.
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="mcp-risk-heading" className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 id="mcp-risk-heading" className="text-sm font-medium">
            Risk signals
          </h3>
          <McpRiskLevelBadge level={risk.level} score={risk.score} />
        </div>
        {risk.signals.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" /> No risk signals apply.
          </p>
        ) : (
          <ul role="list" className="space-y-2">
            {risk.signals.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm" data-signal={s.id}>
                <SignalIcon s={s} />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">: {s.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Signals are a reading aid. No combination of them marks a server safe.
        </p>
      </section>

      <section aria-labelledby="mcp-packages-heading" className="space-y-2">
        <h3 id="mcp-packages-heading" className="text-sm font-medium">
          Pinned packages
        </h3>
        {pinned.length === 0 ? (
          <p className="text-sm text-muted-foreground">No package of this version is pinned in Artifact Keeper.</p>
        ) : (
          pinned.map((l) => <PackageSection key={l.index} link={l} health={health} />)
        )}
      </section>
    </div>
  );
}
