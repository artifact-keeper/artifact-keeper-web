"use client";

import { useQuery } from "@tanstack/react-query";

import { environmentsApi } from "@/lib/api/environments";
import { toUserMessage } from "@/lib/error-utils";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const KIND_LABEL: Record<string, { label: string; className: string }> = {
  "new-affected": {
    label: "Newly affected",
    className:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900",
  },
  "no-longer-affected": {
    label: "No longer affected",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900",
  },
};

/**
 * Advisory changes for this repository's stored environments (#919, backend
 * artifact-keeper#4055): each time advisory data changes, the backend
 * re-evaluates stored environments and records which ones became, or ceased
 * to be, affected. The feed endpoint spans every environment the caller can
 * read, so it is filtered here to the repository being viewed.
 */
export function AdvisoryTransitionsFeed({ repoKey }: { repoKey: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["environments-advisory-transitions"],
    queryFn: () => environmentsApi.transitions(),
    retry: false,
  });
  const rows = (data ?? []).filter((t) => t.repository.key === repoKey);

  return (
    <section className="space-y-3" data-testid="advisory-transitions">
      <div>
        <h3 className="text-sm font-medium">Advisory changes</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Environments in {repoKey} that became, or stopped being, affected by
          an advisory when the advisory data changed. Newest first.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : error ? (
        <p className="text-xs text-muted-foreground" role="status">
          {toUserMessage(error, "Could not load advisory changes")}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No advisory changes recorded for this repository&apos;s environments.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Detected</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Advisory</TableHead>
              <TableHead>Package</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t, i) => {
              const kind = KIND_LABEL[t.kind];
              return (
                <TableRow key={`${t.environment.id}-${t.advisory.id}-${t.kind}-${i}`}>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.detectedAt ? new Date(t.detectedAt).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={kind?.className}>
                      {kind?.label ?? t.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{t.environment.name}</TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {t.advisory.sourceUrl ? (
                      <a
                        href={t.advisory.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono underline underline-offset-2"
                      >
                        {t.advisory.id}
                      </a>
                    ) : (
                      <span className="font-mono">{t.advisory.id}</span>
                    )}
                    {t.advisory.severity && (
                      <span className="ml-1 text-muted-foreground">({t.advisory.severity})</span>
                    )}
                    {t.advisory.summary && (
                      <div className="text-muted-foreground">{t.advisory.summary}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.package.name}
                    {t.package.version && ` ${t.package.version}`}
                    {t.advisory.fixedVersion && (
                      <div className="text-muted-foreground">
                        fixed in {t.advisory.fixedVersion}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
