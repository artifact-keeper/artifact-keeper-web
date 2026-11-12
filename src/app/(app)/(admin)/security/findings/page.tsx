"use client";

import { Suspense, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, RefreshCw, X } from "lucide-react";

import {
  cveFindingsApi,
  FINDING_STATES,
  SEVERITIES,
  type AffectedArtifact,
  type CveFinding,
  type FindingState,
  type Severity,
} from "@/lib/api/cve-findings";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/common/data-table";
import { FilterSelect } from "@/components/common/filter-select";
import { PageHeader } from "@/components/common/page-header";
import { SeverityBadge, severityRank } from "@/components/common/severity-badge";
import { VulnIdLink } from "@/components/common/vuln-id-link";
import { formatRelativeTimestamp } from "@/lib/cache-time";
import { ApiError, apiErrorMessage } from "@/lib/api/fetch";
import { isForbiddenError, toUserMessage } from "@/lib/error-utils";

const DEFAULT_PER_PAGE = 50;

/** Every filter is read from the URL, so each one is validated before it is sent on. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSeverity(v: string | null): v is Severity {
  return !!v && (SEVERITIES as readonly string[]).includes(v);
}

function isState(v: string | null): v is FindingState {
  return !!v && (FINDING_STATES as readonly string[]).includes(v);
}

export default function FindingsPage() {
  // useSearchParams requires a Suspense boundary during prerendering.
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="flex h-[50vh] items-center justify-center"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading vulnerabilities</span>
        </div>
      }
    >
      <FindingsPageContent />
    </Suspense>
  );
}

function FindingsPageContent() {
  const params = useSearchParams();
  const router = useRouter();

  // The URL is the state so dashboard tiles can deep-link straight here.
  const rawSeverity = params.get("severity");
  const rawState = params.get("state");
  const rawRepositoryId = params.get("repository_id");
  const severity = isSeverity(rawSeverity) ? rawSeverity : undefined;
  const state = isState(rawState) ? rawState : undefined;
  const byArtifact = params.get("group_by") === "artifact";
  const repositoryId =
    rawRepositoryId && UUID_RE.test(rawRepositoryId)
      ? rawRepositoryId
      : undefined;
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setPage(1);
    router.replace(`/security/findings?${next.toString()}`);
  };

  const setParam = (key: string, value?: string) => setParams({ [key]: value });

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: [
      ...QUERY_KEYS.SECURITY,
      "findings",
      {
        severity: byArtifact ? undefined : severity,
        state,
        byArtifact,
        repositoryId,
        page,
        perPage,
      },
    ],
    queryFn: () =>
      cveFindingsApi.list({
        // The grouped view shows the severity filter as "All severities", so a
        // hand-made `?group_by=artifact&severity=...` must not filter silently.
        severity: byArtifact ? undefined : severity,
        state,
        repositoryId,
        groupBy: byArtifact ? "artifact" : undefined,
        page,
        perPage,
      }),
  });

  const goToArtifact = (row: { artifact_id: string }) =>
    router.push(`/artifacts/${row.artifact_id}`);

  // Shared by the flat and the grouped table: same paging, same loading and
  // empty behaviour, only the rows differ.
  const tableProps = {
    total: data?.total,
    page,
    pageSize: perPage,
    onPageChange: setPage,
    onPageSizeChange: (n: number) => {
      setPerPage(n);
      setPage(1);
    },
    loading: isLoading,
    // On an error the alert above says why; "nothing matches" would be wrong.
    emptyMessage: error ? "No vulnerabilities to show." : "Nothing matches these filters.",
  };

  const scope = [(byArtifact ? undefined : severity) ?? "All", state && state !== "all" ? state : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vulnerabilities"
        description={`${scope}. One row per affected ${byArtifact ? "artifact" : "CVE"}, matching the dashboard counts.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="State"
          allLabel="All states"
          options={FINDING_STATES.filter((s) => s !== "all")}
          active={state}
          onSelect={(v) => setParam("state", v)}
        />
        {repositoryId && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setParam("repository_id", undefined)}
          >
            Repository {repositoryId.slice(0, 8)}
            <X className="size-3" />
            <span className="sr-only">Clear the repository filter</span>
          </Button>
        )}
        <Button
          variant={byArtifact ? "default" : "outline"}
          size="sm"
          aria-pressed={byArtifact}
          onClick={() =>
            byArtifact
              ? setParam("group_by", undefined)
              : setParams({ group_by: "artifact", severity: undefined })
          }
        >
          <Package className="size-4" />
          Group by artifact
        </Button>
        {/* ml-auto keeps severity on the right edge; it wraps below on narrow viewports. */}
        <div className="ml-auto">
          <FilterSelect
            label="Severity"
            allLabel="All severities"
            options={SEVERITIES}
            active={byArtifact ? undefined : severity}
            onSelect={(v) => setParam("severity", v)}
            disabled={byArtifact}
            disabledReason="The grouped view breaks every severity out per artifact."
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {findingsErrorMessage(error)}
        </div>
      )}

      {byArtifact ? (
        <DataTable
          {...tableProps}
          columns={artifactColumns(goToArtifact)}
          data={data?.artifacts ?? []}
          rowKey={(r) => r.artifact_id}
          onRowClick={goToArtifact}
        />
      ) : (
        <DataTable
          {...tableProps}
          columns={findingColumns(goToArtifact)}
          data={data?.items ?? []}
          rowKey={(r) => `${r.artifact_id}-${r.cve_id}`}
          onRowClick={(r) =>
            router.push(
              `/security/blast-radius?cve=${encodeURIComponent(r.cve_id)}`,
            )
          }
        />
      )}
    </div>
  );
}

