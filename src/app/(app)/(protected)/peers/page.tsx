"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Server,
  Wifi,
  RefreshCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { peersApi } from "@/lib/api/replication";
import type { PeerInstance } from "@/lib/api/replication";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes, isSafeUrl } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

// -- helpers --

function cachePercent(peer: PeerInstance): number {
  if (peer.cache_size_bytes === 0) return 0;
  return Math.round(
    (peer.cache_used_bytes / peer.cache_size_bytes) * 100
  );
}

function relativeTime(
  dateStr: string,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return t("secondsAgo", { s: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("minutesAgo", { m: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("hoursAgo", { h: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return t("daysAgo", { d: diffDay });
}

const STATUS_COLORS: Record<string, "green" | "red" | "blue" | "yellow" | "default"> = {
  online: "green",
  offline: "red",
  syncing: "blue",
  degraded: "yellow",
};

// -- page --

export default function PeersPage() {
  const t = useTranslations("peers");
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // create form
  const [form, setForm] = useState({
    name: "",
    endpoint_url: "",
    region: "",
    api_key: "",
  });

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["peers", statusFilter === "__all__" ? undefined : statusFilter],
    queryFn: () =>
      peersApi.list({
        per_page: 100,
        status: statusFilter === "__all__" ? undefined : statusFilter,
      }),
  });

  const peers = data?.items ?? [];
  const onlineCount = peers.filter((p) => p.status === "online").length;
  const syncingCount = peers.filter((p) => p.status === "syncing").length;

  // -- mutations --
  const registerMutation = useMutation({
    mutationFn: (req: { name: string; endpoint_url: string; region?: string; api_key: string }) =>
      peersApi.register(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      setCreateOpen(false);
      setForm({ name: "", endpoint_url: "", region: "", api_key: "" });
      toast.success(t("registered"));
    },
    onError: mutationErrorToast(t("registeredError")),
  });

  const unregisterMutation = useMutation({
    mutationFn: (id: string) => peersApi.unregister(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      setDeleteId(null);
      toast.success(t("unregistered"));
    },
    onError: mutationErrorToast(t("unregisteredError")),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => peersApi.triggerSync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      toast.success(t("syncTriggered"));
    },
    onError: mutationErrorToast(t("syncTriggeredError")),
  });

  // -- columns --
  const columns: DataTableColumn<PeerInstance>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Server className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{p.name}</span>
          {p.is_local && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {t("local")}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "endpoint",
      header: t("colEndpoint"),
      accessor: (p) => p.endpoint_url,
      cell: (p) =>
        isSafeUrl(p.endpoint_url) ? (
          <a
            href={p.endpoint_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary truncate block max-w-[250px]"
          >
            {p.endpoint_url}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground truncate block max-w-[250px]">
            {p.endpoint_url}
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
      id: "region",
      header: t("colRegion"),
      accessor: (p) => p.region ?? "",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.region || "-"}
        </span>
      ),
    },
    {
      id: "cache",
      header: t("colCacheUsage"),
      cell: (p) => {
        const pct = cachePercent(p);
        return (
          <div className="flex items-center gap-2 min-w-[140px]">
            <Progress
              value={pct}
              className={`flex-1 h-1.5 ${pct > 90 ? "[&>[data-slot=progress-indicator]]:bg-red-500" : ""}`}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatBytes(p.cache_used_bytes)} / {formatBytes(p.cache_size_bytes)} ({pct}%)
            </span>
          </div>
        );
      },
    },
    {
      id: "heartbeat",
      header: t("colLastHeartbeat"),
      accessor: (p) => p.last_heartbeat_at ?? "",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.last_heartbeat_at ? relativeTime(p.last_heartbeat_at, t) : t("never")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (p) => {
        const syncDisabled = p.is_local || p.status === "offline";
        return (
          <div
            className="flex items-center gap-1 justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              {/* Disabled buttons get pointer-events-none, so the wrapping
                  span keeps the explanatory tooltip hover/focus reachable. */}
              <TooltipTrigger asChild>
                <span
                  className="inline-flex"
                  tabIndex={syncDisabled ? 0 : undefined}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("syncAria", { name: p.name })}
                    onClick={() => syncMutation.mutate(p.id)}
                    disabled={syncDisabled}
                  >
                    <RefreshCcw className="size-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {p.is_local
                  ? t("localCannotSync")
                  : p.status === "offline"
                    ? t("offlineCannotSync")
                    : t("triggerSync")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex"
                  tabIndex={p.is_local ? 0 : undefined}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    aria-label={t("unregisterAria", { name: p.name })}
                    onClick={() => setDeleteId(p.id)}
                    disabled={p.is_local}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {p.is_local
                  ? t("localCannotUnregister")
                  : t("unregister")}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
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
                    queryClient.invalidateQueries({ queryKey: ["peers"] })
                  }
                >
                  <RefreshCw
                    className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("refresh")}</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("registerPeer")}
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statTotalPeers")}</p>
              <p className="text-2xl font-semibold">{peers.length}</p>
            </div>
            <Server className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statOnline")}</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {onlineCount}
              </p>
            </div>
            <Wifi className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statSyncing")}</p>
              <p className="text-2xl font-semibold text-blue-600">
                {syncingCount}
              </p>
            </div>
            <Loader2 className="size-8 text-blue-200" />
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
            <SelectItem value="online">{t("statusOnline")}</SelectItem>
            <SelectItem value="offline">{t("statusOffline")}</SelectItem>
            <SelectItem value="syncing">{t("statusSyncing")}</SelectItem>
            <SelectItem value="degraded">{t("statusDegraded")}</SelectItem>
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
      {peers.length === 0 && !isLoading ? (
        <EmptyState
          icon={Server}
          title={t("noPeers")}
          description={t("noPeersDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("registerPeer")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={peers}
          loading={isLoading}
          rowKey={(p) => p.id}
          emptyMessage={t("noPeersFound")}
        />
      )}
      <ListTruncationNotice shown={peers.length} total={data?.total ?? 0} />

      {/* -- Register Peer Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o)
            setForm({ name: "", endpoint_url: "", region: "", api_key: "" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("registerDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("registerDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate({
                name: form.name,
                endpoint_url: form.endpoint_url,
                region: form.region || undefined,
                api_key: form.api_key,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="peer-name">{t("name")}</Label>
              <Input
                id="peer-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={t("namePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-url">{t("endpointUrl")}</Label>
              <Input
                id="peer-url"
                type="url"
                value={form.endpoint_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endpoint_url: e.target.value }))
                }
                placeholder={t("endpointPlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-region">
                {t("region")}{" "}
                <span className="text-muted-foreground font-normal">
                  ({t("optional")})
                </span>
              </Label>
              <Input
                id="peer-region"
                value={form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
                }
                placeholder="us-west-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-api-key">{t("apiKey")}</Label>
              <Input
                id="peer-api-key"
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm((f) => ({ ...f, api_key: e.target.value }))
                }
                placeholder={t("apiKeyPlaceholder")}
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? t("registering") : t("register")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirm -- */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={t("unregisterTitle")}
        description={t("unregisterDescription")}
        confirmText={t("unregister")}
        danger
        loading={unregisterMutation.isPending}
        onConfirm={() => {
          if (deleteId) unregisterMutation.mutate(deleteId);
        }}
      />
    </div>
  );
}
