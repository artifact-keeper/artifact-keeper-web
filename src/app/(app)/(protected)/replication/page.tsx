"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  RefreshCcw,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

import { replicationApi } from "@/lib/api/replication";
import type { EdgeNode, EdgeNodePeer } from "@/lib/api/replication";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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

function formatBandwidth(bps: number): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${parseFloat((bps / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
  connected: "green",
  disconnected: "red",
};

// -- page --

export default function ReplicationPage() {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string>("__none__");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["replication", "edge-nodes"],
    queryFn: () => replicationApi.listEdgeNodes({ per_page: 100 }),
  });

  const nodes = data?.items ?? [];
  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const syncingCount = nodes.filter((n) => n.status === "syncing").length;
  const degradedCount = nodes.filter((n) => n.status === "degraded").length;
  const totalCacheUsed = nodes.reduce((a, n) => a + n.cache_used_bytes, 0);
  const totalCacheSize = nodes.reduce((a, n) => a + n.cache_size_bytes, 0);

  const { data: peers = [], isLoading: peersLoading } = useQuery({
    queryKey: ["replication", "peers", selectedNodeId],
    queryFn: () => replicationApi.getEdgeNodePeers(selectedNodeId),
    enabled: selectedNodeId !== "__none__",
  });

  const { data: assignedRepos = [] } = useQuery({
    queryKey: ["replication", "repos", selectedNodeId],
    queryFn: () => replicationApi.getEdgeNodeRepos(selectedNodeId),
    enabled: selectedNodeId !== "__none__",
  });

  const assignMutation = useMutation({
    mutationFn: ({
      nodeId,
      repoId,
      priority,
    }: {
      nodeId: string;
      repoId: string;
      priority: number;
    }) => replicationApi.assignRepoToEdge(nodeId, { repository_id: repoId, priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["replication", "repos", selectedNodeId],
      });
      toast.success("Replication priority updated");
    },
    onError: () => toast.error("Failed to update replication priority"),
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n.name]));

  // -- peer columns --
  const peerColumns: DataTableColumn<EdgeNodePeer>[] = [
    {
      id: "source",
      header: "Source",
      cell: () => (
        <span className="text-sm font-medium">
          {selectedNodeId !== "__none__"
            ? nodeMap.get(selectedNodeId) ?? "Unknown"
            : "-"}
        </span>
      ),
    },
    {
      id: "target",
      header: "Target",
      cell: (p) => (
        <span className="text-sm font-medium">
          {nodeMap.get(p.target_node_id) ?? p.target_node_id.slice(0, 8)}
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
      id: "latency",
      header: "Latency",
      accessor: (p) => p.latency_ms,
      sortable: true,
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
      id: "shared",
      header: "Shared Artifacts",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.shared_artifacts_count}
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
    {
      id: "success_rate",
      header: "Success / Failure",
      cell: (p) => {
        const total = p.transfer_success_count + p.transfer_failure_count;
        if (total === 0)
          return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs"
            >
              {p.transfer_success_count}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-xs ${p.transfer_failure_count > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : ""}`}
            >
              {p.transfer_failure_count}
            </Badge>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replication Dashboard"
        description="Monitor edge node replication status and topology."
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["replication"],
                  })
                }
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
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
            <p className="text-sm text-muted-foreground">Syncing / Degraded</p>
            <p className="text-2xl font-semibold">
              <span className={syncingCount > 0 ? "text-blue-600" : ""}>
                {syncingCount}
              </span>{" "}
              / {degradedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">Cache Usage</p>
            <p className="text-2xl font-semibold">
              {totalCacheSize > 0
                ? `${formatBytes(totalCacheUsed)} / ${formatBytes(totalCacheSize)}`
                : "N/A"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="topology">Topology</TabsTrigger>
        </TabsList>

        {/* -- Overview Tab -- */}
        <TabsContent value="overview" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-40" />
                </Card>
              ))}
            </div>
          ) : nodes.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No edge nodes"
              description="Register edge nodes from the Edge Nodes page to see them here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {nodes.map((node) => {
                const pct = cachePercent(node);
                return (
                  <Card key={node.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{node.name}</CardTitle>
                        <StatusBadge
                          status={node.status}
                          color={STATUS_COLORS[node.status] ?? "default"}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {node.region && (
                        <p className="text-xs text-muted-foreground">
                          Region: {node.region}
                        </p>
                      )}
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Cache Usage</span>
                          <span>
                            {formatBytes(node.cache_used_bytes)} /{" "}
                            {formatBytes(node.cache_size_bytes)}
                          </span>
                        </div>
                        <Progress
                          value={pct}
                          className={`h-1.5 ${pct > 90 ? "[&>[data-slot=progress-indicator]]:bg-red-500" : ""}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">
                            Last Sync
                          </p>
                          <p>
                            {node.last_sync_at
                              ? new Date(node.last_sync_at).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            Heartbeat
                          </p>
                          <p>
                            {node.last_heartbeat_at
                              ? new Date(
                                  node.last_heartbeat_at
                                ).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* -- Topology Tab -- */}
        <TabsContent value="topology" className="mt-6 space-y-4">
          <div>
            <Select
              value={selectedNodeId}
              onValueChange={setSelectedNodeId}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select an edge node to view peers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  Select a node...
                </SelectItem>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name} ({node.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedNodeId === "__none__" ? (
            <EmptyState
              icon={Globe}
              title="Select a node"
              description="Choose an edge node above to view its peer connections."
            />
          ) : (
            <DataTable
              columns={peerColumns}
              data={peers}
              loading={peersLoading}
              rowKey={(p) => p.id}
              emptyMessage="No peers found for this node."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
