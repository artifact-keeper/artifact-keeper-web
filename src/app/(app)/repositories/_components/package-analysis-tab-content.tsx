"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileQuestion, PackageSearch } from "lucide-react";

import { packageAnalysisApi } from "@/lib/api/package-analysis";
import { packageAnalysisKey } from "@/lib/query-keys";
import {
  ANALYZABLE_DISABLED_REASON,
  isArtifactAnalyzable,
} from "@/lib/artifact-analyzable";
import type { Artifact } from "@/types";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanCompletenessBadge } from "@/components/common/scan-completeness-badge";
import { VendoredComponentsPanel } from "./vendored-components-panel";
import { InstallScriptsPanel } from "./install-scripts-panel";

interface PackageAnalysisTabContentProps {
  artifact: Artifact;
}

/**
 * "Analysis" tab of the artifact detail dialog: what the backend found when
 * it unpacked the package (vendored native libraries, install scripts) and —
 * first, above both panels — how much of the package it actually read.
 *
 * The completeness bar is not decoration: the panels below only render a
 * clean/empty state as "clean" when it says the contents were inspected.
 */
export function PackageAnalysisTabContent({ artifact }: PackageAnalysisTabContentProps) {
  // Proxy-cached remote artifacts have no `artifacts` row and 404 on every
  // analysis endpoint (artifact-keeper#2292); don't even ask.
  const analyzable = isArtifactAnalyzable(artifact);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: packageAnalysisKey(artifact.id),
    queryFn: () => packageAnalysisApi.get(artifact.id),
    retry: false,
    enabled: analyzable,
  });

  if (!analyzable) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center"
        data-testid="package-analysis-unavailable"
      >
        <FileQuestion className="mb-3 size-10 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">This artifact cannot be analyzed.</p>
        <p className="mt-1 text-xs text-muted-foreground">{ANALYZABLE_DISABLED_REASON}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
        data-testid="package-analysis-error"
      >
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-500"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-red-800 dark:text-red-400">
            Could not load package analysis
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-500">
            {error instanceof Error
              ? error.message
              : "Unable to load package analysis for this artifact."}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="package-analysis-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // `null` is the wrapper's normalization of the backend's 404: no analysis
  // row exists. That is "not analyzed", which is neither clean nor an error.
  if (data == null) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center"
        data-testid="package-analysis-none"
      >
        <PackageSearch className="mb-3 size-10 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No package analysis recorded</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The package contents have not been analyzed. Analysis runs when the artifact is scanned.
        </p>
      </div>
    );
  }

  const { completeness } = data;
  const filesKnown = completeness.files_read != null && completeness.files_total != null;

  return (
    <div className="space-y-6" data-testid="package-analysis">
      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"
        data-testid="package-analysis-completeness"
      >
        <ScanCompletenessBadge
          status={completeness.status}
          reason={completeness.reason}
          filesRead={completeness.files_read}
          filesTotal={completeness.files_total}
        />
        {filesKnown && (
          <span>
            {completeness.files_read} of {completeness.files_total} files read
          </span>
        )}
        <span className="uppercase">{data.format}</span>
        {data.analyzed_at && (
          <span className="ml-auto" title={data.analyzed_at}>
            Analyzed {new Date(data.analyzed_at).toLocaleString()}
          </span>
        )}
      </div>

      <VendoredComponentsPanel
        components={data.vendored_components}
        completeness={completeness}
        advisoryScan={data.advisory_scan}
      />

      <Separator />

      <InstallScriptsPanel scripts={data.install_scripts} completeness={completeness} />
    </div>
  );
}
