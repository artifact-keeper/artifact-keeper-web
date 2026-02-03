"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  BellOff,
  Loader2,
  Wifi,
  WifiOff,
  Clock,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import monitoringApi from "@/lib/api/monitoring";
import type { AlertState } from "@/types/monitoring";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const STATUS_ICON: Record<string, React.ReactNode> = {
  healthy: <CheckCircle2 className="size-5 text-green-500" />,
  unhealthy: <XCircle className="size-5 text-red-500" />,
  degraded: <AlertTriangle className="size-5 text-amber-500" />,
  unavailable: <WifiOff className="size-5 text-muted-foreground" />,
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function MonitoringPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState<string>("__all__");
  const [suppressTarget, setSuppressTarget] = useState<AlertState | null>(null);
  const [suppressHours, setSuppressHours] = useState("1");

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["monitoring-alerts"],
    queryFn: () => monitoringApi.getAlerts(),
    enabled: !!user?.is_admin,
    refetchInterval: 30000,
  });

  const { data: healthLog, isLoading: logLoading } = useQuery({
    queryKey: ["monitoring-log", serviceFilter],
    queryFn: () =>
      monitoringApi.getHealthLog({
        service: serviceFilter === "__all__" ? undefined : serviceFilter,
        limit: 100,
      }),
    enabled: !!user?.is_admin,
    refetchInterval: 30000,
  });

  const checkMutation = useMutation({
    mutationFn: () => monitoringApi.triggerCheck(),
    onSuccess: () => {
      toast.success("Health check completed");
      queryClient.invalidateQueries({ queryKey: ["monitoring-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["monitoring-log"] });
    },
    onError: () => toast.error("Health check failed"),
  });

  const suppressMutation = useMutation({
    mutationFn: (req: { service_name: string; until: string }) =>
      monitoringApi.suppressAlert(req),
    onSuccess: () => {
      toast.success("Alert suppressed");
      queryClient.invalidateQueries({ queryKey: ["monitoring-alerts"] });
      setSuppressTarget(null);
    },
    onError: () => toast.error("Failed to suppress alert"),
  });

  function handleSuppress() {
    if (!suppressTarget) return;
    const hours = parseInt(suppressHours, 10) || 1;
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    suppressMutation.mutate({
      service_name: suppressTarget.service_name,
      until,
    });
  }

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Monitoring" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  const healthyCount =
    alerts?.filter((a) => a.current_status === "healthy").length ?? 0;
  const unhealthyCount =
    alerts?.filter((a) => a.current_status !== "healthy").length ?? 0;
  const suppressedCount =
    alerts?.filter(
      (a) => a.suppressed_until && new Date(a.suppressed_until) > new Date()
    ).length ?? 0;

  // Get unique service names for filter
  const serviceNames = [
    ...new Set([
      ...(alerts?.map((a) => a.service_name) ?? []),
      ...(healthLog?.map((e) => e.service_name) ?? []),
    ]),
  ].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Monitoring"
        description="Real-time health monitoring for all infrastructure services."
        actions={
          <Button
            size="sm"
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
          >
            {checkMutation.isPending ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="size-4 mr-1.5" />
            )}
            Run Health Check
          </Button>
        }
      />

      {/* Alert State Cards */}
      {alertsLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : alerts?.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {alerts.map((alert) => {
              const isSuppressed =
                alert.suppressed_until &&
                new Date(alert.suppressed_until) > new Date();

              return (
                <Card
                  key={alert.service_name}
                  className={
                    alert.current_status !== "healthy" && !isSuppressed
                      ? "border-destructive/50"
                      : ""
                  }
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      {STATUS_ICON[alert.current_status] ?? (
                        <Activity className="size-5 text-muted-foreground" />
                      )}
                      <div>
                        <div className="font-medium text-sm">
                          {alert.service_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isSuppressed ? (
                            <span className="flex items-center gap-1">
                              <BellOff className="size-3" />
                              Suppressed
                            </span>
                          ) : alert.consecutive_failures > 0 ? (
                            `${alert.consecutive_failures} failures`
                          ) : (
                            "OK"
                          )}
                        </div>
                      </div>
                    </div>
                    {alert.current_status !== "healthy" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSuppressTarget(alert)}
                        title="Suppress alerts"
                      >
                        <BellOff className="size-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Summary badges */}
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <Wifi className="size-3" />
              {healthyCount} healthy
            </Badge>
            {unhealthyCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="size-3" />
                {unhealthyCount} unhealthy
              </Badge>
            )}
            {suppressedCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <BellOff className="size-3" />
                {suppressedCount} suppressed
              </Badge>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Activity}
          title="No alert data"
          description="Run a health check to start monitoring services."
          action={
            <Button size="sm" onClick={() => checkMutation.mutate()}>
              <RefreshCw className="size-4 mr-1.5" />
              Run Health Check
            </Button>
          }
        />
      )}

      {/* Health Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Health Log</CardTitle>
              <CardDescription>
                Recent health check results across all services.
              </CardDescription>
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Services</SelectItem>
                {serviceNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {logLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !healthLog?.length ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon={Clock}
                title="No health log entries"
                description="Health checks are recorded every 60 seconds."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">
                    Response Time
                  </TableHead>
                  <TableHead>Checked At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {healthLog.map((entry, i) => (
                  <TableRow key={`${entry.service_name}-${i}`}>
                    <TableCell className="font-medium">
                      {entry.service_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICON[entry.status] ?? null}
                        <span className="text-sm">{entry.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {entry.previous_status ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.message ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {entry.response_time_ms != null
                        ? `${entry.response_time_ms}ms`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatTime(entry.checked_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Suppress Dialog */}
      <Dialog
        open={!!suppressTarget}
        onOpenChange={(open) => !open && setSuppressTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress Alerts</DialogTitle>
            <DialogDescription>
              Suppress alerts for <strong>{suppressTarget?.service_name}</strong>{" "}
              to prevent notification spam during maintenance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Suppress for (hours)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={suppressHours}
              onChange={(e) => setSuppressHours(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuppressTarget(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSuppress}
              disabled={suppressMutation.isPending}
            >
              {suppressMutation.isPending && (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              )}
              Suppress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
