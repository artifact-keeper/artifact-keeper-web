"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Ban, RefreshCw, AlertCircle, Crosshair } from "lucide-react";

import {
  holdsApi,
  POLICY_BLOCKS_QUERY_KEY,
  type PolicyBlock,
} from "@/lib/api/holds";
import { toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";
import { HoldsNav } from "@/components/common/holds-nav";

const SEVERITY_PILL: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function SeverityCount({
  count,
  label,
  level,
}: {
  count: number;
  label: string;
  level: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${SEVERITY_PILL[level] ?? ""}`}
    >
      {count}
      {label}
    </span>
  );
}

function FindingsCell({ block }: { block: PolicyBlock }) {
  if (
    block.criticalCount === 0 &&
    block.highCount === 0 &&
    block.mediumCount === 0 &&
    block.lowCount === 0
  ) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <SeverityCount count={block.criticalCount} label="C" level="critical" />
      <SeverityCount count={block.highCount} label="H" level="high" />
      <SeverityCount count={block.mediumCount} label="M" level="medium" />
      <SeverityCount count={block.lowCount} label="L" level="low" />
    </div>
  );
}

export default function PolicyBlocksPage() {
  useDocumentTitle("Policy blocks");
  const { user } = useAuth();

  const {
    data: blockPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: POLICY_BLOCKS_QUERY_KEY,
    queryFn: () => holdsApi.listPolicyBlocks({ perPage: 100 }),
    enabled: !!user?.is_admin,
  });

  const rows = useMemo(() => blockPage?.items ?? [], [blockPage]);

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Ban className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">The policy-block list requires administrator access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Ban className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Policy blocks</h1>
          <p className="text-sm text-muted-foreground">
            Packages that currently cannot be downloaded because unacknowledged scan findings
            breach an enabled policy, or because a proxy-cache scan marked them vulnerable.
          </p>
        </div>
      </div>

      <HoldsNav />

      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Acknowledge findings on the scan, or raise the policy threshold, to lift a hosted block.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load policy-blocked packages</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "Unknown error")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          No packages are currently blocked by scan policy.
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Uploaded</th>
                <th className="px-3 py-2 font-medium">Findings</th>
                <th className="px-3 py-2 font-medium">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((block) => (
                <tr key={block.id}>
                  <td className="px-3 py-2 font-medium">
                    <div>{block.packageName}</div>
                    <div className="mt-0.5 max-w-xs truncate font-mono text-xs text-muted-foreground" title={block.path}>
                      {block.path}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{block.packageVersion ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/repositories/${encodeURIComponent(block.repositoryKey)}`}
                      title={`Open ${block.repositoryKey}`}
                    >
                      <Badge variant="outline">{block.repositoryKey}</Badge>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="capitalize">
                      {block.source === "proxy" ? "Proxy cache" : block.source}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {block.uploadedAt ? formatDate(block.uploadedAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <FindingsCell block={block} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="max-w-sm space-y-1">
                      {block.policyName ? (
                        <Link
                          href="/security/policies"
                          className="font-medium text-foreground hover:underline"
                        >
                          {block.policyName}
                        </Link>
                      ) : null}
                      <div>{block.blockReason}</div>
                      {block.artifactId && (
                        <Link
                          href={`/security/blast-radius?artifact=${encodeURIComponent(block.artifactId)}`}
                          className="inline-flex items-center gap-1 text-foreground hover:underline"
                        >
                          <Crosshair className="size-3" />
                          Blast radius
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListTruncationNotice shown={rows.length} total={blockPage?.total ?? 0} />
    </div>
  );
}
