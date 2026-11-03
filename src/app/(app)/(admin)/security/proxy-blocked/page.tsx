"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info } from "lucide-react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { proxyBlockedApi } from "@/lib/api/proxy-blocked";
import { isForbiddenError, toUserMessage } from "@/lib/error-utils";
import type { ProxyBlockedItem, ProxyWouldBlockSummary } from "@/types/proxy-blocked";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { VulnIdLink } from "@/components/common/vuln-id-link";

const ANY_SEVERITY = "__all__";
const SEVERITIES = ["critical", "high", "medium", "low", "info"];

/** How many CVE ids a row shows before it summarises the rest. */
const CVES_SHOWN = 3;

/**
 * `fail_open` and `fail_closed` grade a stored `vulnerable` verdict alike, so a
 * listed item under either is refused today. Only `record_only` still serves it.
 */
function ActionBadge({ action }: { action: string | null }) {
  if (action === "record_only") {
    return (
      <Badge variant="outline" className="text-xs">
        Served today (record_only)
      </Badge>
    );
  }
  if (action === "fail_open" || action === "fail_closed") {
    return (
      <Badge variant="destructive" className="text-xs">
        Refused today ({action})
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">{action ?? "-"}</span>;
}

/** An upper bound reads as one, except a zero, which is exact. */
function upTo(count: number): string {
  return count === 0 ? "0" : `Up to ${count}`;
}

function SummaryCount({
  testId,
  value,
  title,
  children,
}: {
  testId: string;
  value: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3" data-testid={testId}>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * What the preview may and may not claim (backend docs, scan-on-proxy.md,
 * "Previewing enforcement"). Only the first count is about refusals. The other
 * three are files with no usable verdict: `fail_closed` scans them on the next
 * pull, which can serve, refuse or withhold them, so they are pulls that will wait
 * on a scan. And they come from the catalog, which includes files the format
 * serves without gating, so each one is an upper bound.
 */
function WouldBlockSummary({
  summary,
  severityFiltered,
}: {
  summary: ProxyWouldBlockSummary;
  severityFiltered: boolean;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="would-block-summary">
      <h2 className="text-sm font-semibold">If these repositories enforced</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCount
          testId="would-block-digests"
          value={String(summary.would_block_digests)}
          title="Files that would be refused"
        >
          Their stored verdict fails the gate, so the next pull answers 403. This
          includes any refused today.
        </SummaryCount>
        <SummaryCount
          testId="would-block-no-verdict"
          value={upTo(summary.no_verdict)}
          title="No verdict"
        >
          Not pulled since scanning was enabled, or the scan did not finish.
        </SummaryCount>
        <SummaryCount
          testId="would-block-stale"
          value={upTo(summary.stale_verdict)}
          title="Stale verdict"
        >
          The verdict is older than the scan window.
        </SummaryCount>
        <SummaryCount
          testId="would-block-clean-nothing"
          value={upTo(summary.clean_graded_nothing)}
          title="Clean, but graded nothing"
        >
          A clean verdict that cataloged no component.
        </SummaryCount>
      </div>
      <p className="text-xs text-muted-foreground">
        The last three are not listed below, and are not a count of refusals. Under{" "}
        <code>fail_closed</code> each file is scanned inline on its next pull: served if
        clean or below the threshold, refused (403) if the gate refuses the result, withheld
        (423) if the scan is inconclusive. <code>fail_open</code> and{" "}
        <code>record_only</code> serve them. Each count is an upper bound, since it includes
        files the format serves without gating, such as a Maven POM.
        {severityFiltered ? " They ignore the severity filter." : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        The preview reads stored verdicts only. A pull can still come out differently when the
        CVE database has advanced since the verdict, for a format that reuses a verdict only for
        the coordinate it was graded as, and on a Virtual route, where the stricter of two
        policies applies.
      </p>
    </section>
  );
}

function ProxyBlockedContent() {
  useDocumentTitle("Proxy Blocked");
  const searchParams = useSearchParams();

  const [wouldBlock, setWouldBlock] = useState(searchParams.get("would_block") === "true");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [repositoryInput, setRepositoryInput] = useState("");
  const [repository, setRepository] = useState("");
  const [severityFilter, setSeverityFilter] = useState(ANY_SEVERITY);
  const minSeverity = severityFilter === ANY_SEVERITY ? undefined : severityFilter;

  // Costly on a large catalog: the preview grades every repository's verdicts and
  // counts its catalog (artifact-keeper#5232). So it runs only on request, and
  // never on an interval.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "security",
      "proxy-blocked",
      wouldBlock,
      repository || undefined,
      minSeverity,
      page,
      pageSize,
    ],
    queryFn: () =>
      proxyBlockedApi.list({
        would_block: wouldBlock || undefined,
        repository: repository || undefined,
        min_severity: minSeverity,
        page,
        per_page: pageSize,
      }),
    retry: false,
  });

  const columns: DataTableColumn<ProxyBlockedItem>[] = [
    {
      id: "repository",
      header: "Repository",
      cell: (r) => (
        <div>
          <p className="text-sm font-medium">{r.repository_key}</p>
          <p className="text-xs text-muted-foreground">{r.repository_format}</p>
        </div>
      ),
    },
    {
      id: "file",
      header: "File",
      cell: (r) => (
        <div className="max-w-xs">
          <p className="text-sm font-medium truncate">{r.name}</p>
          <p className="text-xs text-muted-foreground truncate" title={r.path}>
            {r.path}
          </p>
        </div>
      ),
    },
    {
      id: "severity",
      header: "Highest severity",
      cell: (r) =>
        r.max_severity ? (
          <Badge variant="outline" className="text-xs uppercase">
            {r.max_severity}
          </Badge>
        ) : (
          // Blocked under every gate, so it must not read as low risk.
          <span className="text-sm text-muted-foreground">Not recorded</span>
        ),
    },
    {
      id: "findings",
      header: "Findings",
      cell: (r) => <span className="text-sm tabular-nums">{r.findings_count}</span>,
    },
    {
      id: "advisories",
      header: "Advisories",
      cell: (r) =>
        r.cve_ids.length === 0 ? (
          <span className="text-sm text-muted-foreground">-</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {r.cve_ids.slice(0, CVES_SHOWN).map((cve) => (
              <VulnIdLink key={cve} id={cve} />
            ))}
            {r.cve_ids.length > CVES_SHOWN && (
              <span className="text-xs text-muted-foreground">
                +{r.cve_ids.length - CVES_SHOWN} more
              </span>
            )}
          </div>
        ),
    },
    ...(wouldBlock
      ? [
          {
            id: "action",
            header: "Today",
            cell: (r: ProxyBlockedItem) => <ActionBadge action={r.proxy_scan_action} />,
          },
        ]
      : []),
    {
      id: "scanned_at",
      header: "Scanned",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.scanned_at).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proxy Blocked"
        description={
          wouldBlock
            ? "Proxied files each repository's scan gate would refuse if it enforced, from their stored verdicts."
            : "Proxied files a repository's scan gate refuses now, from their stored verdicts."
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="proxy-blocked-preview"
            aria-label="Preview enforcement"
            checked={wouldBlock}
            onCheckedChange={(checked) => {
              setWouldBlock(checked);
              setPage(1);
            }}
          />
          <Label htmlFor="proxy-blocked-preview">Preview enforcement</Label>
        </div>
        <Select
          value={severityFilter}
          onValueChange={(v) => {
            setSeverityFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Minimum severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SEVERITY}>Any severity</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s} and above
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex items-center gap-2"
          data-testid="proxy-blocked-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setRepository(repositoryInput.trim());
            setPage(1);
          }}
        >
          <Input
            aria-label="Repository"
            placeholder="Repository key"
            className="h-9 w-[200px]"
            value={repositoryInput}
            onChange={(e) => setRepositoryInput(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      </div>

      {wouldBlock && isLoading && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            Grading every repository&apos;s stored verdicts and counting its cached files. This can
            take a while on a large catalog.
          </AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant="destructive" data-testid="proxy-blocked-error">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load proxy-blocked files</AlertTitle>
          <AlertDescription>
            {isForbiddenError(error)
              ? "This list covers every repository, so it needs an instance administrator signed in with an unrestricted credential."
              : toUserMessage(error, "The list could not be loaded.")}
          </AlertDescription>
        </Alert>
      )}

      {wouldBlock && data?.would_block_summary && (
        <WouldBlockSummary
          summary={data.would_block_summary}
          severityFiltered={minSeverity !== undefined}
        />
      )}

      {!isError && (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          total={data?.pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          loading={isLoading}
          emptyMessage={
            wouldBlock
              ? "No stored verdict would be refused. Files with no usable verdict are counted above."
              : "No proxied file is refused now. A repository in record_only refuses nothing: turn on the preview to see what it would."
          }
          rowKey={(r) => `${r.repository_id}:${r.path}`}
        />
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary for static prerendering.
export default function ProxyBlockedPage() {
  return (
    <Suspense fallback={null}>
      <ProxyBlockedContent />
    </Suspense>
  );
}
