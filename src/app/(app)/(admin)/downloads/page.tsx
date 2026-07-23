"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, RefreshCw } from "lucide-react";

import {
  downloadsApi,
  groupDownloadsByIp,
  groupDownloadsByUser,
  DOWNLOADS_DEFAULT_PER_PAGE,
  DOWNLOADS_MAX_PER_PAGE,
  UNKNOWN_NETWORK,
  type DownloadRecord,
  type DownloadsQuery,
  type IpGroup,
  type UserGroup,
} from "@/lib/api/downloads";
import { isValidUuid } from "@/lib/api/audit";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const DOWNLOADS_QUERY_KEY = ["admin-downloads"] as const;

type ViewMode = "events" | "by-ip" | "by-user";

interface DownloadFilters {
  artifact_id: string;
  user_id: string;
  ip: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: DownloadFilters = {
  artifact_id: "",
  user_id: "",
  ip: "",
  from: "",
  to: "",
};

/**
 * Convert the date-input values (yyyy-mm-dd, local time) to the inclusive
 * RFC 3339 bounds the backend expects: `from` is the start of the picked day,
 * `to` is the end of it.
 */
export function dateBoundsToIso(filters: Pick<DownloadFilters, "from" | "to">): {
  from?: string;
  to?: string;
} {
  return {
    from: filters.from
      ? new Date(`${filters.from}T00:00:00`).toISOString()
      : undefined,
    to: filters.to
      ? new Date(`${filters.to}T23:59:59.999`).toISOString()
      : undefined,
  };
}

/**
 * Route the applied filters to the most specific backend endpoint: an
 * exclusive IP filter goes through `/downloads/by-ip/{ip}`, an exclusive
 * user filter through `/downloads/by-user/{user_id}`, anything else through
 * the general listing (which accepts both as query filters).
 */
export function fetchDownloads(
  filters: DownloadFilters,
  page: number,
  perPage: number
) {
  const base: DownloadsQuery = {
    page,
    per_page: perPage,
    artifact_id: filters.artifact_id || undefined,
    ...dateBoundsToIso(filters),
  };
  const ip = filters.ip.trim();
  const userId = filters.user_id.trim();
  if (ip && !userId) {
    return downloadsApi.listByIp(ip, { ...base, user_id: undefined });
  }
  if (userId && !ip) {
    return downloadsApi.listByUser(userId, base);
  }
  return downloadsApi.list({
    ...base,
    ip: ip || undefined,
    user_id: userId || undefined,
  });
}

function truncateId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 13)}…` : id;
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function DownloadsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // -- view + pagination + filter state --
  const [view, setView] = useState<ViewMode>("events");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DOWNLOADS_DEFAULT_PER_PAGE);
  // Draft filters live in the inputs; applied filters drive the query. This
  // avoids firing a request per keystroke on the free-text filters.
  const [draft, setDraft] = useState<DownloadFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DownloadFilters>(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);

  const hasAppliedFilters = Object.values(applied).some((v) => v !== "");

  // -- queries --
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: [...DOWNLOADS_QUERY_KEY, page, pageSize, applied],
    queryFn: () => fetchDownloads(applied, page, pageSize),
    enabled: !!user?.is_admin && view === "events",
    retry: false,
    placeholderData: (prev) => prev,
  });

  // The grouped topology views aggregate client-side over the most recent
  // matching events (the backend endpoints return attributed rows, not
  // aggregates), so fetch one max-size page for them.
  const {
    data: sample,
    isLoading: sampleLoading,
    isError: sampleError,
  } = useQuery({
    queryKey: [...DOWNLOADS_QUERY_KEY, "sample", applied],
    queryFn: () => fetchDownloads(applied, 1, DOWNLOADS_MAX_PER_PAGE),
    enabled: !!user?.is_admin && view !== "events",
    retry: false,
    placeholderData: (prev) => prev,
  });

  const ipGroups = useMemo(
    () => groupDownloadsByIp(sample?.downloads ?? []),
    [sample]
  );
  const userGroups = useMemo(
    () => groupDownloadsByUser(sample?.downloads ?? []),
    [sample]
  );
  const sampleTruncated =
    sample != null && sample.total > sample.downloads.length;

  function applyFilters() {
    const artifactId = draft.artifact_id.trim();
    const userId = draft.user_id.trim();
    if (artifactId && !isValidUuid(artifactId)) {
      setFilterError("Artifact ID must be a UUID");
      return;
    }
    if (userId && !isValidUuid(userId)) {
      setFilterError("User ID must be a UUID");
      return;
    }
    setFilterError(null);
    setApplied({ ...draft, artifact_id: artifactId, user_id: userId });
    setPage(1);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFilterError(null);
    setPage(1);
  }

  /** Drill into one network location from the topology view. */
  function drillIntoIp(ip: string) {
    const next = { ...applied, ip };
    setDraft(next);
    setApplied(next);
    setPage(1);
    setView("events");
  }

  /** Drill into one user's activity from the by-user view. */
  function drillIntoUser(userId: string) {
    const next = { ...applied, user_id: userId };
    setDraft(next);
    setApplied(next);
    setPage(1);
    setView("events");
  }

  const eventColumns: DataTableColumn<DownloadRecord>[] = [
    {
      id: "downloaded_at",
      header: "Time",
      accessor: (r) => r.downloaded_at,
      cell: (r) => (
        <span className="whitespace-nowrap text-sm" title={r.downloaded_at}>
          {new Date(r.downloaded_at).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      id: "user",
      header: "User",
      accessor: (r) => r.username ?? "",
      cell: (r) => {
        if (!r.user_id) {
          return <span className="text-muted-foreground">anonymous</span>;
        }
        return r.username ? (
          <span title={r.user_id}>{r.username}</span>
        ) : (
          <span className="font-mono text-xs" title={r.user_id}>
            {truncateId(r.user_id)}
          </span>
        );
      },
      sortable: true,
    },
    {
      id: "ip_address",
      header: "IP",
      accessor: (r) => r.ip_address ?? "",
      cell: (r) => (
        <span className="font-mono text-xs">{r.ip_address ?? "—"}</span>
      ),
      sortable: true,
    },
    {
      id: "artifact",
      header: "Artifact",
      cell: (r) => (
        <span className="font-mono text-xs" title={r.artifact_id}>
          {truncateId(r.artifact_id)}
        </span>
      ),
    },
    {
      id: "user_agent",
      header: "User agent",
      className: "max-w-[260px]",
      cell: (r) => (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={r.user_agent ?? undefined}
        >
          {r.user_agent ? truncateText(r.user_agent, 80) : "—"}
        </span>
      ),
    },
  ];

  const ipColumns: DataTableColumn<IpGroup>[] = [
    {
      id: "ip",
      header: "IP",
      accessor: (g) => g.ip,
      cell: (g) =>
        g.ip === UNKNOWN_NETWORK ? (
          <span className="text-muted-foreground">unknown</span>
        ) : (
          <span className="font-mono text-xs">{g.ip}</span>
        ),
      sortable: true,
    },
    {
      id: "subnet",
      header: "Subnet",
      accessor: (g) => g.subnet,
      cell: (g) => <Badge variant="secondary">{g.subnet}</Badge>,
      sortable: true,
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (g) => g.downloads,
      cell: (g) => <span className="tabular-nums">{g.downloads}</span>,
      sortable: true,
    },
    {
      id: "users",
      header: "Users",
      accessor: (g) => g.unique_users,
      cell: (g) => (
        <span className="tabular-nums">
          {g.unique_users}
          {g.has_anonymous && (
            <span className="ml-1 text-xs text-muted-foreground">+anon</span>
          )}
        </span>
      ),
      sortable: true,
    },
    {
      id: "artifacts",
      header: "Artifacts",
      accessor: (g) => g.unique_artifacts,
      cell: (g) => <span className="tabular-nums">{g.unique_artifacts}</span>,
      sortable: true,
    },
    {
      id: "last",
      header: "Last download",
      accessor: (g) => g.last_downloaded_at,
      cell: (g) => (
        <span className="whitespace-nowrap text-sm" title={g.last_downloaded_at}>
          {new Date(g.last_downloaded_at).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      cell: (g) =>
        g.ip !== UNKNOWN_NETWORK ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`View downloads from ${g.ip}`}
            onClick={() => drillIntoIp(g.ip)}
          >
            View events
          </Button>
        ) : null,
    },
  ];

  const userColumns: DataTableColumn<UserGroup>[] = [
    {
      id: "user",
      header: "User",
      accessor: (g) => g.username ?? "",
      cell: (g) => {
        if (!g.user_id) {
          return <span className="text-muted-foreground">anonymous</span>;
        }
        return g.username ? (
          <span title={g.user_id}>{g.username}</span>
        ) : (
          <span className="font-mono text-xs" title={g.user_id}>
            {truncateId(g.user_id)}
          </span>
        );
      },
      sortable: true,
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (g) => g.downloads,
      cell: (g) => <span className="tabular-nums">{g.downloads}</span>,
      sortable: true,
    },
    {
      id: "ips",
      header: "IPs",
      accessor: (g) => g.unique_ips,
      cell: (g) => <span className="tabular-nums">{g.unique_ips}</span>,
      sortable: true,
    },
    {
      id: "artifacts",
      header: "Artifacts",
      accessor: (g) => g.unique_artifacts,
      cell: (g) => <span className="tabular-nums">{g.unique_artifacts}</span>,
      sortable: true,
    },
    {
      id: "last",
      header: "Last download",
      accessor: (g) => g.last_downloaded_at,
      cell: (g) => (
        <span className="whitespace-nowrap text-sm" title={g.last_downloaded_at}>
          {new Date(g.last_downloaded_at).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      cell: (g) => {
        const uid = g.user_id;
        return uid ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`View downloads by ${g.username ?? uid}`}
            onClick={() => drillIntoUser(uid)}
          >
            View events
          </Button>
        ) : null;
      },
    },
  ];

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Downloads" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view download attribution.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const viewError = view === "events" ? isError : sampleError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Downloads"
        description="Attributed download events — who pulled what, from which network location. Group by IP/subnet for a network-topology view or by user for per-user activity."
        actions={
          <div className="flex items-center gap-2">
            <Network className="size-5 text-muted-foreground" />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Refresh downloads"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: DOWNLOADS_QUERY_KEY })
              }
            >
              <RefreshCw
                className={`size-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="downloads-filter-artifact-id">Artifact ID</Label>
            <Input
              id="downloads-filter-artifact-id"
              className="w-[280px] font-mono"
              placeholder="UUID of the artifact"
              value={draft.artifact_id}
              onChange={(e) => {
                setDraft({ ...draft, artifact_id: e.target.value });
                if (filterError) setFilterError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              aria-invalid={filterError != null}
              aria-describedby="downloads-filter-error"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="downloads-filter-user-id">User ID</Label>
            <Input
              id="downloads-filter-user-id"
              className="w-[280px] font-mono"
              placeholder="UUID of the downloader"
              value={draft.user_id}
              onChange={(e) => {
                setDraft({ ...draft, user_id: e.target.value });
                if (filterError) setFilterError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              aria-invalid={filterError != null}
              aria-describedby="downloads-filter-error"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="downloads-filter-ip">Client IP</Label>
            <Input
              id="downloads-filter-ip"
              className="w-[180px] font-mono"
              placeholder="e.g. 10.0.0.12"
              value={draft.ip}
              onChange={(e) => setDraft({ ...draft, ip: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="downloads-filter-from">From</Label>
            <Input
              id="downloads-filter-from"
              type="date"
              className="w-[150px]"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="downloads-filter-to">To</Label>
            <Input
              id="downloads-filter-to"
              type="date"
              className="w-[150px]"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </div>
          <Button onClick={applyFilters}>Apply Filters</Button>
          {hasAppliedFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        {/* Persistent live region so the validation error is announced and
            stays associated with the UUID inputs. */}
        <p
          id="downloads-filter-error"
          role="alert"
          className="min-h-[1rem] text-sm text-destructive"
        >
          {filterError}
        </p>
      </div>

      {/* View switch */}
      <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="by-ip">By IP / Subnet</TabsTrigger>
          <TabsTrigger value="by-user">By User</TabsTrigger>
        </TabsList>
      </Tabs>

      {viewError ? (
        <Alert variant="destructive">
          <AlertTitle>Download attribution unavailable</AlertTitle>
          <AlertDescription>
            Unable to load download events. This server may not support the
            download-attribution endpoints yet, or the request failed.
          </AlertDescription>
        </Alert>
      ) : view === "events" ? (
        <DataTable
          columns={eventColumns}
          data={data?.downloads ?? []}
          total={data?.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          pageSizeOptions={[20, 50, 100]}
          loading={isLoading}
          emptyMessage="No downloads recorded."
          rowKey={(r) => `${r.artifact_id}:${r.downloaded_at}:${r.ip_address}`}
        />
      ) : (
        <div className="space-y-2">
          {sampleTruncated && sample && (
            <p className="text-sm text-muted-foreground">
              Grouped over the {sample.downloads.length} most recent of{" "}
              {sample.total} matching events. Narrow the filters for a complete
              picture.
            </p>
          )}
          {view === "by-ip" ? (
            <DataTable
              columns={ipColumns}
              data={ipGroups}
              loading={sampleLoading}
              emptyMessage="No downloads recorded."
              rowKey={(g) => g.ip}
            />
          ) : (
            <DataTable
              columns={userColumns}
              data={userGroups}
              loading={sampleLoading}
              emptyMessage="No downloads recorded."
              rowKey={(g) => g.user_id ?? "anonymous"}
            />
          )}
        </div>
      )}
    </div>
  );
}
