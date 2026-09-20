"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileQuestion,
  KeyRound,
  Terminal,
} from "lucide-react";

import type {
  AnalysisCompleteness,
  InstallScript,
  ScriptFinding,
} from "@/types/package-analysis";
import {
  installScriptKindLabel,
  installScriptRunsAsRoot,
} from "@/lib/install-script-kinds";
import { formatBytes } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SeverityBadge,
  maxSeverity,
  severityBadgeClass,
} from "@/components/common/severity-badge";

function isHighOrCritical(severity: string): boolean {
  const s = severity.toLowerCase();
  return s === "critical" || s === "high";
}

function FindingRow({ finding }: { finding: ScriptFinding }) {
  return (
    <li className="space-y-1.5 py-2 first:pt-0 last:pb-0" data-testid="script-finding">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <code className="font-mono text-xs text-muted-foreground">{finding.rule_id}</code>
        <span className="text-xs text-muted-foreground">
          {finding.line != null ? `L${finding.line}` : "-"}
        </span>
      </div>
      <p className="text-sm font-medium">{finding.title}</p>
      {finding.description && (
        <p className="text-xs text-muted-foreground">{finding.description}</p>
      )}
      {finding.snippet && (
        <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
          {finding.snippet}
        </pre>
      )}
    </li>
  );
}

function ScriptCard({ script }: { script: InstallScript }) {
  const findings = script.findings;
  const worst = maxSeverity(findings.map((f) => f.severity));
  const criticalCount = findings.filter((f) => f.severity.toLowerCase() === "critical").length;
  const highCount = findings.filter((f) => f.severity.toLowerCase() === "high").length;
  const defaultOpen = findings.some((f) => isHighOrCritical(f.severity));
  const runsAsRoot = installScriptRunsAsRoot(script.kind);

  return (
    <div
      className="rounded-lg border bg-card p-3"
      data-testid="install-script"
      data-path={script.path}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* `title` keeps the raw backend kind reachable behind the label. */}
        <Badge
          variant="secondary"
          className="text-xs"
          data-testid="script-kind"
          title={script.kind}
        >
          {installScriptKindLabel(script.kind)}
        </Badge>
        {/*
          Privilege fact, not a severity claim, so it is styled as a plain
          outline badge rather than with the severity palette.
        */}
        {runsAsRoot && (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal"
            data-testid="script-runs-as-root"
            title="This hook runs with root privileges during a normal package install, not as the invoking user."
          >
            <KeyRound className="size-3" aria-hidden="true" />
            runs as root
          </Badge>
        )}
        {/*
          Not always a filesystem path: npm rows carry
          `package.json#scripts.postinstall`, RPM rows `rpm:header#POSTIN`.
          Printed verbatim — never basenamed or split on `/`.
        */}
        <code className="break-all font-mono text-xs" data-testid="script-path">
          {script.path}
        </code>
        <span className="text-xs text-muted-foreground">{formatBytes(script.size_bytes)}</span>
        <div className="ml-auto flex items-center gap-2">
          {worst && <SeverityBadge severity={worst} />}
          {criticalCount > 0 && (
            <Badge className={`${severityBadgeClass("critical")} border text-xs`}>
              {criticalCount} crit
            </Badge>
          )}
          {highCount > 0 && (
            <Badge className={`${severityBadgeClass("high")} border text-xs`}>
              {highCount} high
            </Badge>
          )}
        </div>
      </div>

      {!script.content_available ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground"
          data-testid="script-unreadable"
        >
          <FileQuestion className="size-4 shrink-0" aria-hidden="true" />
          Script present but contents could not be read
        </div>
      ) : findings.length === 0 ? (
        <div
          className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
          data-testid="script-clean"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          No static-analysis findings
        </div>
      ) : (
        <Collapsible defaultOpen={defaultOpen} className="mt-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90"
                aria-hidden="true"
              />
              {findings.length} finding{findings.length === 1 ? "" : "s"}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 divide-y">
              {findings.map((f, i) => (
                <FindingRow key={`${f.rule_id}-${f.line ?? "x"}-${i}`} finding={f} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/**
 * Install-time scripts found in the package (conda link hooks, npm lifecycle
 * scripts, RPM scriptlets, Debian maintainer scripts, ...), one card each,
 * with the static-analysis findings for the script. Kinds whose hook runs as
 * root under the native installer (`rpm-*` / `deb-*` / `apk-*`) carry a
 * "runs as root" badge — see `@/lib/install-script-kinds`.
 *
 * Same three-way empty state as the vendored-components panel: "no scripts"
 * is only a clean result when the analyzer read the whole package. Within a
 * card, `content_available: false` likewise means the script was NOT
 * inspected, so an empty findings list on it renders neutral, not clean.
 */
export function InstallScriptsPanel({
  scripts,
  completeness,
}: {
  scripts: InstallScript[];
  completeness: AnalysisCompleteness;
}) {
  const inspected =
    completeness.status === "complete" || completeness.status === "partial";

  return (
    <div className="space-y-4" data-testid="install-scripts-panel">
      <div className="flex items-center gap-3">
        <Terminal className="size-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-medium">Install Scripts</h3>
        {inspected && scripts.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {scripts.length} script{scripts.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {!inspected ? (
        <div
          className="flex items-start gap-3 rounded-lg border bg-muted p-4 text-muted-foreground"
          data-testid="scripts-not-inspected"
        >
          <FileQuestion className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Package contents were not inspected</p>
            <p className="mt-1 text-xs">
              {completeness.reason ??
                (completeness.status === "unsupported"
                  ? "Install-script inspection is not supported for this package."
                  : "The analyzer did not read this package's contents, so install scripts were not inspected.")}
            </p>
          </div>
        </div>
      ) : (
        <>
          {completeness.status === "partial" && (
            <div
              className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
              data-testid="scripts-partial-banner"
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

          {scripts.length === 0 ? (
            completeness.status === "complete" ? (
              <div
                className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"
                data-testid="scripts-clean"
              >
                <CheckCircle2
                  className="size-5 shrink-0 text-emerald-600 dark:text-emerald-500"
                  aria-hidden="true"
                />
                <p className="text-sm text-emerald-800 dark:text-emerald-400">
                  No install scripts found
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="scripts-partial-empty">
                No install scripts found in the files that were read.
              </p>
            )
          ) : (
            <div className="space-y-3">
              {scripts.map((s) => (
                <ScriptCard key={`${s.kind}:${s.path}`} script={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
