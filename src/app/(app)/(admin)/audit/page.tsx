"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";

import {
  auditApi,
  isValidUuid,
  AUDIT_DEFAULT_PER_PAGE,
  AUDIT_EXPORT_CSV_MIME,
  AUDIT_EXPORT_JSON_MIME,
  auditItemsToCsv,
  auditItemsToJson,
  buildAuditExportFilename,
  type AuditExportFormat,
  type AuditLogItem,
  type AuditLogQuery,
} from "@/lib/api/audit";
import { adminApi } from "@/lib/api/admin";
import { triggerBrowserDownload } from "@/lib/download";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const AUDIT_LOG_QUERY_KEY = ["admin-audit-log"] as const;

interface AuditFilters {
  user_id: string;
  action: string;
  resource_type: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  user_id: "",
  action: "",
  resource_type: "",
  from: "",
  to: "",
};

/**
 * Convert the date-input values (yyyy-mm-dd, local time) to the inclusive
 * RFC 3339 bounds the backend expects: `from` is the start of the picked day,
 * `to` is the end of it.
 */
export function dateBoundsToIso(filters: Pick<AuditFilters, "from" | "to">): {
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

function truncateId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 13)}…` : id;
}

function detailsPreview(details: unknown): string {
  if (details == null) return "—";
  const text = typeof details === "string" ? details : JSON.stringify(details);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // -- pagination + filter state --
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(AUDIT_DEFAULT_PER_PAGE);
  // Draft filters live in the inputs; applied filters drive the query. This
  // avoids firing a request per keystroke on the free-text filters.
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const hasAppliedFilters = Object.values(applied).some((v) => v !== "");

  // The active filters as an `AuditLogQuery`, shared by the list query and the
  // export action so both honor exactly the same criteria.
  const appliedQuery: AuditLogQuery = useMemo(
    () => ({
      user_id: applied.user_id || undefined,
      action: applied.action || undefined,
      resource_type: applied.resource_type || undefined,
      ...dateBoundsToIso(applied),
    }),
    [applied]
  );

  // -- queries --
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: [...AUDIT_LOG_QUERY_KEY, page, pageSize, applied],
    queryFn: () =>
      auditApi.list({ ...appliedQuery, page, per_page: pageSize }),
    enabled: !!user?.is_admin,
    retry: false,
    placeholderData: (prev) => prev,
  });

  // Resolve actor user ids to usernames for display. The audit response only
  // carries the acting user's id (#2366); join against the admin user list
  // client-side so the table shows a human-readable actor.
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!user?.is_admin,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const usernameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users ?? []) map.set(u.id, u.username);
    return map;
  }, [users]);

  function applyFilters() {
    const uid = draft.user_id.trim();
    if (uid && !isValidUuid(uid)) {
      setFilterError("User ID must be a UUID");
      return;
    }
    setFilterError(null);
    setApplied({ ...draft, user_id: uid });
    setPage(1);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFilterError(null);
    setPage(1);
  }

  // Nothing to export when the current filters match no events. Disabling the
  // control is a friendlier signal than letting the user trigger an empty file.
  const noEvents = !isLoading && data != null && data.total === 0;

  async function handleExport(format: AuditExportFormat) {
    setIsExporting(true);
    try {
      const result = await auditApi.export(appliedQuery);
      if (result.items.length === 0) {
        toast.info("No audit events match the current filters.");
        return;
      }
      const content =
        format === "csv"
          ? auditItemsToCsv(result.items)
          : auditItemsToJson(result.items, {
              filters: appliedQuery,
              total: result.total,
              truncated: result.truncated,
            });
      triggerBrowserDownload(
        buildAuditExportFilename(format),
        content,
        format === "csv" ? AUDIT_EXPORT_CSV_MIME : AUDIT_EXPORT_JSON_MIME
      );

      const n = result.items.length.toLocaleString();
      if (result.truncated) {
        toast.warning(
          `Exported the first ${n} of ${result.total.toLocaleString()} matching events. Narrow the filters to export the rest.`
        );
      } else {
        toast.success(
          `Exported ${n} audit event${result.items.length === 1 ? "" : "s"}.`
        );
      }
    } catch {
      toast.error("Failed to export the audit log. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  const columns: DataTableColumn<AuditLogItem>[] = [
    {
      id: "created_at",
      header: "Time",
      accessor: (r) => r.created_at,
      cell: (r) => (
        <span className="whitespace-nowrap text-sm" title={r.created_at}>
          {new Date(r.created_at).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      id: "actor",
      header: "Actor",
      cell: (r) => {
        if (!r.user_id) {
          return <span className="text-muted-foreground">system</span>;
        }
        const username = usernameById.get(r.user_id);
        return username ? (
          <span title={r.user_id}>{username}</span>
        ) : (
          <span className="font-mono text-xs" title={r.user_id}>
            {truncateId(r.user_id)}
          </span>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      accessor: (r) => r.action,
      cell: (r) => <Badge variant="outline">{r.action}</Badge>,
      sortable: true,
    },
    {
      id: "resource",
      header: "Resource",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary">{r.resource_type}</Badge>
          {r.resource_id && (
            <span className="font-mono text-xs" title={r.resource_id}>
              {truncateId(r.resource_id)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "ip_address",
      header: "IP",
      cell: (r) => (
        <span className="font-mono text-xs">{r.ip_address ?? "—"}</span>
      ),
    },
    {
      id: "details",
      header: "Details",
      className: "max-w-[280px]",
      cell: (r) => (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={
            r.details == null
              ? undefined
              : typeof r.details === "string"
                ? r.details
                : JSON.stringify(r.details, null, 2)
          }
        >
          {detailsPreview(r.details)}
        </span>
      ),
    },
  ];

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Log" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view the audit log.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Browse recorded audit events: logins, user and repository changes, token lifecycle, and other administrative actions."
        actions={
          <div className="flex items-center gap-2">
            <ScrollText className="size-5 text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExporting || noEvents}
                  aria-label="Export audit log"
                >
                  {isExporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => handleExport("csv")}
                  disabled={isExporting}
                >
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleExport("json")}
                  disabled={isExporting}
                >
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Refresh audit log"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: AUDIT_LOG_QUERY_KEY })
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
            <Label htmlFor="audit-filter-action">Action</Label>
            <Input
              id="audit-filter-action"
              className="w-[180px]"
              placeholder="e.g. LOGIN"
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-resource-type">Resource type</Label>
            <Input
              id="audit-filter-resource-type"
              className="w-[160px]"
              placeholder="e.g. user"
              value={draft.resource_type}
              onChange={(e) =>
                setDraft({ ...draft, resource_type: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-user-id">User ID</Label>
            <Input
              id="audit-filter-user-id"
              className="w-[280px] font-mono"
              placeholder="UUID of the acting user"
              value={draft.user_id}
              onChange={(e) => {
                setDraft({ ...draft, user_id: e.target.value });
                if (filterError) setFilterError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              aria-invalid={filterError != null}
              aria-describedby="audit-filter-error"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-from">From</Label>
            <Input
              id="audit-filter-from"
              type="date"
              className="w-[150px]"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-filter-to">To</Label>
            <Input
              id="audit-filter-to"
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
            stays associated with the User ID input. */}
        <p
          id="audit-filter-error"
          role="alert"
          className="min-h-[1rem] text-sm text-destructive"
        >
          {filterError}
        </p>
      </div>

      {/* Data table */}
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Audit log unavailable</AlertTitle>
          <AlertDescription>
            Unable to load audit events. This server may not support the audit
            query endpoint yet, or the request failed.
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          total={data?.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          pageSizeOptions={[25, 50, 100, 200]}
          loading={isLoading}
          emptyMessage="No audit events found."
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}
