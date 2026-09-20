"use client";

import { useQuery } from "@tanstack/react-query";
import { FileQuestion, Terminal } from "lucide-react";

import { packageAnalysisApi } from "@/lib/api/package-analysis";
import { packageAnalysisKey } from "@/lib/query-keys";
import { isArtifactAnalyzable } from "@/lib/artifact-analyzable";
import type { Artifact } from "@/types";

import { Button } from "@/components/ui/button";
import { SeverityBadge, maxSeverity } from "@/components/common/severity-badge";

interface InstallScriptFindingsSummaryProps {
  artifact: Artifact;
  /**
   * Whether this repository's format is analyzed at all
   * (`supportsPackageAnalysis`). `false` skips the request entirely rather
   * than eating a 404 per Security tab view.
   */
  enabled: boolean;
  /** Take the reader to the Analysis tab, where the detail lives. */
  onOpenAnalysis?: () => void;
}

/**
 * Security-tab roll-up of static-analysis findings in *install scripts*.
 *
 * The sibling of `VendoredAdvisoriesSummary`, and it exists for the same
 * reason: nothing else on this tab can see these. CVE history and
 * Dependency-Track findings describe *declared dependencies*; a `postinstall`
 * that pipes a remote script into `sh` is not a dependency and appears in
 * neither. Before this component, a package whose only defect was a malicious
 * install hook rendered the Security tab's "No vulnerabilities detected for
 * this artifact" empty state with a green shield, while the Analysis tab one
 * click away reported two HIGH findings.
 *
 * Two things are reported and never merged:
 *   - findings raised against scripts we actually read, and
 *   - scripts present in the package whose bytes could NOT be read
 *     (`content_available: false`), where an empty findings list means
 *     "not inspected" rather than "clean".
 *
 * The counts are NOT added to the CVE/DT totals above. A different source with
 * a different confidence must not silently inflate a number the reader
 * interprets as scan results. This shares the Analysis tab's query key, so
 * opening both tabs costs one request.
 *
 * Deliberately says nothing when there is nothing to say: no analysis row, a
 * load failure, or a package with no install scripts all render null. A
 * half-answer on the Security tab is worse than none, and the Analysis tab
 * reports all three honestly.
 */
export function InstallScriptFindingsSummary({
  artifact,
  enabled,
  onOpenAnalysis,
}: InstallScriptFindingsSummaryProps) {
  const { data } = useQuery({
    queryKey: packageAnalysisKey(artifact.id),
    queryFn: () => packageAnalysisApi.get(artifact.id),
    retry: false,
    enabled: enabled && isArtifactAnalyzable(artifact),
  });

  const scripts = data?.install_scripts ?? [];
  if (scripts.length === 0) return null;

  const findings = scripts.flatMap((s) => s.findings ?? []);
  const uninspected = scripts.filter((s) => s.content_available === false).length;

  // Nothing found AND nothing we failed to read: the package has install
  // scripts that we read and had no objection to. That is a real result, but
  // it belongs on the Analysis tab, not as a line on the Security summary.
  if (findings.length === 0 && uninspected === 0) return null;

  // The reason a reader stops scrolling. `maxSeverity` rather than a local
  // sort: it already encodes that an unknown severity must not outrank a
  // known one, which a naive comparator gets wrong in both directions.
  const worst = maxSeverity(findings.map((f) => String(f.severity)));

  return (
    <div
      className="rounded-lg border border-border bg-muted/30 p-4"
      data-testid="install-script-findings-summary"
    >
      <div className="flex items-start gap-3">
        <Terminal className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">Install scripts</h4>
            {findings.length > 0 && worst && <SeverityBadge severity={worst} />}
          </div>

          {findings.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {findings.length} static-analysis{" "}
              {findings.length === 1 ? "finding" : "findings"} across{" "}
              {scripts.length} install {scripts.length === 1 ? "script" : "scripts"}.
              These run on the installing machine and are not covered by the
              vulnerability scans below.
            </p>
          )}

          {uninspected > 0 && (
            <p
              className="flex items-start gap-1.5 text-sm text-muted-foreground"
              data-testid="install-scripts-not-inspected"
            >
              <FileQuestion className="mt-0.5 size-4 shrink-0" />
              <span>
                {uninspected} install {uninspected === 1 ? "script" : "scripts"}{" "}
                could not be read, so {uninspected === 1 ? "it was" : "they were"}{" "}
                not inspected. This is not the same as finding nothing.
              </span>
            </p>
          )}

          {onOpenAnalysis && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-sm"
              onClick={onOpenAnalysis}
            >
              View in Analysis
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
