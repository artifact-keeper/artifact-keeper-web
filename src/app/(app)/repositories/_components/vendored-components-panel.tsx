"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileQuestion,
  Package,
  ShieldAlert,
} from "lucide-react";

import type {
  AdvisoryScan,
  AnalysisCompleteness,
  VendoredComponent,
} from "@/types/package-analysis";
import { isSafeUrl } from "@/lib/utils";
import {
  ABI_VERSION_EXPLANATION,
  ADVISORY_GAP_EXPLANATION,
  ADVISORY_GAP_LABEL,
  advisoryGapFor,
  sortAdvisoriesBySeverity,
  summarizeVendoredAdvisories,
  vendoredComponentKey,
} from "@/lib/vendored-advisories";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import {
  SeverityBadge,
  maxSeverity,
  severityBadgeClass,
} from "@/components/common/severity-badge";
import { VulnIdLink } from "@/components/common/vuln-id-link";

const CONFIDENCE_COLOR: Record<string, "green" | "yellow" | "red"> = {
  high: "green",
  medium: "yellow",
  low: "red",
};

/**
 * Render a source URL as a link only when it uses http(s). Anything else —
 * `javascript:`, `data:`, a bare path — is printed as text: the value comes
 * from a package we are precisely trying to evaluate for trustworthiness.
 */
function SourceCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">-</span>;
  if (!isSafeUrl(url)) {
    return <span className="break-all font-mono text-xs">{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all text-xs text-blue-600 hover:underline dark:text-blue-400"
    >
      {url}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

/**
 * Native libraries the analyzer found vendored inside the package.
 *
 * The empty state is three-way and the difference matters: an empty list is
 * only "nothing vendored" when the analyzer read the whole package
 * (`complete`). A `partial` read gets an amber "may be incomplete" banner over
 * whatever rows exist, and `not_read` / `unsupported` get a neutral "not
 * inspected" state — never the clean copy, never an error.
 *
 * Per row the same three-way rule governs `advisories`: `null` means no
 * upstream version was recovered so the feeds were never queried, `[]` means
 * queried and nothing matched. A version-less row is the normal case for a
 * native library — the numbers in `libwebp.so.7` are ABI versions, not
 * releases — so it reads "version not determinable" next to the ABI the
 * detector did recover, never as an error or a blank cell.
 */
export function VendoredComponentsPanel({
  components,
  completeness,
  advisoryScan,
}: {
  components: VendoredComponent[];
  completeness: AnalysisCompleteness;
  /**
   * Advisory-feed availability. Separate from `completeness` on purpose:
   * that one is about how much of the archive was read, this one about
   * whether the feeds answered. Absent / `null` renders the cautious copy.
   */
  advisoryScan?: AdvisoryScan | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [expandedAdvisories, setExpandedAdvisories] = useState<Set<string>>(
    () => new Set()
  );
  const inspected =
    completeness.status === "complete" || completeness.status === "partial";
  const summary = summarizeVendoredAdvisories(components, advisoryScan);

  // Row identity. `c.path` used to serve this role, but the backend omits it
  // for recipe-derived components (a recipe declares an upstream source, not
  // a file), so every such row collapsed to the key `undefined` -- one shared
  // expansion state for all of them. Keyed by object reference so the `cell`
  // callbacks, which receive no index, can still resolve it.
  const keyOf = new Map(
    components.map((c, i) => [c, vendoredComponentKey(c, i)] as const)
  );
  const idOf = (c: VendoredComponent) => keyOf.get(c) ?? c.name;

  const toggleIn =
    (set: Dispatch<SetStateAction<Set<string>>>) =>
    (path: string) => {
      set((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    };

  const toggle = toggleIn(setExpanded);
  const toggleAdvisories = toggleIn(setExpandedAdvisories);

  const columns: DataTableColumn<VendoredComponent>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (c) => c.name,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{c.name}</div>
            {c.path && (
              <div
                className="truncate font-mono text-xs text-muted-foreground"
                title={c.path}
              >
                {c.path}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (c) => c.version ?? "",
      cell: (c) =>
        c.version ? (
          <Badge variant="outline" className="font-mono text-xs">
            {c.version}
          </Badge>
        ) : (
          /*
            Not an error and not an empty cell: a native library usually has
            no recoverable upstream version, only an ABI one, and the backend
            deliberately refuses to promote the latter. Say that, and show
            the ABI / soname evidence it does have.
          */
          <div
            className="space-y-0.5"
            data-testid="version-undetermined"
            title={ABI_VERSION_EXPLANATION}
          >
            <span className="text-xs text-muted-foreground">
              Version not determinable
            </span>
            {(c.abi_version || c.soname) && (
              <div className="font-mono text-xs text-muted-foreground">
                {c.abi_version && <span>ABI {c.abi_version}</span>}
                {c.abi_version && c.soname && <span> · </span>}
                {c.soname && <span>{c.soname}</span>}
              </div>
            )}
          </div>
        ),
    },
    {
      id: "advisories",
      header: "Advisories",
      // `null` (not queried) sorts apart from `0` (queried, clean) rather
      // than collapsing into it.
      accessor: (c) => (c.advisories == null ? -1 : c.advisories.length),
      sortable: true,
      cell: (c) => {
        if (c.advisories == null) {
          const gap = advisoryGapFor(c.version, advisoryScan);
          /*
            A feed that was asked and went down is a different — and more
            alarming — fact than a lookup that was never attempted, so it
            gets its own headline and amber (not neutral, not red) styling.
            The "this is not a clean result" sentence is shared by all four.
          */
          const outage = gap === "feed_unavailable";
          return (
            <span
              className={
                outage
                  ? "text-xs text-amber-700 dark:text-amber-500"
                  : "text-xs text-muted-foreground"
              }
              data-testid="advisories-not-queried"
              data-gap={gap}
              title={ADVISORY_GAP_EXPLANATION[gap]}
            >
              {ADVISORY_GAP_LABEL[gap]}
            </span>
          );
        }
        if (c.advisories.length === 0) {
          return (
            <span
              className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"
              data-testid="advisories-clean"
            >
              <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
              No known advisories
            </span>
          );
        }
        const count = c.advisories.length;
        const worst = maxSeverity(c.advisories.map((a) => a.severity));
        const isOpen = expandedAdvisories.has(idOf(c));
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleAdvisories(idOf(c));
            }}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Show"} ${count} advisor${count === 1 ? "y" : "ies"} for ${c.name}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
            data-testid="advisories-toggle"
          >
            {isOpen ? (
              <ChevronDown className="size-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3" aria-hidden="true" />
            )}
            {worst && <SeverityBadge severity={worst} />}
            {count}
          </button>
        );
      },
    },
    {
      id: "source",
      header: "Source",
      accessor: (c) => c.source_url ?? "",
      cell: (c) => <SourceCell url={c.source_url} />,
    },
    {
      id: "confidence",
      header: "Confidence",
      accessor: (c) => c.confidence,
      cell: (c) => (
        <StatusBadge
          status={c.confidence}
          color={CONFIDENCE_COLOR[c.confidence.toLowerCase()] ?? "default"}
          className="text-xs"
        />
      ),
    },
    {
      id: "patches",
      header: "Patches",
      accessor: (c) => c.applied_patches.length,
      sortable: true,
      cell: (c) => {
        const count = c.applied_patches.length;
        if (count === 0) return <span className="text-muted-foreground">0</span>;
        const isOpen = expanded.has(idOf(c));
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(idOf(c));
            }}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Show"} ${count} patch${count === 1 ? "" : "es"} for ${c.name}`}
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            {isOpen ? (
              <ChevronDown className="size-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3" aria-hidden="true" />
            )}
            {count}
          </button>
        );
      },
    },
  ];

  const expandedComponents = components.filter(
    (c) => expanded.has(idOf(c)) && c.applied_patches.length > 0
  );
  const advisoryComponents = components.filter(
    (c) => expandedAdvisories.has(idOf(c)) && (c.advisories?.length ?? 0) > 0
  );

  return (
    <div className="space-y-4" data-testid="vendored-components-panel">
      <div className="flex items-center gap-3">
        <Package className="size-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-medium">Vendored Components</h3>
        {inspected && components.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {components.length} component{components.length === 1 ? "" : "s"}
          </Badge>
        )}
        {/*
          The reason this panel exists: a CVE in a library the package's own
          metadata never names. Surface the count in the header so it is
          visible before anyone scrolls the table.
        */}
        {inspected && summary.total > 0 && (
          <Badge
            className={`${severityBadgeClass(summary.worst ?? "info")} gap-1 border text-xs`}
            data-testid="vendored-advisory-rollup"
          >
            <ShieldAlert className="size-3" aria-hidden="true" />
            {summary.total} advisor{summary.total === 1 ? "y" : "ies"} in{" "}
            {summary.affectedComponents} component
            {summary.affectedComponents === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {!inspected ? (
        <div
          className="flex items-start gap-3 rounded-lg border bg-muted p-4 text-muted-foreground"
          data-testid="vendored-not-inspected"
        >
          <FileQuestion className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Package contents were not inspected</p>
            <p className="mt-1 text-xs">
              {completeness.reason ??
                (completeness.status === "unsupported"
                  ? "Vendored-component detection is not supported for this package."
                  : "The analyzer did not read this package's contents, so nothing can be said about vendored libraries.")}
            </p>
          </div>
        </div>
      ) : (
        <>
          {completeness.status === "partial" && (
            <div
              className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
              data-testid="vendored-partial-banner"
            >
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  This list may be incomplete
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                  {completeness.files_read != null && completeness.files_total != null
                    ? `Only ${completeness.files_read} of ${completeness.files_total} files were read. `
                    : "Only part of the package was read. "}
                  {completeness.reason ?? ""}
                </p>
              </div>
            </div>
          )}

          {components.length === 0 ? (
            completeness.status === "complete" ? (
              <div
                className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"
                data-testid="vendored-clean"
              >
                <CheckCircle2
                  className="size-5 shrink-0 text-emerald-600 dark:text-emerald-500"
                  aria-hidden="true"
                />
                <p className="text-sm text-emerald-800 dark:text-emerald-400">
                  No vendored native libraries detected
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="vendored-partial-empty">
                No vendored native libraries detected in the files that were read.
              </p>
            )
          ) : (
            <DataTable
              columns={columns}
              data={components}
              page={1}
              pageSize={components.length}
              total={components.length}
              onPageChange={() => {}}
              emptyMessage="No vendored components"
              rowKey={(c) => idOf(c)}
            />
          )}

          {/*
            An advisory-feed outage is graded separately from "we never
            asked" and rendered first: it is the one case where something
            actively failed. Amber, matching the incomplete-read banner's
            severity, but a distinct block so the two cannot be confused.
          */}
          {components.length > 0 && summary.gaps.feed_unavailable > 0 && (
            <div
              className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
              data-testid="vendored-advisory-feed-unavailable-note"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
                aria-hidden="true"
              />
              <p className="text-xs text-amber-700 dark:text-amber-500">
                The advisory feed did not answer for {summary.gaps.feed_unavailable}{" "}
                component{summary.gaps.feed_unavailable === 1 ? "" : "s"}. They were
                queried, so this is not the same as &ldquo;not checked&rdquo; — nothing is
                ruled out for them.
                {advisoryScan?.reason ? ` ${advisoryScan.reason}` : ""}
              </p>
            </div>
          )}

          {/*
            Neutral, not amber: "nothing asked about these" is a fact about
            the advisory lookup, not a claim that the package read was
            incomplete. It must not be confused with the partial banner above
            and must never read as clean.
          */}
          {components.length > 0 &&
            summary.notQueriedComponents - summary.gaps.feed_unavailable > 0 && (
              <div
                className="flex items-start gap-3 rounded-lg border bg-muted p-3 text-muted-foreground"
                data-testid="vendored-advisories-not-queried-note"
              >
                <FileQuestion className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="text-xs">
                  {summary.notQueriedComponents - summary.gaps.feed_unavailable} component
                  {summary.notQueriedComponents - summary.gaps.feed_unavailable === 1
                    ? " was"
                    : "s were"}{" "}
                  not checked against the advisory feeds.
                  {summary.gaps.no_version > 0 && (
                    <>
                      {" "}
                      For {summary.gaps.no_version} of them no upstream version could be
                      recovered: the number in a soname such as{" "}
                      <code className="font-mono">libwebp.so.7</code> is an ELF/libtool ABI
                      version, not a release (that file ships in libwebp 1.2.4), so it is
                      not used to match advisories.
                    </>
                  )}
                  {summary.gaps.not_scanned > 0 && (
                    <> No completed dependency scan has recorded advisories yet.</>
                  )}
                </p>
              </div>
            )}

          {advisoryComponents.map((c) => (
            <div
              key={`advisories-${idOf(c)}`}
              className="rounded-lg border bg-card p-3"
              data-testid={`advisories-${idOf(c)}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.name}</span>
                <span>{c.version ? `@ ${c.version}` : "(version not determinable)"}</span>
                <span>advisories</span>
              </div>
              <ul className="space-y-2">
                {sortAdvisoriesBySeverity(c.advisories ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2"
                    data-testid="component-advisory"
                  >
                    <SeverityBadge severity={a.severity} />
                    <VulnIdLink id={a.id} showIcon />
                    {a.summary && (
                      <span className="w-full text-xs text-muted-foreground">{a.summary}</span>
                    )}
                    {a.url && (
                      <span className="w-full">
                        <SourceCell url={a.url} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {expandedComponents.map((c) => (
            <div
              key={idOf(c)}
              className="rounded-lg border bg-card p-3"
              data-testid={`patches-${idOf(c)}`}
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.name}</span>
                <span>patches</span>
                {c.detection_method && <span>· detected via {c.detection_method}</span>}
                {c.purl && (
                  <code className="truncate font-mono" title={c.purl}>
                    {c.purl}
                  </code>
                )}
              </div>
              <ul className="space-y-1.5">
                {c.applied_patches.map((p) => (
                  <li key={p.name} className="text-xs">
                    <code className="font-mono">{p.name}</code>
                    {p.description && (
                      <span className="text-muted-foreground"> — {p.description}</span>
                    )}
                    {p.source_url && (
                      <span className="ml-2">
                        <SourceCell url={p.source_url} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
