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
import { useTranslations } from "next-intl";

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
import { mutationErrorToast, isForbiddenError, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

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

import { isSafeUrl } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { unwrap } from "@/lib/sdk-utils";

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
  const t = useTranslations("plugins");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Plugin configuration read/write is admin-only on the backend
  // (#2512 / AK-SEC-001). Gate the Configure affordance accordingly and lean
  // on backend 403s for defense in depth.
  const canConfigure = !!user?.is_admin;

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
      const data = await unwrap(listPlugins({
        query: {
          status: statusFilter !== "__all__" ? statusFilter : undefined,
        },
      }));
      return data as any as PluginsResponse;
    },
  });

  const {
    data: pluginConfig,
    isError: configIsError,
    error: configError,
  } = useQuery({
    queryKey: ["plugin-config", configPlugin?.id],
    queryFn: async () => {
      const data = await unwrap(getPluginConfig({
        path: { id: configPlugin!.id },
      }));
      return (data as any).items as PluginConfig[];
    },
    // Config is admin-only (#2512). Non-admins never trigger the request; the
    // Configure affordance is hidden for them, and a stale-admin 403 is handled
    // gracefully in the dialog below.
    enabled: !!configPlugin && canConfigure,
  });

  const plugins = data?.items ?? [];
  const activeCount = plugins.filter((p) => p.status === "active").length;
  const errorCount = plugins.filter((p) => p.status === "error").length;

  // -- mutations --
  const enableMutation = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(enablePlugin({ path: { id } }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success(t("enabled"));
    },
    onError: mutationErrorToast(t("enabledError")),
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(disablePlugin({ path: { id } }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success(t("disabled"));
    },
    onError: mutationErrorToast(t("disabledError")),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(uninstallPlugin({ path: { id } }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setUninstallId(null);
      toast.success(t("uninstalled"));
    },
    onError: mutationErrorToast(t("uninstalledError")),
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
      await unwrap(updatePluginConfig({
        path: { id },
        body: { config } as any,
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugin-config"] });
      toast.success(t("configSaved"));
    },
    onError: mutationErrorToast(t("configSaveError")),
  });

  const resetInstallForm = () => {
    setGitUrl("");
    setGitRef("");
    setZipFile(null);
    setInstallTab("git");
  };

  const installGitMutation = useMutation({
    mutationFn: async ({ url, ref }: { url: string; ref?: string }) => {
      const data = await unwrap(installFromGit({
        body: { url, ref: ref || null },
      }));
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(t("installed", { name: data?.name ?? t("unknown") }));
    },
    onError: mutationErrorToast(t("installGitError")),
  });

  const installZipMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const data = await unwrap(installFromZip({
        body: formData,
      } as any));
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(t("installed", { name: data?.name ?? t("unknown") }));
    },
    onError: mutationErrorToast(t("installZipError")),
  });

  const isInstalling =
    installGitMutation.isPending || installZipMutation.isPending;

  // -- columns --
  const columns: DataTableColumn<Plugin>[] = [
    {
      id: "name",
      header: t("colName"),
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
      header: t("colType"),
      cell: (p) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[p.plugin_type] ?? ""}`}
        >
          {t(`type_${p.plugin_type}`)}
        </span>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: (p) => (
        <StatusBadge
          status={t(`status_${p.status}`)}
          color={STATUS_COLORS[p.status] ?? "default"}
        />
      ),
    },
    {
      id: "description",
      header: t("colDescription"),
      cell: (p) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
          {p.description || "-"}
        </span>
      ),
    },
    {
      id: "author",
      header: t("colAuthor"),
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.author || "-"}
        </span>
      ),
    },
    {
      id: "installed",
      header: t("colInstalled"),
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
          {canConfigure && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("configureAria", { name: p.name })}
                  onClick={() => {
                    setConfigPlugin(p);
                    setConfigValues({});
                  }}
                >
                  <Settings className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("configure")}</TooltipContent>
            </Tooltip>
          )}
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
              <TooltipContent>{t("enable")}</TooltipContent>
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
              <TooltipContent>{t("disable")}</TooltipContent>
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
            <TooltipContent>{t("uninstall")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
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
              <TooltipContent>{t("refresh")}</TooltipContent>
            </Tooltip>
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              {t("installPlugin")}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statTotal")}</p>
              <p className="text-2xl font-semibold">{plugins.length}</p>
            </div>
            <Puzzle className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statActive")}</p>
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
              <p className="text-sm text-muted-foreground">{t("statErrors")}</p>
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
            <p className="text-sm text-muted-foreground">{t("statDisabled")}</p>
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
            <SelectValue placeholder={t("filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allStatuses")}</SelectItem>
            <SelectItem value="active">{t("status_active")}</SelectItem>
            <SelectItem value="disabled">{t("status_disabled")}</SelectItem>
            <SelectItem value="error">{t("status_error")}</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "__all__" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter("__all__")}
          >
            {t("clearFilter")}
          </Button>
        )}
      </div>

      {/* Table */}
      {plugins.length === 0 && !isLoading ? (
        <EmptyState
          icon={Puzzle}
          title={t("noPlugins")}
          description={t("noPluginsDescription")}
          action={
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              {t("installPlugin")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={plugins}
          loading={isLoading}
          rowKey={(p) => p.id}
          emptyMessage={t("noPluginsFound")}
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
            <DialogTitle>{t("installDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("installDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={installTab}
            onValueChange={(v) => setInstallTab(v as "git" | "zip")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="git" className="flex-1 gap-1.5">
                <GitBranch className="size-3.5" />
                {t("gitRepository")}
              </TabsTrigger>
              <TabsTrigger value="zip" className="flex-1 gap-1.5">
                <Upload className="size-3.5" />
                {t("zipUpload")}
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
                  <Label htmlFor="git-url">{t("repositoryUrl")}</Label>
                  <Input
                    id="git-url"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder={t("repositoryUrlPlaceholder")}
                    required
                    disabled={isInstalling}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="git-ref">
                    {t("gitRef")}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({t("optional")})
                    </span>
                  </Label>
                  <Input
                    id="git-ref"
                    value={gitRef}
                    onChange={(e) => setGitRef(e.target.value)}
                    placeholder={t("gitRefPlaceholder")}
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
                    {t("cancel")}
                  </Button>
                  <Button type="submit" disabled={isInstalling || !gitUrl.trim()}>
                    {installGitMutation.isPending ? t("installing") : t("install")}
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
                  <Label htmlFor="zip-file">{t("pluginZipFile")}</Label>
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
                    {t("cancel")}
                  </Button>
                  <Button type="submit" disabled={isInstalling || !zipFile}>
                    {installZipMutation.isPending ? t("uploading") : t("uploadAndInstall")}
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
                <DialogTitle>{t("configureTitle", { name: configPlugin.name })}</DialogTitle>
                <DialogDescription>
                  {t("configureDescription")}
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">{t("infoTab")}</TabsTrigger>
                  <TabsTrigger value="config">{t("configTab")}</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t("infoName")}</p>
                      <p className="font-medium">{configPlugin.name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("infoVersion")}</p>
                      <p className="font-medium">{configPlugin.version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("infoType")}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[configPlugin.plugin_type] ?? ""}`}
                      >
                        {t(`type_${configPlugin.plugin_type}`)}
                      </span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("infoStatus")}</p>
                      <StatusBadge
                        status={t(`status_${configPlugin.status}`)}
                        color={STATUS_COLORS[configPlugin.status] ?? "default"}
                      />
                    </div>
                    {configPlugin.description && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">{t("infoDescription")}</p>
                        <p>{configPlugin.description}</p>
                      </div>
                    )}
                    {configPlugin.author && (
                      <div>
                        <p className="text-muted-foreground">{t("infoAuthor")}</p>
                        <p>{configPlugin.author}</p>
                      </div>
                    )}
                    {configPlugin.homepage && (
                      <div>
                        <p className="text-muted-foreground">{t("infoHomepage")}</p>
                        {isSafeUrl(configPlugin.homepage) ? (
                          <a
                            href={configPlugin.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {configPlugin.homepage}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            {configPlugin.homepage}
                          </span>
                        )}
                      </div>
                    )}
                    {configPlugin.error_message && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">{t("infoError")}</p>
                        <p className="text-red-500">
                          {configPlugin.error_message}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="config" className="mt-4">
                  {!canConfigure || (configIsError && isForbiddenError(configError)) ? (
                    <p
                      className="text-sm text-muted-foreground py-8 text-center"
                      role="alert"
                    >
                      {t("configPermissionDenied")}
                    </p>
                  ) : configIsError ? (
                    <p
                      className="text-sm text-red-500 py-8 text-center"
                      role="alert"
                    >
                      {toUserMessage(configError, t("configLoadError"))}
                    </p>
                  ) : pluginConfig && pluginConfig.length > 0 ? (
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
                          ? t("saving")
                          : t("saveConfiguration")}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      {t("noConfigOptions")}
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
        title={t("uninstallTitle")}
        description={t("uninstallDescription")}
        confirmText={t("uninstall")}
        danger
        loading={uninstallMutation.isPending}
        onConfirm={() => {
          if (uninstallId) uninstallMutation.mutate(uninstallId);
        }}
      />
    </div>
  );
}