function findingsErrorMessage(error: unknown): string {
  if (isForbiddenError(error)) {
    return "Listing findings across repositories needs an unscoped administrator account. A repository-scoped admin can only see the dashboard counts.";
  }
  // An older backend has no drill-down endpoint, only the counts
  if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
    return "This backend cannot list the vulnerabilities behind the dashboard counts yet. Upgrade it to use this page.";
  }
  return (
    apiErrorMessage(error) ??
    toUserMessage(error, "Failed to load vulnerabilities.")
  );
}

function ackDetails(r: CveFinding): string | undefined {
  const who = [
    r.acknowledged_by && `by ${r.acknowledged_by}`,
    r.acknowledged_at && new Date(r.acknowledged_at).toLocaleString(),
    r.acknowledgement_expires_at &&
      `until ${new Date(r.acknowledgement_expires_at).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(", ");
  return [who, r.acknowledged_reason].filter(Boolean).join(": ") || undefined;
}

/**
 * DataTable's clickable row handles Enter and Space itself and calls
 * preventDefault, which would cancel a nested button's or link's own keyboard
 * activation and open the row's target instead. Keep the key on the control.
 */
const keepKeyOnControl = (e: ReactKeyboardEvent) => e.stopPropagation();

/** The artifact path, as a button so it can open the artifact from inside a clickable row. */
function artifactCell(path: string, onClick: () => void) {
  return (
    <button
      type="button"
      className="text-left text-sm font-medium hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={keepKeyOnControl}
    >
      {path}
    </button>
  );
}

function findingColumns(
  onArtifact: (row: CveFinding) => void,
): DataTableColumn<CveFinding>[] {
  return [
    {
      id: "severity",
      header: "Severity",
      accessor: (r) => severityRank(r.severity),
      sortable: true,
      cell: (r) => <SeverityBadge severity={r.severity} />,
    },
    {
      id: "cve",
      header: "CVE",
      accessor: (r) => r.cve_id,
      sortable: true,
      cell: (r) => (
        <div className="space-y-0.5" onKeyDown={keepKeyOnControl}>
          {/* The advisory link is derived from the id, never from a URL the API sent. */}
          <VulnIdLink id={r.cve_id} />
          {r.title && r.title !== r.cve_id && (
            <div
              className="max-w-xs truncate text-xs text-muted-foreground"
              title={r.title}
            >
              {r.title}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "component",
      header: "Component",
      accessor: (r) => r.affected_component ?? "",
      sortable: true,
      cell: (r) => (
        <span className="text-sm">{r.affected_component ?? "-"}</span>
      ),
    },
    {
      id: "artifact",
      header: "Artifact",
      accessor: (r) => r.artifact_path,
      sortable: true,
      cell: (r) => artifactCell(r.artifact_path, () => onArtifact(r)),
    },
    {
      id: "repository",
      header: "Repository",
      accessor: (r) => r.repository_key ?? r.repository_id,
      sortable: true,
      cell: (r) => (
        <span className="text-sm">
          {r.repository_key ?? r.repository_id.slice(0, 8)}
        </span>
      ),
    },
    {
      id: "fixed_in",
      header: "Installed → Fixed",
      accessor: (r) => r.fixed_version ?? "",
      sortable: true,
      cell: (r) => (
        <span className="whitespace-nowrap text-sm">
          {r.affected_version ?? "?"}
          <span className="text-muted-foreground"> → </span>
          {r.fixed_version ?? (
            <span className="text-xs text-muted-foreground">no fix</span>
          )}
        </span>
      ),
    },
    {
      id: "first_seen",
      header: "First seen",
      accessor: (r) => r.first_detected_at,
      sortable: true,
      cell: (r) => (
        <span
          className="whitespace-nowrap text-sm text-muted-foreground"
          title={new Date(r.first_detected_at).toLocaleString()}
        >
          {formatRelativeTimestamp(r.first_detected_at)}
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      accessor: (r) => (r.is_acknowledged ? "acknowledged" : "open"),
      sortable: true,
      cell: (r) =>
        r.is_acknowledged ? (
          <Badge
            variant="secondary"
            className="text-xs font-normal"
            title={ackDetails(r)}
          >
            Acknowledged
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-xs font-medium border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          >
            Open
          </Badge>
        ),
    },
  ];
}

function artifactColumns(
  onArtifact: (row: AffectedArtifact) => void,
): DataTableColumn<AffectedArtifact>[] {
  const sev = (
    id: "critical" | "high" | "medium" | "low",
    header: string,
  ): DataTableColumn<AffectedArtifact> => ({
    id,
    header,
    accessor: (r) => r[id],
    sortable: true,
    className: "text-right",
    headerClassName: "text-right",
    cell: (r) =>
      r[id] > 0 ? (
        <span className="tabular-nums text-sm">{r[id]}</span>
      ) : (
        <span className="text-xs text-muted-foreground">0</span>
      ),
  });

  return [
    {
      id: "artifact",
      header: "Artifact",
      accessor: (r) => r.artifact_path,
      sortable: true,
      cell: (r) => artifactCell(r.artifact_path, () => onArtifact(r)),
    },
    sev("critical", "Critical"),
    sev("high", "High"),
    sev("medium", "Medium"),
    sev("low", "Low"),
    {
      id: "total",
      header: "Total",
      accessor: (r) => r.total,
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => (
        <span className="font-medium tabular-nums text-sm">{r.total}</span>
      ),
    },
  ];
}
