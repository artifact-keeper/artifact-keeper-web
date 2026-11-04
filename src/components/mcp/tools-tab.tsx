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
import type { McpCapabilities, McpCapabilitySnapshot, McpTool } from "@/types/mcp";

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

/** `3h ago` style text for `observedAt`. */
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

function ToolRow({ tool }: { tool: McpTool }) {
  const [open, setOpen] = useState(false);
  const schema = tool.inputSchema === undefined ? null : JSON.stringify(tool.inputSchema, null, 2);
  return (
    <li className="rounded-md border p-3 space-y-1" data-tool={tool.name}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-medium">{tool.name}</code>
        <AnnotationChips tool={tool} />
      </div>
      {tool.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{tool.description}</p>}
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
      {snap.provenance && <span>{snap.provenance}</span>}
      {snap.observedAt && (
        <time dateTime={snap.observedAt} title={snap.observedAt}>
          {relativeTime(snap.observedAt)}
        </time>
      )}
      {snap.protocolVersion && <span>protocol {snap.protocolVersion}</span>}
    </div>
  );
}

function SnapshotView({ snap }: { snap: McpCapabilitySnapshot }) {
  const tools = snap.tools ?? [];
  const resources = snap.resources ?? [];
  const prompts = snap.prompts ?? [];
  return (
    <div className="space-y-3">
      <SnapshotHeader snap={snap} />
      {(snap.authState === "auth_required" || snap.authState === "caller_specific") && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>
            {snap.authState === "caller_specific"
              ? "This list may differ per user: the server marked it private."
              : "Unauthenticated view: signed-in users may see different tools."}
          </AlertDescription>
        </Alert>
      )}
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
                <ToolRow key={`${t.name}-${i}`} tool={t} />
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

/** The newest successful snapshot summary of each source, best source first. */
export function sourcePicks(caps: McpCapabilities): McpCapabilitySnapshot[] {
  const picks = new Map<string, McpCapabilitySnapshot>();
  for (const s of caps.snapshots) {
    if (s.outcome === "ok" && !picks.has(s.source)) picks.set(s.source, s);
  }
  const rank = (src: string) => {
    const i = SOURCE_ORDER.indexOf(src);
    return i === -1 ? SOURCE_ORDER.length : i;
  };
  return [...picks.values()].sort((a, b) => rank(a.source) - rank(b.source));
}

/** The backend's "current" order: observed first, the declaration last. */
const SOURCE_ORDER = ["sandbox_run", "remote_probe", "gateway_reported", "ci_reported", "publisher_declared"];

export function McpToolsTab({ repoKey, name, version }: { repoKey: string; name: string; version: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: mcpKeys.capabilities(repoKey, name, version),
    queryFn: () => mcpApi.capabilities(repoKey, name, version),
  });
  const currentId = data?.current?.id ?? null;
  const other = useQuery({
    queryKey: [...mcpKeys.capabilities(repoKey, name, version), "snapshot", picked],
    queryFn: () => mcpApi.capabilities(repoKey, name, version, { snapshot: picked ?? undefined }),
    enabled: !!picked && picked !== currentId,
  });
  const probe = useMutation({
    mutationFn: () => mcpApi.probe(repoKey, name, version),
    onSuccess: (r) => {
      toast.success(r.queued.length > 0 ? "Probe queued" : "A probe is already queued");
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

  const canProbe = data.introspection.probeEnabled || data.introspection.sandboxEnabled;
  const probeButton = user?.is_admin && canProbe && (
    <Button variant="outline" size="sm" onClick={() => probe.mutate()} disabled={probe.isPending} className="gap-1.5">
      <RefreshCw className="size-3.5" aria-hidden="true" />
      Re-probe
    </Button>
  );
  const openJobs = (data.introspection.jobs ?? []).filter((j) => j.status === "pending" || j.status === "claimed");

  if (!data.current) {
    const newest = data.snapshots[0];
    if (newest?.outcome === "needs_config") {
      return (
        <EmptyState
          icon={Wrench}
          title="Server could not be started without configuration"
          description="The sandbox needs values for required inputs before it can list the tools."
          action={probeButton || undefined}
        />
      );
    }
    return (
      <EmptyState
        icon={Wrench}
        title="Capabilities not declared or observed"
        description={
          openJobs.length > 0
            ? `${openJobs.length} introspection job${openJobs.length === 1 ? " is" : "s are"} queued for this version.`
            : "Declare tools in the server.json under _meta com.artifactkeeper/capabilities, or report them from CI through the capabilities ingest API."
        }
        action={probeButton || undefined}
      />
    );
  }

  const picks = sourcePicks(data);
  const selectedId = picked ?? currentId;
  const snap = selectedId === currentId ? data.current : (other.data?.current ?? null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {picks.length > 1 ? (
          <div role="group" aria-label="Snapshot source" className="flex flex-wrap gap-1">
            {picks.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={s.id === selectedId ? "secondary" : "ghost"}
                aria-pressed={s.id === selectedId}
                onClick={() => setPicked(s.id)}
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
      <p className="text-xs text-muted-foreground">{data.notice}</p>
      {openJobs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {openJobs.length} introspection job{openJobs.length === 1 ? "" : "s"} queued.
        </p>
      )}
      {snap ? (
        <SnapshotView snap={snap} />
      ) : other.isError || (other.isSuccess && !other.data?.current) ? (
        <p className="py-6 text-center text-sm text-muted-foreground">This snapshot is no longer available.</p>
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading snapshot" />
        </div>
      )}
    </div>
  );
}
