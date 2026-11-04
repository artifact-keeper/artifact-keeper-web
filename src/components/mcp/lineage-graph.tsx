"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { runnerLabel, runnersOf, type McpRunner } from "@/lib/mcp/server-json";
import type { McpHealth, McpPackagePin, McpPackagePolicy, McpServerJson } from "@/types/mcp";
import {
  healthFor,
  isHoldingGate,
  packageLinks,
  repoHref,
  shortDigest,
  upstreamOf,
  type McpHealthPackage,
  type McpPackageLink,
} from "@/components/mcp/backing";

/**
 * Fixed four-column lineage of one server version (lens-ui section 5):
 * server version -> runners -> AK artifacts -> verdicts. Not a general graph,
 * because that is what the data is: each runner has at most one pinned
 * artifact and one verdict.
 *
 * The connectors are a decoration: an absolutely positioned, `aria-hidden`
 * SVG measured with ResizeObserver. The accessible version is the nested list
 * below, which is the only rendering under `md` and stays available to
 * screen readers (and becomes visible on keyboard focus) on wide screens.
 */

type Tone = "default" | "amber" | "red" | "green";

interface Row {
  runner: McpRunner;
  link?: McpPackageLink;
  artifact: { text: string; sub?: string; href?: string; dashed: boolean; tone: Tone };
  verdict?: { text: string; href?: string; tone: Tone };
}

function verdictOf(link: McpPackageLink, health: McpHealth | null | undefined): Row["verdict"] {
  if (!link.mirrored) return { text: "not gated by Artifact Keeper", tone: "amber" };
  if (health === null) return { text: "verdict not available on this server", tone: "default" };
  if (health === undefined) return { text: "loading verdict", tone: "default" };
  const h: McpHealthPackage | undefined = healthFor(link, health);
  if (!h) return { text: "no verdict yet", tone: "default" };
  const href = link.repository ? repoHref(link.repository, "security") : undefined;
  if (h.gate === "unavailable") return { text: "verdict unavailable", href, tone: "default" };
  if (isHoldingGate(h.gate)) return { text: `held: ${h.gate}`, href, tone: "red" };
  if (h.critical > 0) return { text: `${h.critical} critical`, href, tone: "red" };
  if (h.high > 0) return { text: `${h.high} high`, href, tone: "red" };
  if (h.medium > 0) return { text: `${h.medium} medium`, href, tone: "amber" };
  if (!h.scanned) return { text: "not scanned yet", href, tone: "default" };
  return { text: h.grade ? `clean (grade ${h.grade})` : "clean", href, tone: "green" };
}

function buildRows(
  server: McpServerJson,
  pins: McpPackagePin[] | undefined,
  health: McpHealth | null | undefined,
  policy: McpPackagePolicy | undefined,
): Row[] {
  const links = packageLinks(server, pins, policy);
  return runnersOf(server).map((runner): Row => {
    if (runner.kind === "remote") {
      return {
        runner,
        artifact: { text: "nothing stored, external endpoint", dashed: true, tone: "default" },
      };
    }
    const link = links[runner.index];
    if (!link.mirrored) {
      return {
        runner,
        link,
        artifact: { text: `not mirrored: ${upstreamOf(link.pkg)}`, dashed: true, tone: "amber" },
        verdict: verdictOf(link, health),
      };
    }
    const repo = link.repository as string;
    return {
      runner,
      link,
      artifact: {
        text: repo,
        sub: link.digest ? shortDigest(link.digest) : `${link.pkg.identifier}${link.pkg.version ? `@${link.pkg.version}` : ""}`,
        href: repoHref(repo, "artifacts"),
        dashed: false,
        tone: link.drift ? "amber" : "default",
      },
      verdict: verdictOf(link, health),
    };
  });
}

const TONE_TEXT: Record<Tone, string> = {
  default: "text-border",
  amber: "text-amber-500",
  red: "text-red-500",
  green: "text-emerald-500",
};

const TONE_NODE: Record<Tone, string> = {
  default: "border-border",
  amber: "border-amber-400 dark:border-amber-700",
  red: "border-red-400 dark:border-red-700",
  green: "border-emerald-400 dark:border-emerald-700",
};

