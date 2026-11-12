"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import {
  scanQueueApi,
  QUEUE_KINDS,
  QUEUE_STATES,
  type QueueKind,
  type QueueState,
  type ScanQueueDepth,
  type ScanQueueJob,
} from "@/lib/api/scan-queue";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/common/data-table";
import { FilterSelect } from "@/components/common/filter-select";
import { PageHeader } from "@/components/common/page-header";
import { formatRelativeTimestamp } from "@/lib/cache-time";
import { apiErrorMessage } from "@/lib/api/fetch";
import { toUserMessage } from "@/lib/error-utils";

const DEFAULT_PER_PAGE = 50;

/** Tile order: what is happening now, then what is waiting, then what broke. */
const TILE_STATES: ReadonlyArray<QueueState> = ["running", "pending", "failed"];

/**
 * Border tint per tile. Applied only when the tile is non-zero, so a red border
 * means there really are failures rather than just "this is the failure tile".
 */
const TILE_TONE: Record<string, string> = {
  running: "border-blue-500/50",
  pending: "border-amber-500/50",
  failed: "border-red-500/50",
  age: "border-amber-500/50",
};
const REFRESH_MS = 10_000;

const STATE_BADGE: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  pending:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const KIND_LABEL: Record<string, string> = {
  proxy_file: "Proxy file",
  hosted_artifact: "Hosted artifact",
};

export default function ScanQueuePage() {
  const [state, setState] = useState<QueueState | undefined>();
  const [kind, setKind] = useState<QueueKind | undefined>();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: [
      ...QUERY_KEYS.SECURITY,
      "scan-queue",
      { state, kind, page, perPage },
    ],
    queryFn: () => scanQueueApi.list({ state, kind, page, perPage }),
    // A backend without the endpoint will not grow one by polling.
    refetchInterval: (query) =>
      query.state.data === null ? false : REFRESH_MS,
  });

  // Jobs are deleted as they finish, so a later page can empty out between
  // polls. The backend then reports a total of 0, which leaves the pager with
  // nothing to go back to, so return to the first page. Adjusted during
  // render, React's pattern for state derived from a previous render.
  if (page > 1 && data && data.items.length === 0) setPage(1);

  const notice =
    data === null
      ? "This backend has no scan queue. It needs a release with the durable scan queue (artifact-keeper#5775)."
      : data?.enabled === false
        ? "The durable scan queue is off on this backend (SCAN_QUEUE_ENABLED), so scans run in-process and do not appear here."
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan Queue"
        description="Scans waiting for the worker. A finished job is deleted, so only pending, running and failed rows appear here."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            // Derived from the constant, so the copy cannot drift from the poll.
            title={`Refreshes automatically every ${REFRESH_MS / 1000}s. Click to refresh now.`}
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      {notice && (
        <div
          role="status"
          className="rounded-lg border px-4 py-3 text-sm text-muted-foreground"
        >
          {notice}
        </div>
      )}

      <DepthTiles depth={data?.depth ?? []} />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="State"
          allLabel="All states"
          options={QUEUE_STATES}
          active={state}
          onSelect={(v) => {
            setState(v);
            setPage(1);
          }}
        />
        {/* ml-auto keeps kind on the right edge; it wraps below on narrow viewports. */}
        <div className="ml-auto">
          <FilterSelect
            label="Kind"
            allLabel="All kinds"
            className="w-48"
            options={QUEUE_KINDS}
            active={kind}
            onSelect={(v) => {
              setKind(v);
              setPage(1);
            }}
            labels={KIND_LABEL}
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {apiErrorMessage(error) ??
            toUserMessage(error, "Failed to load the scan queue.")}
        </div>
      )}

      <DataTable
        columns={JOB_COLUMNS}
        data={data?.items ?? []}
        total={data?.total}
        page={page}
        pageSize={perPage}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPerPage(n);
          setPage(1);
        }}
        loading={isLoading}
        emptyMessage={
          data === null ? "Not available on this backend." : "The queue is empty."
        }
        rowKey={(r) => r.id}
      />
    </div>
  );
}

/**
 * The hostname out of a `<host>:<pid>:<boot-uuid>` worker identity. The pid and
 * boot id distinguish restarts, which is not what an operator is reading for.
 */
