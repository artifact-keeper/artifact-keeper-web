"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Server,
  Wifi,
  WifiOff,
  RefreshCcw,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

import { replicationApi } from "@/lib/api/replication";
import type { EdgeNode, EdgeNodePeer } from "@/lib/api/replication";
import apiClient from "@/lib/api-client";

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- helpers --

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function cachePercent(node: EdgeNode): number {
  if (node.cache_size_bytes === 0) return 0;
  return Math.round(
    (node.cache_used_bytes / node.cache_size_bytes) * 100
  );
}

const STATUS_COLORS: Record<string, "green" | "red" | "blue" | "yellow" | "default"> = {
  online: "green",
  offline: "red",
  syncing: "blue",
  degraded: "yellow",
};

function formatBandwidth(bps: number): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${parseFloat((bps / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// -- page --

export default function EdgeNodesPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<EdgeNode | null>(null);

  // create form
  const [form, setForm] = useState({
    name: "",
    endpoint_url: "",
    region: "",
    cache_size_gb: "",
  });

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["edge-nodes", statusFilter === "__all__" ? undefined : statusFilter],
    queryFn: () =>
      replicationApi.listEdgeNodes({
        per_page: 100,
        status: statusFilter === "__all__" ? undefined : statusFilter,
      }),
  });

  const { data: peers = [], isLoading: peersLoading } = useQuery({
    queryKey: ["edge-node-peers", detailNode?.id],
    queryFn: () => replicationApi.getEdgeNodePeers(detailNode!.id),
    enabled: !!detailNode,
  });

  const { data: assignedRepos = [] } = useQuery({
    queryKey: ["edge-node-repos", detailNode?.id],
    queryFn: () => replicationApi.getEdgeNodeRepos(detailNode!.id),
    enabled: !!detailNode,
  });

  const nodes = data?.items ?? [];
  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const totalCacheUsed = nodes.reduce((a, n) => a + n.cache_used_bytes, 0);
  const totalCacheSize = nodes.reduce((a, n) => a + n.cache_size_bytes, 0);

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      endpoint_url: string;
      region?: string;
      cache_size_bytes?: number;
    }) => {
      const response = await apiClient.post<EdgeNode>(
        "/api/v1/edge-nodes",
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-nodes"] });
      setCreateOpen(false);
      setForm({ name: "", endpoint_url: "", region: "", cache_size_gb: "" });
      toast.success("Edge node registered");
    },
    onError: () => toast.error("Failed to register edge node"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/edge-nodes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-nodes"] });
      setDeleteId(null);
      toast.success("Edge node unregistered");
    },
    onError: () => toast.error("Failed to unregister edge node"),
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/api/v1/edge-nodes/${id}/sync`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edge-nodes"] });
      toast.success("Sync triggered");
    },
    onError: () => toast.error("Failed to trigger sync"),
  });

  // -- columns --
  const columns: DataTableColumn<EdgeNode>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (n) => n.name,
      sortable: true,
      cell: (n) => (
        <button
          className="flex items-center gap-2 font-medium text-sm text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setDetailNode(n);
          }}
        >
          <Server className="size-3.5 text-muted-foreground" />
          {n.name}
        </button>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (n) => (
        <StatusBadge
          status={n.status}
          color={STATUS_COLORS[n.status] ?? "default"}
        />
      ),
    },
    {
      id: "region",
      header: "Region",
      accessor: (n) => n.region ?? "",
      cell: (n) => (
        <span className="text-sm text-muted-foreground">
          {n.region || "-"}
        </span>
      ),
    },
    {
      id: "endpoint",
      header: "Endpoint",
      accessor: (n) => n.endpoint_url,
      cell: (n) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[250px]">
          {n.endpoint_url}
        </span>
      ),
    },
    {
      id: "cache",
      header: "Cache Usage",
      cell: (n) => {
        const pct = cachePercent(n);
        return (
          <div className="flex items-center gap-2 min-w-[140px]">
            <Progress
              value={pct}
              className={`flex-1 h-1.5 ${pct > 90 ? "[&>[data-slot=progress-indicator]]:bg-red-500" : ""}`}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatBytes(n.cache_used_bytes)} / {formatBytes(n.cache_size_bytes)}
            </span>
          </div>
        );
      },
    },
    {
      id: "heartbeat",
      header: "Last Heartbeat",
      accessor: (n) => n.last_heartbeat_at ?? "",
      cell: (n) => (
        <span className="text-sm text-muted-foreground">
          {n.last_heartbeat_at
            ? new Date(n.last_heartbeat_at).toLocaleString()
            : "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (n) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => syncMutation.mutate(n.id)}
                disabled={n.status === "offline"}
              >
                <RefreshCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Trigger Sync</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteId(n.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unregister</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- peer columns --
  const peerColumns: DataTableColumn<EdgeNodePeer>[] = [
    {
      id: "target",
      header: "Peer Node",
      cell: (p) => {
        const target = nodes.find((n) => n.id === p.target_node_id);
        return (
          <span className="text-sm font-medium">
            {target?.name ?? p.target_node_id.slice(0, 8)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        <StatusBadge
          status={p.status}
          color={
            p.status === "connected"
              ? "green"
              : p.status === "disconnected"
                ? "red"
                : "default"
          }
        />
      ),
    },
    {
      id: "latency",
      header: "Latency",
      accessor: (p) => p.latency_ms,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">{p.latency_ms} ms</span>
      ),
    },
    {
      id: "bandwidth",
      header: "Bandwidth",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {formatBandwidth(p.bandwidth_estimate_bps)}
        </span>
      ),
    },
    {
      id: "transferred",
      header: "Transferred",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(p.bytes_transferred_total)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edge Nodes"
        description="Manage distributed edge nodes for artifact caching and replication."
        actions={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["edge-nodes"] })
                  }
                >
                  <RefreshCw
                    className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Register Node
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Nodes</p>
              <p className="text-2xl font-semibold">{nodes.length}</p>
            </div>
            <Server className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Online</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {onlineCount}
              </p>
            </div>
            <Wifi className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">Cache Used</p>
            <p className="text-2xl font-semibold">
              {formatBytes(totalCacheUsed)}
            </p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">Cache Capacity</p>
            <p className="text-2xl font-semibold">
              {formatBytes(totalCacheSize)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="syncing">Syncing</SelectItem>
            <SelectItem value="degraded">Degraded</SelectItem>
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
      {nodes.length === 0 && !isLoading ? (
        <EmptyState
          icon={Server}
          title="No edge nodes"
          description="Register an edge node to enable distributed caching and replication."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Register Node
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={nodes}
          loading={isLoading}
          rowKey={(n) => n.id}
          emptyMessage="No edge nodes found."
        />
      )}

      {/* -- Create Node Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o)
            setForm({ name: "", endpoint_url: "", region: "", cache_size_gb: "" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register Edge Node</DialogTitle>
            <DialogDescription>
              Add a new edge node to the cluster for replication.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: form.name,
                endpoint_url: form.endpoint_url,
                region: form.region || undefined,
                cache_size_bytes: form.cache_size_gb
                  ? Number(form.cache_size_gb) * 1024 * 1024 * 1024
                  : undefined,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="node-name">Name</Label>
              <Input
                id="node-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="edge-us-west-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-url">Endpoint URL</Label>
              <Input
                id="node-url"
                type="url"
                value={form.endpoint_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endpoint_url: e.target.value }))
                }
                placeholder="https://edge.example.com:8080"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-region">
                Region{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="node-region"
                value={form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
                }
                placeholder="us-west-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-cache">
                Cache Size (GB){" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="node-cache"
                type="number"
                min={1}
                max={10240}
                value={form.cache_size_gb}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cache_size_gb: e.target.value }))
                }
                placeholder="100"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Registering..." : "Register"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Node Detail Sheet -- */}
      <Sheet
        open={!!detailNode}
        onOpenChange={(o) => {
          if (!o) setDetailNode(null);
        }}
      >
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailNode?.name ?? "Node Details"}</SheetTitle>
            <SheetDescription>
              Peer connections and assigned repositories.
            </SheetDescription>
          </SheetHeader>
          {detailNode && (
            <div className="p-4 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge
                    status={detailNode.status}
                    color={STATUS_COLORS[detailNode.status] ?? "default"}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Region</p>
                  <p className="text-sm font-medium">
                    {detailNode.region || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Endpoint</p>
                  <p className="text-sm font-medium truncate">
                    {detailNode.endpoint_url}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cache</p>
                  <p className="text-sm font-medium">
                    {formatBytes(detailNode.cache_used_bytes)} /{" "}
                    {formatBytes(detailNode.cache_size_bytes)}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">
                  Peer Connections
                </h3>
                <DataTable
                  columns={peerColumns}
                  data={peers}
                  loading={peersLoading}
                  rowKey={(p) => p.id}
                  emptyMessage="No peers connected."
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">
                  Assigned Repositories ({assignedRepos.length})
                </h3>
                {assignedRepos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No repositories assigned.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedRepos.map((repoId) => (
                      <Badge key={repoId} variant="secondary" className="text-xs">
                        {repoId.length > 12
                          ? repoId.slice(0, 12) + "..."
                          : repoId}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* -- Delete Confirm -- */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Unregister Edge Node"
        description="This will permanently remove this edge node from the cluster. Cached artifacts will no longer be served from this node."
        confirmText="Unregister"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
      />
    </div>
  );
}
