"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Square,
  RotateCcw,
  Database,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Unplug,
  ArrowRight,
  Download,
  Copy,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";

import { migrationApi } from "@/lib/api/migration";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type {
  AuthType,
  SourceConnection,
  SourceType,
  CreateConnectionRequest,
  MigrationJob,
  MigrationItem,
  MigrationConfig,
  ConflictResolution,
  CreateMigrationRequest,
  MigrationJobStatus,
  MigrationJobType,
  MigrationProgressEvent,
  MigrationReport,
  ItemSummary,
  AssessmentResult,
} from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

// -- helpers --

function statusColor(
  status: MigrationJobStatus
): "green" | "blue" | "yellow" | "red" | "default" {
  switch (status) {
    case "completed":
      return "green";
    case "running":
    case "assessing":
      return "blue";
    case "paused":
    case "ready":
      return "yellow";
    case "failed":
    case "cancelled":
      return "red";
    default:
      return "default";
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// Migration jobs in a terminal state have a materialized reconciliation report
// (the backend generates it on completion/cancel) — gate the report fetch on
// these so we don't 404 on in-flight jobs.
const TERMINAL_STATUSES: ReadonlySet<MigrationJobStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

// A completed job is 100% by definition; the item-count ratio the backend
// returns can lag (e.g. a job with nothing to transfer reports 0). Other
// statuses keep their real, rounded progress.
function jobProgress(job: MigrationJob): number {
  if (job.status === "completed") return 100;
  return Math.round(job.progress_percent ?? 0);
}

// Denominator for the items ratio. The backend leaves total_items at 0 on some
// jobs (it doesn't always pre-count), which renders as "102/0"; fall back to
// what was actually processed so the ratio makes sense.
function effectiveTotal(job: MigrationJob): number {
  const processed =
    job.completed_items + job.failed_items + job.skipped_items;
  return Math.max(job.total_items, processed);
}

// Same story for bytes: total_bytes can be 0 while bytes were transferred.
function effectiveTotalBytes(job: MigrationJob): number {
  return Math.max(job.total_bytes, job.transferred_bytes);
}

// The reconciliation report's per-category summary (artifacts/repositories/...)
// is only present when the job migrated at least one item of that type, so a
// category can be absent on completed jobs (assessment runs, or a full job that
// touched no artifacts). Render "migrated/total" defensively: an absent summary
// shows "—" and a partial one falls back to 0 instead of crashing the whole
// admin page with a TypeError (artifact-keeper#2455).
// The backend omits a category from the report summary when the job migrated
// nothing of that type (e.g. an artifacts-only job has no repositories key), so
// show 0/0 rather than a bare em-dash, which reads as broken.
function formatItemCount(summary: ItemSummary | undefined): string {
  if (!summary) return "0/0";
  return `${summary.migrated ?? 0}/${summary.total ?? 0}`;
}

// The create-migration config defaults mirror the backend `MigrationConfig`
// serde defaults (models/migration.rs): users/groups/permissions and checksum
// verification on, conflict_resolution "skip", 4 concurrent transfers, 100ms
// throttle. Kept in lock-step so the UI's "unchanged" submit matches what the
// backend would apply for an omitted field.
const DEFAULT_MIG_CONFIG: MigrationConfig = {
  include_repos: [],
  exclude_repos: [],
  exclude_paths: [],
  repo_mappings: {},
  include_users: true,
  include_groups: true,
  include_permissions: true,
  include_cached_remote: false,
  dry_run: false,
  conflict_resolution: "skip",
  concurrent_transfers: 4,
  throttle_delay_ms: 100,
  verify_checksums: true,
};

// Split a free-text list (comma / newline / whitespace separated) into the
// trimmed, non-empty entries the backend `Vec<String>` config fields expect.
function parseList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// A single labeled checkbox row. Extracted so the several boolean migration
// config toggles don't each repeat the same markup (keeps the jscpd
// duplication gate green and the dialog readable).
function BoolField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-input"
      />
      {label}
    </label>
  );
}

// -- page --

// Default to Artifactory to preserve the prior backend default behavior;
// the user can switch to Nexus before submitting.
const INITIAL_CONN_FORM: {
  name: string;
  url: string;
  auth_type: AuthType;
  source_type: SourceType;
  username: string;
  token: string;
} = {
  name: "",
  url: "",
  auth_type: "api_token",
  source_type: "artifactory",
  username: "",
  token: "",
};