function workerHost(claimedBy?: string | null): string {
  if (!claimedBy) return "";
  return claimedBy.split(":")[0];
}

function DepthTiles({
  depth,
}: Readonly<{ depth: ReadonlyArray<ScanQueueDepth> }>) {
  // Aggregate across kinds and render a fixed row, so the tiles keep their
  // place at zero instead of appearing and shifting the page as work arrives.
  // The per-kind split lives in the Kind filter and the table's Kind column.
  const jobs = (state: QueueState) =>
    depth.filter((d) => d.state === state).reduce((n, d) => n + d.jobs, 0);
  const oldest = Math.max(0, ...depth.map((d) => d.oldest_pending_secs ?? 0));

  return (
    <section
      aria-label="Queue depth"
      data-testid="queue-depth"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {TILE_STATES.map((state) => (
        <DepthTile
          key={state}
          label={state}
          value={jobs(state)}
          tone={jobs(state) > 0 ? TILE_TONE[state] : undefined}
        />
      ))}
      <DepthTile
        label="Oldest pending"
        value={oldest > 0 ? formatAge(oldest) : "-"}
        tone={oldest > 0 ? TILE_TONE.age : undefined}
      />
    </section>
  );
}

function DepthTile({
  label,
  value,
  tone,
}: Readonly<{
  label: string;
  value: number | string;
  tone?: string;
}>) {
  return (
    <Card className={tone}>
      <CardContent className="flex items-baseline justify-between px-4 py-2.5">
        <span className="truncate text-xs capitalize text-muted-foreground">
          {label}
        </span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}
/**
 * There is no artifact page keyed by id, so a hosted-artifact job shows its id
 * as text, the way Scan Results does, rather than a link that would 404.
 */
const JOB_COLUMNS: DataTableColumn<ScanQueueJob>[] = [
  {
    id: "state",
    header: "State",
    accessor: (r) => r.state,
    sortable: true,
    cell: (r) => (
      <Badge
        variant="outline"
        className={`border font-medium capitalize text-xs ${STATE_BADGE[r.state] ?? ""}`}
      >
        {r.state}
      </Badge>
    ),
  },
  {
    id: "kind",
    header: "Kind",
    accessor: (r) => r.kind,
    sortable: true,
    cell: (r) => (
      <Badge variant="secondary" className="text-xs font-normal">
        {KIND_LABEL[r.kind] ?? r.kind}
      </Badge>
    ),
  },
  {
    id: "target",
    header: "Target",
    accessor: (r) => r.target ?? r.artifact_id ?? "",
    sortable: true,
    cell: (r) =>
      r.target ? (
        <span className="text-sm break-all">{r.target}</span>
      ) : r.artifact_id ? (
        <code className="text-xs break-all">{r.artifact_id}</code>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
  {
    id: "priority",
    header: "Priority",
    accessor: (r) => r.priority,
    sortable: true,
    className: "text-right",
    headerClassName: "text-right",
    cell: (r) => <span className="tabular-nums text-sm">{r.priority}</span>,
  },
  {
    id: "attempts",
    header: "Attempts",
    accessor: (r) => r.attempts,
    sortable: true,
    className: "text-right",
    headerClassName: "text-right",
    cell: (r) => (
      <span className="tabular-nums text-sm">
        {r.attempts}/{r.max_attempts}
      </span>
    ),
  },
  {
    id: "queued",
    header: "Queued",
    accessor: (r) => r.created_at,
    sortable: true,
    cell: (r) => (
      <span
        className="text-sm text-muted-foreground whitespace-nowrap"
        title={new Date(r.created_at).toLocaleString()}
      >
        {formatRelativeTimestamp(r.created_at)}
      </span>
    ),
  },
  {
    id: "worker",
    header: "Worker",
    accessor: (r) => workerHost(r.claimed_by),
    sortable: true,
    cell: (r) =>
      r.claimed_by ? (
        <code className="text-xs" title={r.claimed_by}>
          {workerHost(r.claimed_by)}
        </code>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
  {
    id: "last_error",
    header: "Last error",
    accessor: (r) => r.last_error ?? "",
    cell: (r) =>
      r.last_error ? (
        <span
          className="block max-w-xs truncate text-xs text-muted-foreground"
          title={r.last_error}
        >
          {r.last_error}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
];

function formatAge(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
}
