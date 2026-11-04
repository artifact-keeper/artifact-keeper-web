import { useId } from "react";
import Link from "next/link";
import { KeyRound, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { McpServerAvatar } from "@/components/mcp/server-avatar";
import { McpTransportBadges } from "@/components/mcp/transport-badges";
import { McpSourceBadge } from "@/components/mcp/source-badge";
import { McpStatusBadge } from "@/components/mcp/status-badge";
import { McpRiskBadges } from "@/components/mcp/risk-badges";
import { splitServerName } from "@/lib/mcp/format";
import { assessRisk } from "@/lib/mcp/risk";
import { akSourceMeta, officialMeta, secretsOf, sourceKind } from "@/lib/mcp/server-json";
import type { McpServedEntry } from "@/types/mcp";

/**
 * Where a card links. The server detail lives on the package page; without
 * a catalog id (the package list is capped, or the row is not indexed yet)
 * the card points back at the repository's Servers tab, filtered to it.
 */
export function mcpServerHref(repoKey: string, name: string, packageId?: string): string {
  if (packageId) return `/packages/${encodeURIComponent(packageId)}`;
  return `/repositories/${encodeURIComponent(repoKey)}?tab=packages&server=${encodeURIComponent(name)}`;
}

/** Signals already shown elsewhere on the card (secrets) or on every stdio server. */
const CARD_HIDDEN_SIGNALS = new Set(["secrets", "runs_locally"]);

/**
 * A server in the gallery. An `<article>` with one primary link (the name);
 * the Install button is its sibling, never nested inside the link. A tool
 * count is not shown: the served document does not carry one, and "0 tools"
 * would be a claim nobody made.
 */
export function McpServerCard({
  repoKey,
  entry,
  packageId,
  onInstall,
  showRepo,
}: {
  repoKey: string;
  entry: McpServedEntry;
  packageId?: string;
  onInstall?: (e: McpServedEntry) => void;
  showRepo?: boolean;
}) {
  const titleId = useId();
  const { server } = entry;
  const { namespace, shortName } = splitServerName(server.name);
  const official = officialMeta(entry);
  const status = official?.status ?? "active";
  const source = sourceKind(entry);
  const secrets = secretsOf(server);
  const risk = assessRisk({ server, status, source, policy: akSourceMeta(entry)?.packagePolicy });
  const signals = risk.signals.filter((s) => !CARD_HIDDEN_SIGNALS.has(s.id));

  return (
    <article
      aria-labelledby={titleId}
      data-testid="mcp-server-card"
      className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start gap-3">
        <McpServerAvatar name={server.name} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="break-all text-sm leading-5">
            <Link href={mcpServerHref(repoKey, server.name, packageId)} className="hover:underline">
              {namespace && <span className="text-muted-foreground">{namespace}/</span>}
              <span className="font-semibold">{shortName}</span>
            </Link>
          </h3>
          {server.title && <p className="truncate text-xs text-muted-foreground">{server.title}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <McpSourceBadge kind={source} />
        <Badge variant="outline" className="font-mono font-normal">
          v{server.version}
        </Badge>
        {official?.isLatest && <Badge variant="secondary">latest</Badge>}
        {status !== "active" && <McpStatusBadge status={status} />}
        {showRepo && (
          <Badge variant="outline" className="font-normal" title={`Repository ${repoKey}`}>
            <span className="sr-only">Repository </span>
            {repoKey}
          </Badge>
        )}
      </div>

      {server.description && <p className="line-clamp-2 text-sm text-muted-foreground">{server.description}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <McpTransportBadges server={server} />
        {secrets.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title={`Needs ${secrets.join(", ")}`}
          >
            <KeyRound className="size-3" aria-hidden="true" />
            {secrets.length} secret{secrets.length === 1 ? "" : "s"}
          </span>
        )}
        <McpRiskBadges signals={signals} max={2} />
      </div>

      {onInstall && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInstall(entry)}
            aria-label={`Install ${server.name}`}
          >
            <Plug className="size-3.5" aria-hidden="true" />
            Install
          </Button>
        </div>
      )}
    </article>
  );
}