function Node({
  nodeRef,
  href,
  dashed,
  tone = "default",
  children,
  style,
}: {
  nodeRef: (el: HTMLElement | null) => void;
  href?: string;
  dashed?: boolean;
  tone?: Tone;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const cls = cn(
    "block rounded-md border bg-card p-2 text-xs min-w-0 [overflow-wrap:anywhere]",
    dashed && "border-dashed",
    TONE_NODE[tone],
  );
  // The visual grid duplicates the accessible list, so its links leave the tab order.
  return href ? (
    <Link href={href} ref={nodeRef} className={cn(cls, "hover:bg-accent")} style={style} tabIndex={-1}>
      {children}
    </Link>
  ) : (
    <div ref={nodeRef} className={cls} style={style}>
      {children}
    </div>
  );
}

interface Edge {
  from: string;
  to: string;
  dashed: boolean;
  tone: Tone;
}

function edgesOf(rows: Row[]): Edge[] {
  const out: Edge[] = [];
  rows.forEach((r, i) => {
    const dashed = r.artifact.dashed;
    out.push({ from: "server", to: `runner-${i}`, dashed: r.runner.kind === "remote", tone: "default" });
    out.push({ from: `runner-${i}`, to: `artifact-${i}`, dashed, tone: r.artifact.tone });
    if (r.verdict) out.push({ from: `artifact-${i}`, to: `verdict-${i}`, dashed, tone: r.verdict.tone });
  });
  return out;
}

interface Path {
  key: string;
  d: string;
  dashed: boolean;
  tone: Tone;
}

function useConnectors(edges: Edge[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);

  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next: Path[] = [];
    for (const e of edges) {
      const a = nodes.current.get(e.from)?.getBoundingClientRect();
      const b = nodes.current.get(e.to)?.getBoundingClientRect();
      if (!a || !b) continue;
      const x1 = a.right - box.left;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left;
      const y2 = b.top + b.height / 2 - box.top;
      const dx = Math.max((x2 - x1) / 2, 8);
      next.push({
        key: `${e.from}-${e.to}`,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        dashed: e.dashed,
        tone: e.tone,
      });
    }
    setPaths(next);
  }, [edges]);

  useLayoutEffect(() => {
    measure();
    // jsdom and very old browsers have no ResizeObserver: one measurement is enough there.
    if (typeof ResizeObserver === "undefined" || !containerRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    [],
  );

  return { containerRef, register, paths };
}

function ColumnHeading({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function RowList({ rows, server }: { rows: Row[]; server: McpServerJson }) {
  return (
    <ul role="list" aria-label={`Lineage of ${server.name} ${server.version}`} className="space-y-2 text-sm md:sr-only md:focus-within:not-sr-only">
      {rows.map((r) => (
        <li key={r.runner.id} className="rounded-md border p-2">
          <span className="font-medium">{runnerLabel(r.runner)}</span>
          <ul role="list" className="ml-4 mt-1 list-disc space-y-1 text-xs">
            <li>
              Artifact:{" "}
              {r.artifact.href ? (
                <Link href={r.artifact.href} className="text-primary hover:underline">
                  {r.artifact.text}
                </Link>
              ) : (
                r.artifact.text
              )}
              {r.artifact.sub ? ` (${r.artifact.sub})` : ""}
              {r.link?.drift ? " (tag moved)" : ""}
            </li>
            {r.verdict && (
              <li>
                Verdict:{" "}
                {r.verdict.href ? (
                  <Link href={r.verdict.href} className="text-primary hover:underline">
                    {r.verdict.text}
                  </Link>
                ) : (
                  r.verdict.text
                )}
              </li>
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function McpLineageGraph({
  server,
  pins,
  health,
  repoKey,
  policy,
}: {
  server: McpServerJson;
  pins?: McpPackagePin[];
  health?: McpHealth | null;
  repoKey: string;
  /** Package policy of the version; `open` marks every package as not gated. */
  policy?: McpPackagePolicy;
}) {
  const rows = useMemo(() => buildRows(server, pins, health, policy), [server, pins, health, policy]);
  const edges = useMemo(() => edgesOf(rows), [rows]);
  const { containerRef, register, paths } = useConnectors(edges);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">This entry declares no way to run it.</p>;
  }

  return (
    <div className="space-y-3" data-testid="mcp-lineage" data-repo={repoKey}>
      <RowList rows={rows} server={server} />
      <div ref={containerRef} className="relative hidden md:block" aria-hidden="true">
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray={p.dashed ? "4 4" : undefined}
              className={TONE_TEXT[p.tone]}
              data-edge={p.key}
            />
          ))}
        </svg>
        <div className="grid grid-cols-4 gap-x-10 gap-y-3">
          <ColumnHeading>Server version</ColumnHeading>
          <ColumnHeading>Runners</ColumnHeading>
          <ColumnHeading>AK artifacts</ColumnHeading>
          <ColumnHeading>Verdicts</ColumnHeading>
          <Node nodeRef={register("server")} style={{ gridColumn: 1, gridRow: `2 / span ${rows.length}` }}>
            <span className="font-medium">{server.name}</span>
            <span className="block text-muted-foreground">v{server.version}</span>
          </Node>
          {rows.map((r, i) => (
            <RowNodes key={r.runner.id} row={r} i={i} register={register} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RowNodes({ row, i, register }: { row: Row; i: number; register: (k: string) => (el: HTMLElement | null) => void }) {
  const gridRow = i + 2;
  const r = row.runner;
  return (
    <>
      <Node nodeRef={register(`runner-${i}`)} dashed={r.kind === "remote"} style={{ gridColumn: 2, gridRow }}>
        {r.kind === "package" ? (
          <>
            <span className="font-medium">{r.pkg.registryType}</span>
            <span className="block font-mono">{r.pkg.identifier}</span>
            <span className="block text-muted-foreground">
              {r.pkg.version ?? ""} {r.pkg.transport?.type ?? "stdio"}
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">remote {r.remote.type}</span>
            <span className="block font-mono">{r.remote.url}</span>
          </>
        )}
      </Node>
      <Node
        nodeRef={register(`artifact-${i}`)}
        href={row.artifact.href}
        dashed={row.artifact.dashed}
        tone={row.artifact.tone}
        style={{ gridColumn: 3, gridRow }}
      >
        <span className="font-medium">{row.artifact.text}</span>
        {row.artifact.sub && <span className="block font-mono text-muted-foreground">{row.artifact.sub}</span>}
        {row.link?.drift && <span className="block text-amber-600 dark:text-amber-400">tag moved</span>}
      </Node>
      {row.verdict && (
        <Node nodeRef={register(`verdict-${i}`)} href={row.verdict.href} tone={row.verdict.tone} style={{ gridColumn: 4, gridRow }}>
          {row.verdict.text}
        </Node>
      )}
    </>
  );
}
