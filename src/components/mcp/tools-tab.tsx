"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Info, Loader2, RefreshCw, Wrench } from "lucide-react";
import { mcpApi, mcpProblemMessage } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { useAuth } from "@/providers/auth-provider";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { McpCapabilitySnapshot, McpLintFinding, McpTool } from "@/types/mcp";

/**
 * Tools tab (decision 10 / decision 4 section 8). Everything here is a
 * snapshot from some source, and the source decides how much it means: a
 * publisher declaration is a claim, a CI or gateway report is someone else's
 * observation, a probe or sandbox run is AK's own. The provenance badge and
 * the auth banner say which, because tool lists can differ per caller and
 * annotations are asserted by the server itself.
 */

const PROVENANCE: Record<string, { label: string; color: "default" | "blue" | "green" }> = {
  publisher_declared: { label: "declared", color: "default" },
  ci_reported: { label: "CI-reported", color: "blue" },
  gateway_reported: { label: "gateway-reported", color: "blue" },
  remote_probe: { label: "observed (remote)", color: "green" },
  sandbox_run: { label: "observed (sandbox)", color: "green" },
};

export function provenanceOf(source: string) {
  return PROVENANCE[source] ?? { label: source, color: "default" as const };
}

/** `3h ago` style text for `observed_at`. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const ANNOTATION_TIP = "Server-asserted; untrusted unless the server is trusted.";

function AnnotationChips({ tool }: { tool: McpTool }) {
  const a = tool.annotations ?? {};
  const chips = [
    a.readOnlyHint && { key: "ro", text: "read-only", cls: "" },
    a.destructiveHint && { key: "de", text: "destructive", cls: "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400" },
    a.openWorldHint && { key: "ow", text: "open-world", cls: "" },
  ].filter(Boolean) as { key: string; text: string; cls: string }[];
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <Tooltip key={c.key}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={c.cls} aria-label={`${c.text}: ${ANNOTATION_TIP}`} tabIndex={0}>
              {c.text}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{ANNOTATION_TIP}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

function findingsFor(findings: McpLintFinding[], tool: McpTool, index: number): McpLintFinding[] {
  return findings.filter((f) => {
    const p = f.pointer ?? "";
    return p === `/tools/${index}` || p.startsWith(`/tools/${index}/`) || p.includes(`tools/${tool.name}`);
  });
}

function ToolRow({ tool, findings }: { tool: McpTool; findings: McpLintFinding[] }) {
  const [open, setOpen] = useState(false);
  const schema = tool.inputSchema === undefined ? null : JSON.stringify(tool.inputSchema, null, 2);
  return (
    <li className="rounded-md border p-3 space-y-1" data-tool={tool.name}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-medium">{tool.name}</code>
        <AnnotationChips tool={tool} />
      </div>
      {tool.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{tool.description}</p>}
      {findings.map((f, i) => (
        <p key={`${f.rule}-${i}`} className="text-xs text-amber-700 dark:text-amber-400">
          {f.rule}
          {f.message ? `: ${f.message}` : ""}
        </p>
      ))}
      {schema && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-1 text-xs">
              <ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
              inputSchema
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="relative">
            <pre aria-label={`${tool.name} input schema`} className="max-h-80 overflow-auto rounded bg-muted p-2 pr-8 text-xs font-mono">
              {schema}
            </pre>
            <CopyButton value={schema} label="Copy JSON" className="absolute right-1 top-1" />
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  );
}

function NamedList({ items }: { items: { name: string; title?: string; description?: string; uri?: string; uriTemplate?: string }[] }) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted-foreground">None.</p>;
  return (
    <ul role="list" className="space-y-2">
      {items.map((it, i) => (
        <li key={`${it.name}-${i}`} className="rounded-md border p-3">
          <code className="font-mono text-sm font-medium">{it.name}</code>
          {(it.uri ?? it.uriTemplate) && <span className="ml-2 font-mono text-xs text-muted-foreground">{it.uri ?? it.uriTemplate}</span>}
          {it.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{it.description}</p>}
        </li>
      ))}
    </ul>
  );
}

function SnapshotHeader({ snap }: { snap: McpCapabilitySnapshot }) {
  const prov = provenanceOf(snap.source);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <StatusBadge status={prov.label} color={prov.color} className="normal-case" />
      {snap.signature_state === "verified" && <StatusBadge status="signature verified" color="green" className="normal-case" />}
      {snap.signature_state === "invalid" && <StatusBadge status="signature invalid" color="red" className="normal-case" />}
      {snap.observed_at && (
        <time dateTime={snap.observed_at} title={snap.observed_at}>
          {relativeTime(snap.observed_at)}
        </time>
      )}
      {snap.protocol_version && <span>protocol {snap.protocol_version}</span>}
    </div>
  );
}

function SnapshotView({ snap }: { snap: McpCapabilitySnapshot }) {
  const tools = snap.tools ?? [];
  const resources = snap.resources ?? [];
  const prompts = snap.prompts ?? [];
  const findings = snap.findings ?? [];
  const unmatched = findings.filter((f) => !tools.some((t, i) => findingsFor([f], t, i).length > 0));
  if (snap.outcome === "needs_config") {
    return (
      <EmptyState
        icon={Wrench}
        title="Server could not be started without configuration"
        description="The sandbox needs values for required inputs before it can list the tools."
      />
    );
  }
  return (
    <div className="space-y-3">
      <SnapshotHeader snap={snap} />
      {(snap.auth_state === "auth_required" || snap.auth_state === "caller_specific") && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>Unauthenticated view: signed-in users may see different tools.</AlertDescription>
        </Alert>
      )}
      {unmatched.map((f, i) => (
        <p key={`${f.rule}-${i}`} className="text-xs text-amber-700 dark:text-amber-400">
          {f.rule}
          {f.message ? `: ${f.message}` : ""}
        </p>
      ))}
      <Tabs defaultValue="tools">
        <TabsList>
          <TabsTrigger value="tools">Tools ({tools.length})</TabsTrigger>
          <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>
          <TabsTrigger value="prompts">Prompts ({prompts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tools" className="pt-3">
          {tools.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul role="list" className="space-y-2">
              {tools.map((t, i) => (
                <ToolRow key={`${t.name}-${i}`} tool={t} findings={findingsFor(findings, t, i)} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="resources" className="pt-3">
          <NamedList items={resources} />
        </TabsContent>
        <TabsContent value="prompts" className="pt-3">
          <NamedList items={prompts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function McpToolsTab({ repoKey, name, version }: { repoKey: string; name: string; version: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [picked, setPicked] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: mcpKeys.capabilities(repoKey, name, version),
    queryFn: () => mcpApi.capabilities(repoKey, name, version),
  });
  const probe = useMutation({
    mutationFn: () => mcpApi.probe(repoKey, name, version),
    onSuccess: () => {
      toast.success("Probe queued");
      qc.invalidateQueries({ queryKey: mcpKeys.capabilities(repoKey, name, version) });
    },
    onError: (err) => toast.error(mcpProblemMessage(err) ?? "Probe failed"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading capabilities" />
      </div>
    );
  }
  if (!data) {
    return <EmptyState icon={Wrench} title="Capabilities are not available on this server" />;
  }

  const probeButton = user?.is_admin && data.probe_available && (
    <Button variant="outline" size="sm" onClick={() => probe.mutate()} disabled={probe.isPending} className="gap-1.5">
      <RefreshCw className="size-3.5" aria-hidden="true" />
      Re-probe
    </Button>
  );

  if (data.snapshots.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Capabilities not declared or observed"
        description="Declare tools in the server.json under _meta com.artifactkeeper/capabilities, or report them from CI through the capabilities ingest API."
        action={probeButton || undefined}
      />
    );
  }

  const snap = data.snapshots[Math.min(picked, data.snapshots.length - 1)];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {data.snapshots.length > 1 ? (
          <div role="group" aria-label="Snapshot source" className="flex flex-wrap gap-1">
            {data.snapshots.map((s, i) => (
              <Button
                key={s.id ?? `${s.source}-${i}`}
                size="sm"
                variant={i === picked ? "secondary" : "ghost"}
                aria-pressed={i === picked}
                onClick={() => setPicked(i)}
              >
                {provenanceOf(s.source).label}
              </Button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {probeButton}
      </div>
      <p className="text-xs text-muted-foreground">
        Tools can differ per user. Annotations such as read-only or destructive are asserted by the server and are
        untrusted unless the server is trusted.
      </p>
      <SnapshotView snap={snap} />
    </div>
  );
}
