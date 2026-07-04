"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// The create-migration config defaults mirror the backend `MigrationConfig`
// serde defaults (models/migration.rs): users/groups/permissions and checksum
// verification on, conflict_resolution "skip", 4 concurrent transfers, 100ms
// throttle. Kept in lock-step so the UI's "unchanged" submit matches what the
// backend would apply for an omitted field.
const DEFAULT_MIG_CONFIG: MigrationConfig = {
  include_repos: [],
  exclude_repos: [],
  exclude_paths: [],
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
      return {
        ...c,
        include_repos: on
          ? [...current, key]
          : current.filter((k) => k !== key),
      };
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
      toast.success("Connection created");
    },
    onError: mutationErrorToast("Failed to create connection"),
  });

  const deleteConnMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["migration", "connections"],
      });
      setDeleteConnId(null);
      toast.success("Connection deleted");
    },
    onError: mutationErrorToast("Failed to delete connection"),
  });

  const testConnMutation = useMutation({
    mutationFn: (id: string) => migrationApi.testConnection(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `Connection verified. ${result.artifactory_version ? `Artifactory ${result.artifactory_version}` : ""}`
        );
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    },
    onError: mutationErrorToast("Failed to test connection"),
  });

  // -- Migration mutations --
  const createMigMutation = useMutation({
    mutationFn: (data: CreateMigrationRequest) =>
      migrationApi.createMigration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setCreateMigOpen(false);
      resetMigForm();
      toast.success("Migration job created");
    },
    onError: mutationErrorToast("Failed to create migration"),
  });

  const runAssessmentMutation = useMutation({
    mutationFn: (id: string) => migrationApi.runAssessment(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      queryClient.invalidateQueries({
        queryKey: ["migration", "assessment", job.id],
      });
      toast.success("Assessment started");
    },
    onError: mutationErrorToast("Failed to run assessment"),
  });

  const startMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.startMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("Migration started");
    },
    onError: mutationErrorToast("Failed to start migration"),
  });

  const pauseMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.pauseMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("Migration paused");
    },
    onError: mutationErrorToast("Failed to pause migration"),
  });

  const resumeMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.resumeMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("Migration resumed");
    },
    onError: mutationErrorToast("Failed to resume migration"),
  });

  const cancelMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.cancelMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("Migration cancelled");
    },
    onError: mutationErrorToast("Failed to cancel migration"),
  });

  const deleteMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setDeleteMigId(null);
      toast.success("Migration deleted");
    },
    onError: mutationErrorToast("Failed to delete migration"),
  });

  // Copy a connection's UUID to the clipboard. Previously the only way to get
  // the connection id was a direct DB query on source_connections (issue #520);
  // surfacing it here lets operators grab it for API / SDK use.
  const copyConnectionId = (id: string) => {
    void navigator.clipboard?.writeText(id);
    toast.success("Connection ID copied");
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
      toast.error("Failed to download report");
    }
  };

  // -- Connection columns --
  const connColumns: DataTableColumn<SourceConnection>[] = [
    {
      id: "name",
      header: "Name",
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
      header: "Connection ID",
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
                aria-label="Copy connection ID"
                onClick={(e) => {
                  e.stopPropagation();
                  copyConnectionId(c.id);
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy connection ID</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
    {
      id: "url",
      header: "Endpoint",
      accessor: (c) => c.url,
      cell: (c) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[300px]">
          {c.url}
        </span>
      ),
    },
    {
      id: "auth_type",
      header: "Auth Type",
      cell: (c) => (
        <Badge variant="secondary" className="text-xs">
          {c.auth_type === "api_token" ? "API Token" : "Basic Auth"}
        </Badge>
      ),
    },
    {
      id: "verified",
      header: "Verified",
      cell: (c) => (
        <StatusBadge
          status={c.verified_at ? "Verified" : "Unverified"}
          color={c.verified_at ? "green" : "default"}
        />
      ),
    },
    {
      id: "created",
      header: "Created",
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
                onClick={() => testConnMutation.mutate(c.id)}
                disabled={testConnMutation.isPending}
              >
                <Unplug className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Test connection</TooltipContent>
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
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- Migration columns --
  const migColumns: DataTableColumn<MigrationJob>[] = [
    {
      id: "id",
      header: "Job",
      cell: (j) => (
        <button
          className="text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setDetailJob(j);
          }}
        >
          {j.id.slice(0, 8)}...
        </button>
      ),
    },
    {
      id: "connection",
      header: "Source",
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
      header: "Type",
      cell: (j) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {j.job_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (j) => <StatusBadge status={j.status} color={statusColor(j.status)} />,
    },
    {
      id: "progress",
      header: "Progress",
      cell: (j) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress
            value={j.progress_percent ?? 0}
            className="flex-1 h-1.5"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {j.progress_percent ?? 0}%
          </span>
        </div>
      ),
    },
    {
      id: "items",
      header: "Items",
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.completed_items}/{j.total_items}
          {j.failed_items > 0 && (
            <span className="text-red-500 ml-1">
              ({j.failed_items} failed)
            </span>
          )}
        </span>
      ),
    },
    {
      id: "started",
      header: "Started",
      accessor: (j) => j.started_at ?? "",
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.started_at
            ? new Date(j.started_at).toLocaleString()
            : "Not started"}
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
              <TooltipContent>Start</TooltipContent>
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
              <TooltipContent>Pause</TooltipContent>
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
              <TooltipContent>Resume</TooltipContent>
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
              <TooltipContent>Cancel</TooltipContent>
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
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // -- Item columns for detail dialog --
  const itemColumns: DataTableColumn<MigrationItem>[] = [
    {
      id: "source_path",
      header: "Source Path",
      accessor: (i) => i.source_path,
      cell: (i) => (
        <code className="text-xs">{i.source_path}</code>
      ),
    },
    {
      id: "target_path",
      header: "Target Path",
      cell: (i) => (
        <code className="text-xs text-muted-foreground">
          {i.target_path ?? "-"}
        </code>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (i) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {i.item_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
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
      header: "Size",
      accessor: (i) => i.size_bytes,
      cell: (i) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(i.size_bytes)}
        </span>
      ),
    },
    {
      id: "error",
      header: "Error",
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
        title="Migration"
        description="Migrate artifacts from Artifactory or Nexus to Artifact Keeper."
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh migration data"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["migration"],
                  });
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        }
      />

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">
            <Database className="size-4" />
            Source Connections
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <ArrowRight className="size-4" />
            Migration Jobs
          </TabsTrigger>
        </TabsList>

        {/* -- Connections Tab -- */}
        <TabsContent value="connections" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Source Connections</h2>
              <p className="text-sm text-muted-foreground">
                Configure connections to source artifact registries.
              </p>
            </div>
            <Button onClick={() => setCreateConnOpen(true)}>
              <Plus className="size-4" />
              Add Connection
            </Button>
          </div>

          {connections.length === 0 && !connectionsLoading ? (
            <EmptyState
              icon={Database}
              title="No connections"
              description="Add a connection to an Artifactory or Nexus instance to begin migration."
              action={
                <Button onClick={() => setCreateConnOpen(true)}>
                  <Plus className="size-4" />
                  Add Connection
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={connColumns}
              data={connections}
              loading={connectionsLoading}
              rowKey={(c) => c.id}
              emptyMessage="No connections found."
            />
          )}
        </TabsContent>

        {/* -- Jobs Tab -- */}
        <TabsContent value="jobs" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Migration Jobs</h2>
              <p className="text-sm text-muted-foreground">
                Create and manage migration jobs.
              </p>
            </div>
            <Button
              onClick={() => setCreateMigOpen(true)}
              disabled={connections.length === 0}
            >
              <Plus className="size-4" />
              Create Migration
            </Button>
          </div>

          {migrations.length === 0 && !migrationsLoading ? (
            <EmptyState
              icon={ArrowRight}
              title="No migration jobs"
              description="Create a migration job to transfer artifacts from a source registry."
              action={
                <Button
                  onClick={() => setCreateMigOpen(true)}
                  disabled={connections.length === 0}
                >
                  <Plus className="size-4" />
                  Create Migration
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={migColumns}
              data={migrations}
              loading={migrationsLoading}
              rowKey={(j) => j.id}
              emptyMessage="No migration jobs found."
            />
          )}
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
            <DialogTitle>Add Source Connection</DialogTitle>
            <DialogDescription>
              Connect to an Artifactory or Nexus instance for migration.
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
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                value={connForm.name}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., Production Artifactory"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-url">Endpoint URL</Label>
              <Input
                id="conn-url"
                type="url"
                value={connForm.url}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://artifactory.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-source-type">Source Type</Label>
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
                  <SelectItem value="artifactory">Artifactory</SelectItem>
                  <SelectItem value="nexus">Nexus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Authentication Type</Label>
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
                  <SelectItem value="api_token">API Token</SelectItem>
                  <SelectItem value="basic_auth">Basic Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {connForm.auth_type === "basic_auth" && (
              <div className="space-y-2">
                <Label htmlFor="conn-username">Username</Label>
                <Input
                  id="conn-username"
                  value={connForm.username}
                  onChange={(e) =>
                    setConnForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder="admin"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="conn-token">
                {connForm.auth_type === "api_token" ? "API Token" : "Password"}
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
                    ? "Enter API token"
                    : "Enter password"
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
                Cancel
              </Button>
              <Button type="submit" disabled={createConnMutation.isPending}>
                {createConnMutation.isPending
                  ? "Creating..."
                  : "Add Connection"}
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
            <DialogTitle>Create Migration Job</DialogTitle>
            <DialogDescription>
              Configure a new migration from a source connection.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const config: MigrationConfig = {
                ...migConfig,
                exclude_repos: parseList(excludeReposText),
                exclude_paths: parseList(excludePathsText),
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
              <Label>Source Connection</Label>
              <Select
                value={migForm.source_connection_id}
                onValueChange={(v) =>
                  setMigForm((f) => ({ ...f, source_connection_id: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a connection" />
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
              <Label>Job Type</Label>
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
                  <SelectItem value="full">Full Migration</SelectItem>
                  <SelectItem value="incremental">Incremental</SelectItem>
                  <SelectItem value="assessment">Assessment Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Repository selection */}
            <div className="space-y-2">
              <Label>Include Repositories</Label>
              <p className="text-xs text-muted-foreground">
                Leave all unchecked to migrate every repository. Select a
                connection to load its repositories.
              </p>
              {migForm.source_connection_id && sourceRepos.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {sourceRepos.map((repo) => (
                    <BoolField
                      key={repo.key}
                      id={`include-repo-${repo.key}`}
                      label={`${repo.key} (${repo.package_type})`}
                      checked={(migConfig.include_repos ?? []).includes(repo.key)}
                      onChange={(on) => toggleIncludeRepo(repo.key, on)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {migForm.source_connection_id
                    ? "No repositories found for this connection."
                    : "No connection selected."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mig-exclude-repos">Exclude Repositories</Label>
              <Textarea
                id="mig-exclude-repos"
                value={excludeReposText}
                onChange={(e) => setExcludeReposText(e.target.value)}
                placeholder="repo-key-1, repo-key-2"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Comma- or newline-separated repository keys to skip.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mig-exclude-paths">Exclude Paths</Label>
              <Textarea
                id="mig-exclude-paths"
                value={excludePathsText}
                onChange={(e) => setExcludePathsText(e.target.value)}
                placeholder="**/snapshots/**, tmp/**"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Comma- or newline-separated path globs to skip.
              </p>
            </div>

            <Separator />

            {/* Content options */}
            <div className="space-y-2">
              <Label>Content to Migrate</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <BoolField
                  id="mig-include-users"
                  label="Users"
                  checked={migConfig.include_users ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_users: v }))
                  }
                />
                <BoolField
                  id="mig-include-groups"
                  label="Groups"
                  checked={migConfig.include_groups ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_groups: v }))
                  }
                />
                <BoolField
                  id="mig-include-permissions"
                  label="Permissions"
                  checked={migConfig.include_permissions ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_permissions: v }))
                  }
                />
                <BoolField
                  id="mig-include-cached-remote"
                  label="Cached remote artifacts"
                  checked={migConfig.include_cached_remote ?? false}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, include_cached_remote: v }))
                  }
                />
                <BoolField
                  id="mig-verify-checksums"
                  label="Verify checksums"
                  checked={migConfig.verify_checksums ?? true}
                  onChange={(v) =>
                    setMigConfig((c) => ({ ...c, verify_checksums: v }))
                  }
                />
                <BoolField
                  id="mig-dry-run"
                  label="Dry run (simulate without transferring)"
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
              <Label htmlFor="mig-conflict-resolution">Conflict Resolution</Label>
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
                  <SelectItem value="skip">Skip existing</SelectItem>
                  <SelectItem value="overwrite">Overwrite</SelectItem>
                  <SelectItem value="rename">Rename</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mig-concurrent-transfers">
                  Concurrent Transfers
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
                <Label htmlFor="mig-throttle-delay">Throttle Delay (ms)</Label>
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
                  <Label htmlFor="mig-date-from">Date From</Label>
                  <Input
                    id="mig-date-from"
                    type="datetime-local"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mig-date-to">Date To</Label>
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
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createMigMutation.isPending ||
                  !migForm.source_connection_id
                }
              >
                {createMigMutation.isPending
                  ? "Creating..."
                  : "Create Migration"}
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
              Migration Job: {detailJob?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              View detailed progress and individual item status.
            </DialogDescription>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge
                    status={detailJob.status}
                    color={statusColor(detailJob.status)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Progress</p>
                  <p className="font-semibold">
                    {detailJob.progress_percent ?? 0}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Items</p>
                  <p className="font-semibold">
                    {detailJob.completed_items}/{detailJob.total_items}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Transferred</p>
                  <p className="font-semibold">
                    {formatBytes(detailJob.transferred_bytes)}/{formatBytes(detailJob.total_bytes)}
                  </p>
                </div>
              </div>
              <Progress
                value={detailJob.progress_percent ?? 0}
                className="h-2"
              />
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
                      Assessment
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runAssessmentMutation.isPending}
                      onClick={() =>
                        runAssessmentMutation.mutate(detailJob.id)
                      }
                    >
                      Run Assessment
                    </Button>
                  </div>
                  {assessment ? (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Repositories
                          </p>
                          <p className="font-semibold">
                            {assessment.repositories.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Users</p>
                          <p className="font-semibold">
                            {assessment.users_count}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Artifacts
                          </p>
                          <p className="font-semibold">
                            {assessment.total_artifacts}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Est. Duration
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
                          Blockers: {assessment.blockers.join(", ")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No assessment yet. Run an assessment to estimate scope.
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
                      Reconciliation Report
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReportHtml(detailJob.id)}
                    >
                      <Download className="size-3.5" />
                      HTML
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Artifacts</p>
                      <p className="font-semibold">
                        {report.summary.artifacts.migrated}/
                        {report.summary.artifacts.total}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Repos</p>
                      <p className="font-semibold">
                        {report.summary.repositories.migrated}/
                        {report.summary.repositories.total}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Warnings</p>
                      <p className="font-semibold">{report.warnings.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Errors</p>
                      <p className="font-semibold">{report.errors.length}</p>
                    </div>
                  </div>
                  {report.recommendations.length > 0 && (
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
                emptyMessage="No items."
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
        title="Delete Connection"
        description="This will permanently remove this source connection. Existing migration jobs referencing it will remain."
        confirmText="Delete"
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
        title="Delete Migration Job"
        description="This will permanently remove this migration job and its history."
        confirmText="Delete"
        danger
        loading={deleteMigMutation.isPending}
        onConfirm={() => {
          if (deleteMigId) deleteMigMutation.mutate(deleteMigId);
        }}
      />
    </div>
  );
}
