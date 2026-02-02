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
} from "lucide-react";
import { toast } from "sonner";

import { migrationApi } from "@/lib/api/migration";
import type {
  SourceConnection,
  CreateConnectionRequest,
  MigrationJob,
  MigrationItem,
  CreateMigrationRequest,
  MigrationJobStatus,
  MigrationProgressEvent,
} from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// -- page --

export default function MigrationPage() {
  const queryClient = useQueryClient();

  // -- Connection state --
  const [createConnOpen, setCreateConnOpen] = useState(false);
  const [deleteConnId, setDeleteConnId] = useState<string | null>(null);
  const [connForm, setConnForm] = useState({
    name: "",
    url: "",
    auth_type: "api_token" as "api_token" | "basic_auth",
    username: "",
    token: "",
  });

  // -- Migration state --
  const [createMigOpen, setCreateMigOpen] = useState(false);
  const [deleteMigId, setDeleteMigId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<MigrationJob | null>(null);
  const [migForm, setMigForm] = useState({
    source_connection_id: "",
    job_type: "full" as "full" | "incremental" | "assessment",
    dry_run: false,
  });

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

  const migrations = migrationsData?.items ?? [];

  // -- SSE streaming --
  const startStream = useCallback(
    (jobId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const es = migrationApi.createProgressStream(jobId);
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
      setConnForm({
        name: "",
        url: "",
        auth_type: "api_token",
        username: "",
        token: "",
      });
      toast.success("Connection created");
    },
    onError: () => toast.error("Failed to create connection"),
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
    onError: () => toast.error("Failed to delete connection"),
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
    onError: () => toast.error("Failed to test connection"),
  });

  // -- Migration mutations --
  const createMigMutation = useMutation({
    mutationFn: (data: CreateMigrationRequest) =>
      migrationApi.createMigration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setCreateMigOpen(false);
      setMigForm({
        source_connection_id: "",
        job_type: "full",
        dry_run: false,
      });
      toast.success("Migration job created");
    },
    onError: () => toast.error("Failed to create migration"),
  });

  const startMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.startMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("Migration started");
    },
    onError: () => toast.error("Failed to start migration"),
  });

  const pauseMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.pauseMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("Migration paused");
    },
    onError: () => toast.error("Failed to pause migration"),
  });

  const resumeMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.resumeMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("Migration resumed");
    },
    onError: () => toast.error("Failed to resume migration"),
  });

  const cancelMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.cancelMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("Migration cancelled");
    },
    onError: () => toast.error("Failed to cancel migration"),
  });

  const deleteMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setDeleteMigId(null);
      toast.success("Migration deleted");
    },
    onError: () => toast.error("Failed to delete migration"),
  });

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
          if (!o)
            setConnForm({
              name: "",
              url: "",
              auth_type: "api_token",
              username: "",
              token: "",
            });
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
              <Label>Authentication Type</Label>
              <Select
                value={connForm.auth_type}
                onValueChange={(v) =>
                  setConnForm((f) => ({
                    ...f,
                    auth_type: v as "api_token" | "basic_auth",
                  }))
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
          if (!o)
            setMigForm({
              source_connection_id: "",
              job_type: "full",
              dry_run: false,
            });
        }}
      >
        <DialogContent className="sm:max-w-md">
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
              createMigMutation.mutate({
                source_connection_id: migForm.source_connection_id,
                job_type: migForm.job_type,
                config: {
                  dry_run: migForm.dry_run,
                },
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
                    job_type: v as "full" | "incremental" | "assessment",
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
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={migForm.dry_run}
                  onChange={(e) =>
                    setMigForm((f) => ({ ...f, dry_run: e.target.checked }))
                  }
                  className="rounded border-input"
                />
                Dry run (simulate without transferring)
              </label>
            </div>
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
