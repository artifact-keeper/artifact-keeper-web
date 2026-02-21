/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Settings,
  Puzzle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Upload,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

import "@/lib/sdk-client";
import {
  listPlugins,
  getPluginConfig,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  updatePluginConfig,
  installFromGit,
  installFromZip,
} from "@artifact-keeper/sdk";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- types --

interface Plugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  plugin_type:
    | "format_handler"
    | "storage_backend"
    | "authentication"
    | "authorization"
    | "webhook"
    | "custom";
  status: "active" | "disabled" | "error";
  author?: string;
  homepage?: string;
  error_message?: string;
  installed_at: string;
  updated_at: string;
}

interface PluginsResponse {
  items: Plugin[];
  total: number;
}

interface PluginConfig {
  key: string;
  value: string;
  description?: string;
}

// -- constants --

const TYPE_COLORS: Record<string, string> = {
  format_handler:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  storage_backend:
    "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  authentication:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  authorization:
    "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  webhook:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
  custom: "",
};

const STATUS_COLORS: Record<string, "green" | "red" | "default"> = {
  active: "green",
  disabled: "default",
  error: "red",
};

// -- page --

export default function PluginsPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [installOpen, setInstallOpen] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);
  const [uninstallId, setUninstallId] = useState<string | null>(null);

  // install form
  const [installTab, setInstallTab] = useState<"git" | "zip">("git");
  const [gitUrl, setGitUrl] = useState("");
  const [gitRef, setGitRef] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "plugins",
      statusFilter === "__all__" ? undefined : statusFilter,
    ],
    queryFn: async () => {
      const { data, error } = await listPlugins({
        query: {
          status: statusFilter !== "__all__" ? statusFilter : undefined,
        },
      });
      if (error) throw error;
      return data as any as PluginsResponse;
    },
  });

  const { data: pluginConfig } = useQuery({
    queryKey: ["plugin-config", configPlugin?.id],
    queryFn: async () => {
      const { data, error } = await getPluginConfig({
        path: { id: configPlugin!.id },
      });
      if (error) throw error;
      return (data as any).items as PluginConfig[];
    },
    enabled: !!configPlugin,
  });

  const plugins = data?.items ?? [];
  const activeCount = plugins.filter((p) => p.status === "active").length;
  const errorCount = plugins.filter((p) => p.status === "error").length;

  // -- mutations --
  const enableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await enablePlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("Plugin enabled");
    },
    onError: () => toast.error("Failed to enable plugin"),
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await disablePlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("Plugin disabled");
    },
    onError: () => toast.error("Failed to disable plugin"),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await uninstallPlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setUninstallId(null);
      toast.success("Plugin uninstalled");
    },
    onError: () => toast.error("Failed to uninstall plugin"),
  });

  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const saveConfigMutation = useMutation({
    mutationFn: async ({
      id,
      config,
    }: {
      id: string;
      config: Record<string, string>;
    }) => {
      const { error } = await updatePluginConfig({
        path: { id },
        body: { config } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugin-config"] });
      toast.success("Configuration saved");
    },
    onError: () => toast.error("Failed to save configuration"),
  });

  const resetInstallForm = () => {
    setGitUrl("");
    setGitRef("");
    setZipFile(null);
    setInstallTab("git");
  };

  const installGitMutation = useMutation({
    mutationFn: async ({ url, ref }: { url: string; ref?: string }) => {
      const { data, error } = await installFromGit({
        body: { url, ref: ref || null },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(
        `Plugin "${data?.name ?? "unknown"}" installed successfully`,
      );
    },
    onError: (err: any) => {
      toast.error(
        err?.detail ?? err?.message ?? "Failed to install plugin from Git",
      );
    },
  });

  const installZipMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await installFromZip({
        body: formData,
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(
        `Plugin "${data?.name ?? "unknown"}" installed successfully`,
      );
    },
    onError: (err: any) => {
      toast.error(
        err?.detail ?? err?.message ?? "Failed to install plugin from ZIP",
      );
    },
  });

  const isInstalling =
    installGitMutation.isPending || installZipMutation.isPending;

  // -- columns --
  const columns: DataTableColumn<Plugin>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Puzzle className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{p.name}</span>
          <Badge variant="secondary" className="text-xs">
            {p.version}
          </Badge>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (p) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[p.plugin_type] ?? ""}`}
        >
          {p.plugin_type.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        <StatusBadge
          status={p.status}
          color={STATUS_COLORS[p.status] ?? "default"}
        />
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: (p) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
          {p.description || "-"}
        </span>
      ),
    },
    {
      id: "author",
      header: "Author",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.author || "-"}
        </span>
      ),
    },
    {
      id: "installed",
      header: "Installed",
      accessor: (p) => p.installed_at,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {new Date(p.installed_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (p) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setConfigPlugin(p);
                  setConfigValues({});
                }}
              >
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure</TooltipContent>
          </Tooltip>
          {p.status === "disabled" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => enableMutation.mutate(p.id)}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enable</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => disableMutation.mutate(p.id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disable</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setUninstallId(p.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Uninstall</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plugins"
        description="Manage WASM format handler plugins."
        actions={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["plugins"] })
                  }
                >
                  <RefreshCw
                    className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              Install Plugin
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold">{plugins.length}</p>
            </div>
            <Puzzle className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {activeCount}
              </p>
            </div>
            <CheckCircle2 className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Errors</p>
              <p
                className={`text-2xl font-semibold ${errorCount > 0 ? "text-red-600" : ""}`}
              >
                {errorCount}
              </p>
            </div>
            <XCircle
              className={`size-8 ${errorCount > 0 ? "text-red-200" : "text-muted-foreground/30"}`}
            />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">Disabled</p>
            <p className="text-2xl font-semibold">
              {plugins.length - activeCount - errorCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "__all__" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter("__all__")}
          >
            Clear filter
          </Button>
        )}
      </div>

      {/* Table */}
      {plugins.length === 0 && !isLoading ? (
        <EmptyState
          icon={Puzzle}
          title="No plugins installed"
          description="Install a plugin to extend Artifact Keeper with custom functionality."
          action={
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              Install Plugin
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={plugins}
          loading={isLoading}
          rowKey={(p) => p.id}
          emptyMessage="No plugins found."
        />
      )}

      {/* -- Install Plugin Dialog -- */}
      <Dialog
        open={installOpen}
        onOpenChange={(o) => {
          setInstallOpen(o);
          if (!o) resetInstallForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install Plugin</DialogTitle>
            <DialogDescription>
              Install a format handler plugin from a Git repository or ZIP file.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={installTab}
            onValueChange={(v) => setInstallTab(v as "git" | "zip")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="git" className="flex-1 gap-1.5">
                <GitBranch className="size-3.5" />
                Git Repository
              </TabsTrigger>
              <TabsTrigger value="zip" className="flex-1 gap-1.5">
                <Upload className="size-3.5" />
                ZIP Upload
              </TabsTrigger>
            </TabsList>
            <TabsContent value="git" className="mt-4">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!gitUrl.trim()) return;
                  installGitMutation.mutate({
                    url: gitUrl.trim(),
                    ref: gitRef.trim() || undefined,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="git-url">Repository URL</Label>
                  <Input
                    id="git-url"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="https://github.com/org/plugin-repo.git"
                    required
                    disabled={isInstalling}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="git-ref">
                    Git Ref{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="git-ref"
                    value={gitRef}
                    onChange={(e) => setGitRef(e.target.value)}
                    placeholder="v1.0.0, main, or commit SHA"
                    disabled={isInstalling}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setInstallOpen(false)}
                    disabled={isInstalling}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isInstalling || !gitUrl.trim()}>
                    {installGitMutation.isPending ? "Installing..." : "Install"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="zip" className="mt-4">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!zipFile) return;
                  installZipMutation.mutate(zipFile);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="zip-file">Plugin ZIP File</Label>
                  <Input
                    id="zip-file"
                    type="file"
                    accept=".zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                    disabled={isInstalling}
                  />
                  {zipFile && (
                    <p className="text-xs text-muted-foreground">
                      {zipFile.name} ({(zipFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setInstallOpen(false)}
                    disabled={isInstalling}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isInstalling || !zipFile}>
                    {installZipMutation.isPending ? "Uploading..." : "Upload & Install"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* -- Plugin Config Dialog -- */}
      <Dialog
        open={!!configPlugin}
        onOpenChange={(o) => {
          if (!o) {
            setConfigPlugin(null);
            setConfigValues({});
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {configPlugin && (
            <>
              <DialogHeader>
                <DialogTitle>Configure: {configPlugin.name}</DialogTitle>
                <DialogDescription>
                  View plugin information and edit configuration.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">Information</TabsTrigger>
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Name</p>
                      <p className="font-medium">{configPlugin.name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Version</p>
                      <p className="font-medium">{configPlugin.version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[configPlugin.plugin_type] ?? ""}`}
                      >
                        {configPlugin.plugin_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <StatusBadge
                        status={configPlugin.status}
                        color={STATUS_COLORS[configPlugin.status] ?? "default"}
                      />
                    </div>
                    {configPlugin.description && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Description</p>
                        <p>{configPlugin.description}</p>
                      </div>
                    )}
                    {configPlugin.author && (
                      <div>
                        <p className="text-muted-foreground">Author</p>
                        <p>{configPlugin.author}</p>
                      </div>
                    )}
                    {configPlugin.homepage && (
                      <div>
                        <p className="text-muted-foreground">Homepage</p>
                        <a
                          href={configPlugin.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {configPlugin.homepage}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                    {configPlugin.error_message && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Error</p>
                        <p className="text-red-500">
                          {configPlugin.error_message}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="config" className="mt-4">
                  {pluginConfig && pluginConfig.length > 0 ? (
                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (configPlugin) {
                          const merged = pluginConfig.reduce(
                            (acc, c) => ({
                              ...acc,
                              [c.key]:
                                configValues[c.key] !== undefined
                                  ? configValues[c.key]
                                  : c.value,
                            }),
                            {} as Record<string, string>
                          );
                          saveConfigMutation.mutate({
                            id: configPlugin.id,
                            config: merged,
                          });
                        }
                      }}
                    >
                      {pluginConfig.map((c) => (
                        <div key={c.key} className="space-y-2">
                          <Label htmlFor={`cfg-${c.key}`}>{c.key}</Label>
                          {c.description && (
                            <p className="text-xs text-muted-foreground">
                              {c.description}
                            </p>
                          )}
                          <Input
                            id={`cfg-${c.key}`}
                            defaultValue={c.value}
                            onChange={(e) =>
                              setConfigValues((prev) => ({
                                ...prev,
                                [c.key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                      <Button
                        type="submit"
                        disabled={saveConfigMutation.isPending}
                      >
                        {saveConfigMutation.isPending
                          ? "Saving..."
                          : "Save Configuration"}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No configuration options available for this plugin.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* -- Uninstall Confirm -- */}
      <ConfirmDialog
        open={!!uninstallId}
        onOpenChange={(o) => {
          if (!o) setUninstallId(null);
        }}
        title="Uninstall Plugin"
        description="This will permanently remove this plugin and its configuration. Any features provided by this plugin will stop working."
        confirmText="Uninstall"
        danger
        loading={uninstallMutation.isPending}
        onConfirm={() => {
          if (uninstallId) uninstallMutation.mutate(uninstallId);
        }}
      />
    </div>
  );
}
