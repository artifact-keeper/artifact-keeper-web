"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { splitServerName } from "@/lib/mcp/format";
import { inputsOf, isSafeHttpUrl, runnerLabel, runnersOf, type McpSourceKind } from "@/lib/mcp/server-json";
import { McpSourceBadge } from "@/components/mcp/source-badge";
import { McpRunnerList } from "@/components/mcp/runner-list";
import { McpServerJsonViewer } from "@/components/mcp/server-json-viewer";
import { McpInputsTable } from "@/components/mcp/env-vars-table";
import { McpBundlePanel } from "@/components/mcp/bundle-panel";
import { packageLinks, repoHref, shortDigest, upstreamOf, type McpPackageLink } from "@/components/mcp/backing";
import type {
  McpInput,
  McpOfficialMeta,
  McpPackagePin,
  McpPackagePolicy,
  McpServerJson,
  McpTransport,
} from "@/types/mcp";

/**
 * Tab bodies of the MCP server detail page. Everything rendered from the
 * server.json is publisher text: plain text only, links only through
 * `isSafeHttpUrl`.
 */

export function SafeLink({ url, children }: { url?: string; children?: ReactNode }) {
  if (!url) return <span className="text-muted-foreground">--</span>;
  if (!isSafeHttpUrl(url)) return <span className="break-all">{url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
      {children ?? url}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function OverviewSection({
  server,
  official,
  source,
  pins,
  repoKey,
  raw,
}: {
  server: McpServerJson;
  official?: McpOfficialMeta;
  source?: McpSourceKind;
  pins?: McpPackagePin[];
  repoKey: string;
  raw: unknown;
}) {
  const { namespace } = splitServerName(server.name);
  return (
    <div className="space-y-6">
      {server.description && <p className="text-sm whitespace-pre-line">{server.description}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Field label="Name">
                <span className="font-mono text-xs">{server.name}</span>
              </Field>
              <Field label="Status">{official?.status ?? "not served"}</Field>
              <Field label="Published">{official?.publishedAt ? formatDate(official.publishedAt) : "--"}</Field>
              <Field label="Updated">{official?.updatedAt ? formatDate(official.updatedAt) : "--"}</Field>
              <Field label="Website">
                <SafeLink url={server.websiteUrl} />
              </Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Publisher</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Field label="Namespace">
                <span className="font-mono text-xs">{namespace || "--"}</span>
              </Field>
              <Field label="Source">{source ? <McpSourceBadge kind={source} /> : "--"}</Field>
              <Field label="Repository">
                <SafeLink url={server.repository?.url} />
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="mcp-ways-heading" className="space-y-2">
        <h3 id="mcp-ways-heading" className="text-sm font-medium">
          Ways to run
        </h3>
        <McpRunnerList server={server} pins={pins} repoKey={repoKey} />
      </section>
      <McpServerJsonViewer value={raw} label="Raw server.json" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Packages & Remotes
// ---------------------------------------------------------------------------

/** Command-line tokens of a runtime/package argument list, as a client would build them. */
export function argTokens(inputs: McpInput[] | undefined): string[] {
  return (inputs ?? []).flatMap((i) => {
    const hint = i.valueHint ?? (i.type === "positional" ? i.name : undefined);
    const value = i.value ?? i.default ?? (hint ? `<${hint}>` : undefined);
    if (i.type === "named") return [i.name ?? "", ...(value ? [value] : [])].filter(Boolean);
    return value ? [value] : [];
  });
}

export function Argv({ argv, label }: { argv: string[]; label: string }) {
  return (
    <pre aria-label={label} className="overflow-x-auto rounded bg-muted p-2 text-xs font-mono">
      {argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}
    </pre>
  );
}

function ServedFrom({ link, open }: { link: McpPackageLink; open: boolean }) {
  if (open || !link.mirrored) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Direct from {upstreamOf(link.pkg)}. Not resolved or gated by Artifact Keeper.
      </p>
    );
  }
  const repo = link.repository as string;
  return (
    <div className="space-y-1 text-xs">
      <p>
        Served from{" "}
        <Link href={repoHref(repo, "artifacts")} className="text-primary hover:underline">
          {repo}
        </Link>
        {link.drift && (
          <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
            tag moved
          </Badge>
        )}
      </p>
      {link.digest && (
        <p>
          Digest <code className="font-mono" title={link.digest}>{shortDigest(link.digest)}</code>
        </p>
      )}
      {link.children.length > 0 && (
        <ul className="ml-4 list-disc">
          {link.children.map((c) => (
            <li key={c.digest}>
              {c.platform} <code className="font-mono">{shortDigest(c.digest)}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackageCard({ link, repoKey, server, open }: { link: McpPackageLink; repoKey: string; server: McpServerJson; open: boolean }) {
  const p = link.pkg;
  const ident = p.registryType === "npm" || p.registryType === "pypi" ? `${p.identifier}${p.version ? `@${p.version}` : ""}` : p.identifier;
  const argv = [p.runtimeHint ?? "", ...argTokens(p.runtimeArguments), ident, ...argTokens(p.packageArguments)].filter(Boolean);
  return (
    <article className="space-y-3 rounded-lg border p-4" aria-label={`Package ${p.identifier}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{p.registryType}</Badge>
        <code className="font-mono text-sm break-all">{p.identifier}</code>
        {p.version && <span className="text-xs text-muted-foreground">{p.version}</span>}
        <Badge variant="outline">{p.transport?.type ?? "stdio"}</Badge>
      </div>
      <Argv argv={argv} label={`Command for ${p.identifier}`} />
      {(p.environmentVariables?.length ?? 0) > 0 && (
        <McpInputsTable inputs={p.environmentVariables ?? []} caption={`Environment of ${p.identifier}`} />
      )}
      <ServedFrom link={link} open={open} />
      {p.registryType === "mcpb" && <McpBundlePanel repoKey={repoKey} name={server.name} version={server.version} />}
    </article>
  );
}

function RemoteCard({ remote }: { remote: McpTransport }) {
  return (
    <article className="space-y-3 rounded-lg border border-dashed p-4" aria-label={`Remote ${remote.url ?? remote.type}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">remote {remote.type}</Badge>
        <code className="font-mono text-sm break-all">{remote.url}</code>
      </div>
      <p className="text-xs text-muted-foreground">Runs nothing locally. Nothing is stored in Artifact Keeper; this is an external endpoint.</p>
      {(remote.headers?.length ?? 0) > 0 && <McpInputsTable inputs={remote.headers ?? []} caption={`Headers for ${remote.url ?? remote.type}`} />}
    </article>
  );
}

export function PackagesSection({
  server,
  pins,
  policy,
  repoKey,
}: {
  server: McpServerJson;
  pins?: McpPackagePin[];
  policy?: McpPackagePolicy;
  repoKey: string;
}) {
  const links = packageLinks(server, pins, policy);
  const remotes = server.remotes ?? [];
  if (links.length === 0 && remotes.length === 0) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">This entry declares no way to run it.</p>;
  }
  return (
    <div className={`grid gap-4 ${links.length > 0 && remotes.length > 0 ? "md:grid-cols-2" : ""}`}>
      {links.length > 0 && (
        <section aria-label="Packages" className="space-y-3">
          <h3 className="text-sm font-medium">Packages</h3>
          {links.map((l) => (
            <PackageCard key={l.index} link={l} repoKey={repoKey} server={server} open={policy === "open"} />
          ))}
        </section>
      )}
      {remotes.length > 0 && (
        <section aria-label="Remotes" className="space-y-3">
          <h3 className="text-sm font-medium">Remotes</h3>
          {remotes.map((r, i) => (
            <RemoteCard key={`${r.url}-${i}`} remote={r} />
          ))}
        </section>
      )}
    </div>
  );
}

export function ConfigurationSection({ server }: { server: McpServerJson }) {
  const runners = runnersOf(server);
  const blocks = runners
    .map((r) => ({
      id: r.id,
      label: runnerLabel(r),
      inputs:
        r.kind === "package"
          ? inputsOf(r.pkg)
          : [...(r.remote.headers ?? []), ...Object.entries(r.remote.variables ?? {}).map(([name, v]) => ({ ...v, name }))],
    }))
    .filter((b) => b.inputs.length > 0);
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">This server takes no configuration.</p>;
  }
  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <McpInputsTable key={b.id} inputs={b.inputs} caption={b.label} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export interface McpVersionRow {
  version: string;
  served: boolean;
  status?: string;
  isLatest?: boolean;
  published?: string;
}

export function VersionsSection({
  rows,
  selected,
  heldSelected,
  onSelect,
}: {
  rows: McpVersionRow[];
  selected: string;
  /** The selected version answered with a reason-gated hold body. */
  heldSelected: boolean;
  onSelect: (v: string) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No versions.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Latest</TableHead>
          <TableHead>Published</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.version} data-state={r.version === selected ? "selected" : undefined}>
            <TableCell>
              <button
                type="button"
                className="font-mono text-xs text-primary hover:underline"
                aria-pressed={r.version === selected}
                onClick={() => onSelect(r.version)}
              >
                {r.version}
              </button>
            </TableCell>
            <TableCell>
              {r.served ? (
                r.status
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                  {r.version === selected && heldSelected ? "held" : "not visible to clients"}
                </Badge>
              )}
            </TableCell>
            <TableCell>{r.isLatest ? <Badge variant="secondary">latest</Badge> : null}</TableCell>
            <TableCell className="text-muted-foreground">{r.published ? formatDate(r.published) : "--"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
