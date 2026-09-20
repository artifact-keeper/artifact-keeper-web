"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileQuestion, ShieldAlert } from "lucide-react";

import { packageAnalysisApi } from "@/lib/api/package-analysis";
import { packageAnalysisKey } from "@/lib/query-keys";
import { isArtifactAnalyzable } from "@/lib/artifact-analyzable";
import { summarizeVendoredAdvisories } from "@/lib/vendored-advisories";
import type { Artifact } from "@/types";

import { Button } from "@/components/ui/button";
import { SeverityBadge, severityRank } from "@/components/common/severity-badge";

interface VendoredAdvisoriesSummaryProps {
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
 * Security-tab roll-up of advisories found in *vendored* native libraries.
 *
 * It exists because the surfaces below it cannot see these: CVE history and
 * Dependency-Track findings are both driven by the package's declared
 * components, and a `libwebp` statically linked into a wheel is declared
 * nowhere. Without this line, an artifact carrying CVE-2023-4863 renders the
 * Security tab's "No vulnerabilities detected for this artifact" empty state.
 *
 * It deliberately reports two different things and never merges them:
 *   - advisories matched against vendored components, and
 *   - components that could not be matched at all because no upstream
 *     version was recovered (`advisories: null`).
 *
 * The counts are NOT added to the CVE/DT totals above — a different source
 * with a different confidence should not silently inflate a number the user
 * reads as "scan results". It shares the Analysis tab's query key, so opening
 * both tabs costs one request.
 */
export function VendoredAdvisoriesSummary({
  artifact,
  enabled,
  onOpenAnalysis,
}: VendoredAdvisoriesSummaryProps) {
  const { data } = useQuery({
    queryKey: packageAnalysisKey(artifact.id),
    queryFn: () => packageAnalysisApi.get(artifact.id),
    retry: false,
    enabled: enabled && isArtifactAnalyzable(artifact),
  });

  // No analysis row, a load failure, or a package whose contents were never
  // read: say nothing here. The Analysis tab reports all three honestly, and
  // a half-answer on the Security tab would be worse than none.
  if (data == null) return null;
  if (
    data.completeness.status !== "complete" &&
    data.completeness.status !== "partial"
  ) {
    return null;
  }

  const summary = summarizeVendoredAdvisories(
    data.vendored_components,
    data.advisory_scan
  );
  const outages = summary.gaps.feed_unavailable;
  if (summary.total === 0 && summary.notQueriedComponents === 0) return null;

  const severities = Object.keys(summary.bySeverity).sort(
    (a, b) => severityRank(a) - severityRank(b)
  );

  if (summary.total === 0) {
    // Nothing matched, but not everything could be checked. One line —
    // enough that the "no vulnerabilities" copy below is not read as the
    // whole story. An actual feed outage gets amber and says so; a lookup
    // that was never attempted stays neutral.
    const outage = outages > 0;
    return (
      <div
        className={
          outage
            ? "flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
            : "flex items-start gap-3 rounded-lg border bg-muted p-3 text-muted-foreground"
        }
        data-testid="vendored-advisories-summary-unqueried"
        data-outage={outage ? "true" : "false"}
      >
        {outage ? (
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
            aria-hidden="true"
          />
        ) : (
          <FileQuestion className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}
        <p className={outage ? "text-xs text-amber-700 dark:text-amber-500" : "text-xs"}>
          {outage ? (
            <>
              The advisory feed did not answer for {outages} vendored native{" "}
              {outages === 1 ? "library" : "libraries"}. They were queried and nothing
              is ruled out for them.
              {data.advisory_scan?.reason ? ` ${data.advisory_scan.reason}` : ""}
            </>
          ) : (
            <>
              {summary.notQueriedComponents} vendored native{" "}
              {summary.notQueriedComponents === 1 ? "library" : "libraries"} could not be
              checked against the advisory feeds
              {summary.gaps.no_version > 0 ? " (no upstream version recovered)" : ""}.
            </>
          )}
          {onOpenAnalysis && " "}
          {onOpenAnalysis && (
            <button
              type="button"
              onClick={onOpenAnalysis}
              className="font-medium underline underline-offset-2"
            >
              See the Analysis tab
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
      data-testid="vendored-advisories-summary"
    >
      <ShieldAlert
        className="size-5 shrink-0 text-amber-600 dark:text-amber-500"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
          {summary.total} advisor{summary.total === 1 ? "y" : "ies"} in{" "}
          {summary.affectedComponents} vendored native{" "}
          {summary.affectedComponents === 1 ? "library" : "libraries"}
        </p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-500">
          Found by unpacking the package, not from its declared dependencies —
          the scan results below do not cover these.
          {outages > 0 &&
            ` The advisory feed did not answer for ${outages} further component${
              outages === 1 ? "" : "s"
            }, so nothing is ruled out for those.`}
          {summary.notQueriedComponents - outages > 0 &&
            ` ${summary.notQueriedComponents - outages} further component${
              summary.notQueriedComponents - outages === 1 ? "" : "s"
            } could not be checked at all.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {severities.map((sev) => (
          <span key={sev} className="inline-flex items-center gap-1">
            <SeverityBadge severity={sev} />
            <span className="text-xs tabular-nums text-amber-800 dark:text-amber-400">
              {summary.bySeverity[sev]}
            </span>
          </span>
        ))}
      </div>
      {onOpenAnalysis && (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={onOpenAnalysis}
        >
          View in Analysis
        </Button>
      )}
    </div>
  );
}