export default function MigrationPage() {
  const t = useTranslations("adminMigration");
  const queryClient = useQueryClient();

  // -- Connection state --
  const [createConnOpen, setCreateConnOpen] = useState(false);
  const [deleteConnId, setDeleteConnId] = useState<string | null>(null);
  const [connForm, setConnForm] = useState(INITIAL_CONN_FORM);

  // -- Migration state --
  const [createMigOpen, setCreateMigOpen] = useState(false);
  const [deleteMigId, setDeleteMigId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<MigrationJob | null>(null);
  const [migForm, setMigForm] = useState<{
    source_connection_id: string;
    job_type: MigrationJobType;
  }>({
    source_connection_id: "",
    job_type: "full",
  });
  // Full backend MigrationConfig surface. Repo include/exclude and path
  // exclusions are edited separately (below) then folded into this on submit.
  const [migConfig, setMigConfig] = useState<MigrationConfig>({
    ...DEFAULT_MIG_CONFIG,
  });
  const [excludeReposText, setExcludeReposText] = useState("");
  const [excludePathsText, setExcludePathsText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function resetMigForm() {
    setMigForm({ source_connection_id: "", job_type: "full" });
    setMigConfig({ ...DEFAULT_MIG_CONFIG });
    setExcludeReposText("");
    setExcludePathsText("");
    setDateFrom("");
    setDateTo("");
  }

  // Toggle a source repository in/out of the include_repos allowlist. An empty
  // allowlist means "all repositories" (backend treats an empty Vec as no
  // include filter).
  function toggleIncludeRepo(key: string, on: boolean) {
    setMigConfig((c) => {
      const current = c.include_repos ?? [];
      // Drop any rename when a repo leaves the allowlist — a mapping for a repo
      // that isn't being migrated is meaningless (and is filtered on submit).
      const mappings = { ...(c.repo_mappings ?? {}) };
      if (!on) delete mappings[key];
      return {
        ...c,
        include_repos: on
          ? [...current, key]
          : current.filter((k) => k !== key),
        repo_mappings: mappings,
      };
    });
  }

  // Set (or clear, when target is blank) the destination key a source repo is
  // renamed to on migration. Only repos in the include list can be remapped.
  function setRepoMapping(source: string, target: string) {
    setMigConfig((c) => {
      const mappings = { ...(c.repo_mappings ?? {}) };
      if (target.trim()) mappings[source] = target.trim();
      else delete mappings[source];
      return { ...c, repo_mappings: mappings };
    });
  }

  // -- SSE progress --
  const eventSourceRef = useRef<EventSource | null>(null);
  const [streamingJobId, setStreamingJobId] = useState<string | null>(null);

  // -- Queries --
  const {
    data: connections = [],
    isLoading: connectionsLoading,
  } = useQuery({
    queryKey: ["migration", "connections"],
    queryFn: () => migrationApi.listConnections(),
  });

  const { data: migrationsData, isLoading: migrationsLoading } = useQuery({
    queryKey: ["migration", "jobs"],
    queryFn: () => migrationApi.listMigrations({ per_page: 100 }),
  });

  const { data: detailItems } = useQuery({
    queryKey: ["migration", "items", detailJob?.id],
    queryFn: () =>
      migrationApi.listMigrationItems(detailJob!.id, { per_page: 100 }),
    enabled: !!detailJob,
  });

  // Source repositories for the selected connection — powers the include-repos
  // picker in the Create Migration dialog. Only fetched once a connection is
  // chosen and the dialog is open.
  const { data: sourceRepos = [] } = useQuery({
    queryKey: ["migration", "source-repos", migForm.source_connection_id],
    queryFn: () =>
      migrationApi.listSourceRepositories(migForm.source_connection_id),
    enabled: createMigOpen && !!migForm.source_connection_id,
  });

  // Reconciliation report for a terminal job (materialized by the backend on
  // completion/cancel). Read-only view surfaced in the job detail dialog.
  const { data: detailReport } = useQuery({
    queryKey: ["migration", "report", detailJob?.id],
    queryFn: () => migrationApi.getMigrationReport(detailJob!.id, "json"),
    enabled: !!detailJob && TERMINAL_STATUSES.has(detailJob.status),
  });
  const report =
    detailReport && typeof detailReport !== "string"
      ? (detailReport as MigrationReport)
      : undefined;

  // Pre-migration assessment for assessment-type jobs.
  const { data: assessment } = useQuery<AssessmentResult>({
    queryKey: ["migration", "assessment", detailJob?.id],
    queryFn: () => migrationApi.getAssessment(detailJob!.id),
    enabled: !!detailJob && detailJob.job_type === "assessment",
  });

  const migrations = migrationsData?.items ?? [];

  // -- SSE streaming --
  const startStream = useCallback(
    async (jobId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const es = await migrationApi.createProgressStream(jobId);
      eventSourceRef.current = es;
      setStreamingJobId(jobId);

      es.onmessage = (event) => {
        try {
          const data: MigrationProgressEvent = JSON.parse(event.data);
          if (
            data.type === "job_complete" ||
            data.type === "job_failed"
          ) {
            es.close();
            eventSourceRef.current = null;
            setStreamingJobId(null);
            queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
          } else {
            queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setStreamingJobId(null);
      };
    },
    [queryClient]
  );

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // -- Connection mutations --
  const createConnMutation = useMutation({
    mutationFn: (data: CreateConnectionRequest) =>
      migrationApi.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["migration", "connections"],
      });
      setCreateConnOpen(false);
      setConnForm(INITIAL_CONN_FORM);
      toast.success(t("toastConnCreated"));
    },
    onError: mutationErrorToast(t("toastConnCreateFailed")),
  });

  const deleteConnMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["migration", "connections"],
      });
      setDeleteConnId(null);
      toast.success(t("toastConnDeleted"));
    },
    onError: mutationErrorToast(t("toastConnDeleteFailed")),
  });

  const testConnMutation = useMutation({
    mutationFn: (c: SourceConnection) => migrationApi.testConnection(c.id),
    onSuccess: (result, c) => {
      if (result.success) {
        toast.success(
          t("connVerified", {
            label: t(
              c.source_type === "artifactory"
                ? "sourceTypeArtifactory"
                : "sourceTypeNexus",
            ),
            version: result.artifactory_version || t("unknown"),
          })
        );
      } else {
        toast.error(t("connFailed", { message: result.message }));
      }
    },
    onError: mutationErrorToast(t("toastConnTestFailed")),
  });

  // -- Migration mutations --
  const createMigMutation = useMutation({
    mutationFn: (data: CreateMigrationRequest) =>
      migrationApi.createMigration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setCreateMigOpen(false);
      resetMigForm();
      toast.success(t("toastMigCreated"));
    },
    onError: mutationErrorToast(t("toastMigCreateFailed")),
  });

  const runAssessmentMutation = useMutation({
    mutationFn: (id: string) => migrationApi.runAssessment(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      queryClient.invalidateQueries({
        queryKey: ["migration", "assessment", job.id],
      });
      toast.success(t("toastAssessmentStarted"));
    },
    onError: mutationErrorToast(t("toastAssessmentFailed")),
  });

  const startMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.startMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success(t("toastMigStarted"));
    },
    onError: mutationErrorToast(t("toastMigStartFailed")),
  });

  const pauseMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.pauseMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success(t("toastMigPaused"));
    },
    onError: mutationErrorToast(t("toastMigPauseFailed")),
  });

  const resumeMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.resumeMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success(t("toastMigResumed"));
    },
    onError: mutationErrorToast(t("toastMigResumeFailed")),
  });

  const cancelMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.cancelMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success(t("toastMigCancelled"));
    },
    onError: mutationErrorToast(t("toastMigCancelFailed")),
  });

  const deleteMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setDeleteMigId(null);
      toast.success(t("toastMigDeleted"));
    },
    onError: mutationErrorToast(t("toastMigDeleteFailed")),
  });

  // Copy a connection's UUID to the clipboard. Previously the only way to get
  // the connection id was a direct DB query on source_connections (issue #520);
  // surfacing it here lets operators grab it for API / SDK use.
  const copyConnectionId = (id: string) => {
    void navigator.clipboard?.writeText(id);
    toast.success(t("toastConnIdCopied"));
  };

  const copyPath = (label: string, path: string) => {
    void navigator.clipboard?.writeText(path);
    toast.success(t("toastPathCopied", { label }));
  };

  // Fetch the reconciliation report as HTML and trigger a file download so
  // operators can archive it. Falls back to a toast on failure.
  const downloadReportHtml = async (jobId: string) => {
    try {
      const html = await migrationApi.getMigrationReport(jobId, "html");
      if (typeof html !== "string") return;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `migration-report-${jobId}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("toastReportDownloadFailed"));
    }
  };

  // -- Connection columns --
  const connColumns: DataTableColumn<SourceConnection>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (c) => c.name,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Database className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{c.name}</span>
        </div>
      ),
    },
    {
      id: "id",
      header: t("colConnectionId"),
      accessor: (c) => c.id,
      cell: (c) => (
        <div className="flex items-center gap-1.5">
          <code className="text-xs text-muted-foreground truncate max-w-[160px]">
            {c.id}
          </code>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("copyIdAria")}
                onClick={(e) => {
                  e.stopPropagation();
                  copyConnectionId(c.id);
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("copyIdTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
    {
      id: "url",
      header: t("colEndpoint"),
      accessor: (c) => c.url,
      cell: (c) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[300px]">
          {c.url}
        </span>
      ),
    },
    {
      id: "auth_type",
      header: t("colAuthType"),
      cell: (c) => (
        <Badge variant="secondary" className="text-xs">
          {c.auth_type === "api_token" ? t("authApiToken") : t("authBasicAuth")}
        </Badge>
      ),
    },
    {
      id: "verified",
      header: t("colVerified"),
      cell: (c) => (
        <StatusBadge
          status={c.verified_at ? t("statusVerified") : t("statusUnverified")}
          color={c.verified_at ? "green" : "default"}
        />
      ),
    },
    {
      id: "created",
      header: t("colCreated"),
      accessor: (c) => c.created_at,
      cell: (c) => (
        <span className="text-sm text-muted-foreground">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (c) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => testConnMutation.mutate(c)}
                disabled={testConnMutation.isPending}
              >
                <Unplug className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("testConnTooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConnId(c.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("deleteLabel")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- Migration columns --
  const migColumns: DataTableColumn<MigrationJob>[] = [
    {
      id: "id",
      header: t("colJob"),
      cell: (j) => {
        // Scope the row by its target repos so jobs are distinguishable at a
        // glance; empty include_repos means the whole connection.
        const repos = [...(j.config.include_repos ?? [])].sort((a, b) =>
          a.localeCompare(b),
        );
        const others = repos.length - 1;
        const scope =
          repos.length === 0
            ? t("allRepositories")
            : repos.length === 1
              ? repos[0]
              : t("scopeOthers", {
                  first: repos[0],
                  count: others,
                });
        return (
          <button
            className="flex flex-col items-start text-left"
            onClick={(e) => {
              e.stopPropagation();
              setDetailJob(j);
            }}
          >
            <span className="text-sm font-medium text-primary hover:underline">
              {scope}
            </span>
            <span className="text-xs text-muted-foreground">
              {j.id.slice(0, 8)}...
            </span>
          </button>
        );
      },
    },
    {
      id: "connection",
      header: t("colSource"),
      cell: (j) => {
        const conn = connections.find(
          (c) => c.id === j.source_connection_id
        );
        return (
          <span className="text-sm">
            {conn?.name ?? j.source_connection_id.slice(0, 8)}
          </span>
        );
      },
    },
    {
      id: "type",
      header: t("colType"),
      cell: (j) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {j.job_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: (j) => <StatusBadge status={j.status} color={statusColor(j.status)} />,
    },
    {
      id: "progress",
      header: t("colProgress"),
      cell: (j) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress
            value={jobProgress(j)}
            className="flex-1 h-1.5"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {jobProgress(j)}%
          </span>
        </div>
      ),
    },
    {
      id: "items",
      header: t("colItems"),
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.completed_items}/{effectiveTotal(j)}
          {j.failed_items > 0 && (
            <span className="text-red-500 ml-1">
              {t("itemsFailed", { count: j.failed_items })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "started",
      header: t("colStarted"),
      accessor: (j) => j.started_at ?? "",
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.started_at
            ? new Date(j.started_at).toLocaleString()
            : t("notStarted")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (j) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {(j.status === "pending" || j.status === "ready") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => startMigMutation.mutate(j.id)}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("startTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {j.status === "running" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => pauseMigMutation.mutate(j.id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("pauseTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {j.status === "paused" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => resumeMigMutation.mutate(j.id)}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("resumeTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => cancelMigMutation.mutate(j.id)}
                >
                  <Square className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("cancelTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {(j.status === "completed" ||
            j.status === "failed" ||
            j.status === "cancelled" ||
            j.status === "pending") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteMigId(j.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("deleteLabel")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // -- Item columns for detail dialog --
  const itemColumns: DataTableColumn<MigrationItem>[] = [
    {
      id: "path",
      header: t("colPath"),
      accessor: (i) => i.source_path,
      // Source over target in one column; (S)/(T) markers explain which is which
      // on hover. Keeps the dialog from blowing out horizontally.
      cell: (i) => {
        const target = i.target_path;
        return (
          <div className="flex flex-col gap-0.5 text-xs w-[420px]">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 min-w-0 text-left cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyPath(t("sourceLabel"), i.source_path);
                  }}
                >
                  <span className="text-muted-foreground shrink-0">(S)</span>
                  <code className="truncate hover:underline">
                    {i.source_path}
                  </code>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[min(90vw,720px)]">
                <p>{t("sourcePathTooltip")}</p>
                <p className="font-mono text-[10px] break-all opacity-80">
                  {i.source_path}
                </p>
              </TooltipContent>
            </Tooltip>
            {target ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 min-w-0 text-left cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPath(t("targetLabel"), target);
                    }}
                  >
                    <span className="text-muted-foreground shrink-0">(T)</span>
                    <code className="truncate hover:underline text-muted-foreground">
                      {target}
                    </code>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[min(90vw,720px)]">
                  <p>{t("targetPathTooltip")}</p>
                  <p className="font-mono text-[10px] break-all opacity-80">
                    {target}
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <span className="shrink-0">(T)</span>
                <code>-</code>
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "type",
      header: t("colType"),
      cell: (i) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {i.item_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: (i) => {
        const colors: Record<string, "green" | "blue" | "red" | "default"> = {
          completed: "green",
          in_progress: "blue",
          failed: "red",
          skipped: "default",
          pending: "default",
        };
        return (
          <StatusBadge
            status={i.status}
            color={colors[i.status] ?? "default"}
          />
        );
      },
    },
    {
      id: "size",
      header: t("colSize"),
      accessor: (i) => i.size_bytes,
      cell: (i) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(i.size_bytes)}
        </span>
      ),
    },
    {
      id: "error",
      header: t("colError"),
      cell: (i) =>
        i.error_message ? (
          <span className="text-xs text-red-500 truncate block max-w-[200px]">
            {i.error_message}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("refreshAria")}
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["migration"],
                  });
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("refreshTooltip")}</TooltipContent>
          </Tooltip>
        }
      />

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">
            <Database className="size-4" />
            {t("tabConnections")}
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <ArrowRight className="size-4" />
            {t("tabJobs")}
          </TabsTrigger>
        </TabsList>

        {/* -- Connections Tab -- */}
        <TabsContent value="connections" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("tabConnections")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("connSubtitle")}
              </p>
            </div>
            <Button onClick={() => setCreateConnOpen(true)}>
              <Plus className="size-4" />
              {t("addConnection")}
            </Button>
          </div>

          {connections.length === 0 && !connectionsLoading ? (
            <EmptyState
              icon={Database}
              title={t("emptyConnTitle")}
              description={t("emptyConnDescription")}
              action={
                <Button onClick={() => setCreateConnOpen(true)}>
                  <Plus className="size-4" />
                  {t("addConnection")}
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={connColumns}
              data={connections}
              loading={connectionsLoading}
              rowKey={(c) => c.id}
              emptyMessage={t("emptyConnMessage")}
            />
          )}
        </TabsContent>

        {/* -- Jobs Tab -- */}
        <TabsContent value="jobs" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("tabJobs")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("jobsSubtitle")}
              </p>
            </div>
            <Button
              onClick={() => setCreateMigOpen(true)}
              disabled={connections.length === 0}
            >
              <Plus className="size-4" />
              {t("createMigration")}
            </Button>
          </div>

          {migrations.length === 0 && !migrationsLoading ? (
            <EmptyState
              icon={ArrowRight}
              title={t("emptyJobsTitle")}
              description={t("emptyJobsDescription")}
              action={
                <Button
                  onClick={() => setCreateMigOpen(true)}
                  disabled={connections.length === 0}
                >
                  <Plus className="size-4" />
                  {t("createMigration")}
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={migColumns}
              data={migrations}
              loading={migrationsLoading}
              rowKey={(j) => j.id}
              emptyMessage={t("emptyJobsMessage")}
            />
          )}
          <ListTruncationNotice
            shown={migrations.length}
            total={migrationsData?.pagination?.total ?? 0}
          />
        </TabsContent>
      </Tabs>

      {/* -- Create Connection Dialog -- */}
      <Dialog
        open={createConnOpen}
        onOpenChange={(o) => {
          setCreateConnOpen(o);
          if (!o) setConnForm(INITIAL_CONN_FORM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("connDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("connDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createConnMutation.mutate({
                name: connForm.name,
                url: connForm.url,
                auth_type: connForm.auth_type,
                source_type: connForm.source_type,
                credentials:
                  connForm.auth_type === "api_token"
                    ? { token: connForm.token }
                    : {
                        username: connForm.username,
                        password: connForm.token,
                      },
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="conn-name">{t("nameLabel")}</Label>
              <Input
                id="conn-name"
                value={connForm.name}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={t("connNamePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-url">{t("endpointUrlLabel")}</Label>
              <Input
                id="conn-url"
                type="url"
                value={connForm.url}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder={t("endpointUrlPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-source-type">{t("sourceTypeLabel")}</Label>
              <Select
                value={connForm.source_type}
                onValueChange={(v) =>
                  setConnForm((f) => ({ ...f, source_type: v as SourceType }))
                }
              >
                <SelectTrigger id="conn-source-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="artifactory">{t("sourceTypeArtifactory")}</SelectItem>
                  <SelectItem value="nexus">{t("sourceTypeNexus")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("authTypeLabel")}</Label>
              <Select
                value={connForm.auth_type}
                onValueChange={(v) =>
                  setConnForm((f) => ({ ...f, auth_type: v as AuthType }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api_token">{t("authApiToken")}</SelectItem>
                  <SelectItem value="basic_auth">{t("authBasicAuth")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {connForm.auth_type === "basic_auth" && (
              <div className="space-y-2">
                <Label htmlFor="conn-username">{t("usernameLabel")}</Label>
                <Input
                  id="conn-username"
                  value={connForm.username}
                  onChange={(e) =>
                    setConnForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder={t("usernamePlaceholder")}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="conn-token">
                {connForm.auth_type === "api_token" ? t("authApiToken") : t("passwordLabel")}
              </Label>
              <Input
                id="conn-token"
                type="password"
                value={connForm.token}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, token: e.target.value }))
                }
                placeholder={
                  connForm.auth_type === "api_token"
                    ? t("apiTokenPlaceholder")
                    : t("passwordPlaceholder")
                }
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateConnOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createConnMutation.isPending}>
                {createConnMutation.isPending
                  ? t("creating")
                  : t("addConnection")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Create Migration Dialog -- */}
      <Dialog
        open={createMigOpen}
        onOpenChange={(o) => {
          setCreateMigOpen(o);
          if (!o) resetMigForm();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("migDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("migDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // Keep only real renames: target set, differs from source, and the
              // source is actually being migrated. Identity/orphan entries are dropped.
              const includeSet = new Set(migConfig.include_repos ?? []);
              const repo_mappings = Object.fromEntries(
                Object.entries(migConfig.repo_mappings ?? {}).filter(
                  ([src, tgt]) => tgt && tgt !== src && includeSet.has(src),
                ),
              );
              const config: MigrationConfig = {
                ...migConfig,
                exclude_repos: parseList(excludeReposText),
                exclude_paths: parseList(excludePathsText),
                repo_mappings,
              };
              // date_from/date_to only apply to incremental migrations; the
              // backend accepts them as RFC3339 timestamps.
              if (migForm.job_type === "incremental") {
                if (dateFrom) config.date_from = new Date(dateFrom).toISOString();
                if (dateTo) config.date_to = new Date(dateTo).toISOString();
              }
              createMigMutation.mutate({
                source_connection_id: migForm.source_connection_id,
                job_type: migForm.job_type,
                config,
              });
            }}
          >
            <div className="space-y-2">
              <Label>{t("sourceConnectionLabel")}</Label>
              <Select
                value={migForm.source_connection_id}
                onValueChange={(v) =>
                  setMigForm((f) => ({ ...f, source_connection_id: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectConnectionPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("jobTypeLabel")}</Label>
              <Select
                value={migForm.job_type}
                onValueChange={(v) =>
                  setMigForm((f) => ({
                    ...f,
                    job_type: v as MigrationJobType,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{t("jobTypeFull")}</SelectItem>
                  <SelectItem value="incremental">{t("jobTypeIncremental")}</SelectItem>
                  <SelectItem value="assessment">{t("jobTypeAssessment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Repository selection */}
            <div className="space-y-2">
              <Label>{t("includeReposLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("includeReposHint")}
              </p>
              {migForm.source_connection_id && sourceRepos.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {[...sourceRepos]
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map((repo) => {
                      const included = (migConfig.include_repos ?? []).includes(
                        repo.key,
                      );
                      return (
                        <div key={repo.key} className="space-y-1">
                          <BoolField
                            id={`include-repo-${repo.key}`}
                            label={`${repo.key} (${repo.package_type})`}
                            checked={included}
                            onChange={(on) => toggleIncludeRepo(repo.key, on)}
                          />
                          {included && (
                            <div className="ml-6 flex items-center gap-2">
                              <span className="text-xs text-muted-foreground shrink-0">
                                {t("renameTo")}
                              </span>
                              <Input
                                id={`rename-repo-${repo.key}`}
                                className="h-7 text-xs"
                                placeholder={repo.key}
                                value={migConfig.repo_mappings?.[repo.key] ?? ""}
                                onChange={(e) =>
                                  setRepoMapping(repo.key, e.target.value)
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {migForm.source_connection_id
                    ? t("noReposFound")
                    : t("noConnectionSelected")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mig-exclude-repos">{t("excludeReposLabel")}</Label>
              <Textarea
                id="mig-exclude-repos"
                value={excludeReposText}
                onChange={(e) => setExcludeReposText(e.target.value)}
                placeholder={t("excludeReposPlaceholder")}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                {t("excludeReposHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mig-exclude-paths">{t("excludePathsLabel")}</Label>
              <Textarea
                id="mig-exclude-paths"
                value={excludePathsText}
                onChange={(e) => setExcludePathsText(e.target.value)}
                placeholder={t("excludePathsPlaceholder")}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                {t("excludePathsHint")}
              </p>
            </div>

            <Separator />

            {/* Content options */}
            <div className="space-y-2">
              <Label>{t("contentToMigrate")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <BoolField
                  id="mig-include-users"
                  label={t("contentUsers")}
                  checked={migConfig.include_users ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_users: v }))
                  }
                />
                <BoolField
                  id="mig-include-groups"
                  label={t("contentGroups")}
                  checked={migConfig.include_groups ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_groups: v }))
                  }
                />
                <BoolField
                  id="mig-include-permissions"
                  label={t("contentPermissions")}
                  checked={migConfig.include_permissions ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_permissions: v }))
                  }
                />
                <BoolField
                  id="mig-include-cached-remote"
                  label={t("contentCachedRemote")}
                  checked={migConfig.include_cached_remote ?? false}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_cached_remote: v }))
                  }
                />
                <BoolField
                  id="mig-verify-checksums"
                  label={t("contentVerifyChecksums")}
                  checked={migConfig.verify_checksums ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, verify_checksums: v }))
                  }
                />
                <BoolField
                  id="mig-dry-run"
                  label={t("contentDryRun")}
                  checked={migConfig.dry_run ?? false}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, dry_run: v }))
                  }
                />
              </div>
            </div>

            <Separator />

            {/* Transfer tuning */}
            <div className="space-y-2">
              <Label htmlFor="mig-conflict-resolution">{t("conflictResolutionLabel")}</Label>
              <Select
                value={migConfig.conflict_resolution ?? "skip"}
                onValueChange={(v) =>
                  setMigConfig((c) => ({
                    ...c,
                    conflict_resolution: v as ConflictResolution,
                  }))
                }
              >
                <SelectTrigger id="mig-conflict-resolution" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t("conflictSkip")}</SelectItem>
                  <SelectItem value="overwrite">{t("conflictOverwrite")}</SelectItem>
                  <SelectItem value="rename">{t("conflictRename")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mig-concurrent-transfers">
                  {t("concurrentTransfersLabel")}
                </Label>
                <Input
                  id="mig-concurrent-transfers"
                  type="number"
                  min={1}
                  value={migConfig.concurrent_transfers ?? 4}
                  onChange={(e) =>
                    setMigConfig((c) => ({
                      ...c,
                      concurrent_transfers: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mig-throttle-delay">{t("throttleDelayLabel")}</Label>
                <Input
                  id="mig-throttle-delay"
                  type="number"
                  min={0}
                  value={migConfig.throttle_delay_ms ?? 100}
                  onChange={(e) =>
                    setMigConfig((c) => ({
                      ...c,
                      throttle_delay_ms: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>

            {migForm.job_type === "incremental" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="mig-date-from">{t("dateFromLabel")}</Label>
                  <Input
                    id="mig-date-from"
                    type="datetime-local"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mig-date-to">{t("dateToLabel")}</Label>
                  <Input
                    id="mig-date-to"
                    type="datetime-local"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateMigOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  createMigMutation.isPending ||
                  !migForm.source_connection_id
                }
              >
                {createMigMutation.isPending
                  ? t("creating")
                  : t("createMigration")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Job Detail Dialog -- */}
      <Dialog
        open={!!detailJob}
        onOpenChange={(o) => {
          if (!o) setDetailJob(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("jobDetailTitle", { id: detailJob?.id?.slice(0, 8) ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("jobDetailDescription")}
            </DialogDescription>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailStatus")}</p>
                  <StatusBadge
                    status={detailJob.status}
                    color={statusColor(detailJob.status)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailProgress")}</p>
                  <p className="font-semibold">
                    {jobProgress(detailJob)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("colItems")}</p>
                  <p className="font-semibold">
                    {detailJob.completed_items}/{effectiveTotal(detailJob)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailTransferred")}</p>
                  <p className="font-semibold">
                    {formatBytes(detailJob.transferred_bytes)}/{formatBytes(effectiveTotalBytes(detailJob))}
                  </p>
                </div>
              </div>
              <Progress
                value={jobProgress(detailJob)}
                className="h-2"
              />
              {/* Repositories this job handles (empty = whole connection). */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  {t("repositoriesLabel")}
                </p>
                {(detailJob.config.include_repos?.length ?? 0) === 0 ? (
                  <p className="text-sm">{t("allReposOnConnection")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {[...detailJob.config.include_repos!]
                      .sort((a, b) => a.localeCompare(b))
                      .map((r) => {
                        // include_repos holds source (Nexus) keys; a mapping means
                        // this repo is renamed on migration. Renamed → show
                        // "source → target" with a hover; otherwise show it plain.
                        const renamedTo = detailJob.config.repo_mappings?.[r];
                        if (!renamedTo) {
                          return (
                            <code
                              key={r}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                            >
                              {r}
                            </code>
                          );
                        }
                        return (
                          <Tooltip key={r}>
                            <TooltipTrigger asChild>
                              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                {r} → {renamedTo}
                              </code>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("renamedTo", { target: renamedTo })}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                  </div>
                )}
              </div>
              {detailJob.error_summary && (
                <div className="text-sm text-red-500 rounded-md border border-red-200 bg-red-50 p-3 dark:bg-red-950/20 dark:border-red-800">
                  {detailJob.error_summary}
                </div>
              )}
              {/* Assessment (assessment-type jobs) */}
              {detailJob.job_type === "assessment" && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <ClipboardCheck className="size-4" />
                      {t("assessmentLabel")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runAssessmentMutation.isPending}
                      onClick={() =>
                        runAssessmentMutation.mutate(detailJob.id)
                      }
                    >
                      {t("runAssessment")}
                    </Button>
                  </div>
                  {assessment ? (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t("repositoriesLabel")}
                          </p>
                          <p className="font-semibold">
                            {assessment.repositories.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("assessmentUsers")}</p>
                          <p className="font-semibold">
                            {assessment.users_count}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t("artifactsLabel")}
                          </p>
                          <p className="font-semibold">
                            {assessment.total_artifacts}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {t("estDuration")}
                          </p>
                          <p className="font-semibold">
                            {formatDuration(
                              assessment.estimated_duration_seconds,
                            )}
                          </p>
                        </div>
                      </div>
                      {assessment.blockers.length > 0 && (
                        <div className="text-xs text-red-500">
                          {t("blockers", { list: assessment.blockers.join(", ") })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("noAssessment")}
                    </p>
                  )}
                </div>
              )}

              {/* Reconciliation report (terminal jobs) */}
              {report && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <FileText className="size-4" />
                      {t("reportTitle")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReportHtml(detailJob.id)}
                    >
                      <Download className="size-3.5" />
                      {t("htmlLabel")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("artifactsLabel")}</p>
                      <p className="font-semibold">
                        {formatItemCount(report.summary?.artifacts)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("reportRepos")}</p>
                      <p className="font-semibold">
                        {formatItemCount(report.summary?.repositories)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("reportWarnings")}</p>
                      <p className="font-semibold">
                        {report.warnings?.length ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("reportErrors")}</p>
                      <p className="font-semibold">{report.errors?.length ?? 0}</p>
                    </div>
                  </div>
                  {(report.recommendations?.length ?? 0) > 0 && (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {report.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <DataTable
                columns={itemColumns}
                data={detailItems?.items ?? []}
                loading={!detailItems}
                rowKey={(i) => i.id}
                emptyMessage={t("noItems")}
              />
              <ListTruncationNotice
                shown={detailItems?.items.length ?? 0}
                total={detailItems?.pagination?.total ?? 0}
              />
            </div>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* -- Delete Connection Confirm -- */}
      <ConfirmDialog
        open={!!deleteConnId}
        onOpenChange={(o) => {
          if (!o) setDeleteConnId(null);
        }}
        title={t("deleteConnTitle")}
        description={t("deleteConnDescription")}
        confirmText={t("deleteLabel")}
        danger
        loading={deleteConnMutation.isPending}
        onConfirm={() => {
          if (deleteConnId) deleteConnMutation.mutate(deleteConnId);
        }}
      />

      {/* -- Delete Migration Confirm -- */}
      <ConfirmDialog
        open={!!deleteMigId}
        onOpenChange={(o) => {
          if (!o) setDeleteMigId(null);
        }}
        title={t("deleteMigTitle")}
        description={t("deleteMigDescription")}
        confirmText={t("deleteLabel")}
        danger
        loading={deleteMigMutation.isPending}
        onConfirm={() => {
          if (deleteMigId) deleteMigMutation.mutate(deleteMigId);
        }}
      />
    </div>
  );
}
