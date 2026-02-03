"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Radio,
  Send,
  Trash2,
  Shield,
  AlertTriangle,
  Bug,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import telemetryApi from "@/lib/api/telemetry";
import type { CrashReport, TelemetrySettings } from "@/types/telemetry";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-600",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TelemetryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [detailCrash, setDetailCrash] = useState<CrashReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrashReport | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["telemetry-settings"],
    queryFn: () => telemetryApi.getSettings(),
    enabled: !!user?.is_admin,
  });

  const { data: crashes, isLoading: crashesLoading } = useQuery({
    queryKey: ["telemetry-crashes"],
    queryFn: () => telemetryApi.listCrashes({ per_page: 100 }),
    enabled: !!user?.is_admin,
  });

  const { data: pending } = useQuery({
    queryKey: ["telemetry-pending"],
    queryFn: () => telemetryApi.listPending(),
    enabled: !!user?.is_admin,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (s: TelemetrySettings) => telemetryApi.updateSettings(s),
    onSuccess: () => {
      toast.success("Settings updated");
      queryClient.invalidateQueries({ queryKey: ["telemetry-settings"] });
    },
    onError: () => toast.error("Failed to update settings"),
  });

  const submitMutation = useMutation({
    mutationFn: (ids: string[]) => telemetryApi.submitCrashes(ids),
    onSuccess: (result) => {
      toast.success(`${result.marked_submitted} crash report(s) submitted`);
      queryClient.invalidateQueries({ queryKey: ["telemetry-crashes"] });
      queryClient.invalidateQueries({ queryKey: ["telemetry-pending"] });
    },
    onError: () => toast.error("Failed to submit crash reports"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => telemetryApi.deleteCrash(id),
    onSuccess: () => {
      toast.success("Crash report deleted");
      queryClient.invalidateQueries({ queryKey: ["telemetry-crashes"] });
      queryClient.invalidateQueries({ queryKey: ["telemetry-pending"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete crash report"),
  });

  function handleToggle(field: keyof TelemetrySettings, value: boolean) {
    if (!settings) return;
    updateSettingsMutation.mutate({ ...settings, [field]: value });
  }

  function handleScrubLevel(level: string) {
    if (!settings) return;
    updateSettingsMutation.mutate({ ...settings, scrub_level: level });
  }

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Telemetry" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  const pendingCount = pending?.length ?? 0;
  const totalCrashes = crashes?.total ?? 0;
  const crashItems = crashes?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telemetry & Crash Reporting"
        description="Opt-in crash reporting with privacy-first PII scrubbing."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["telemetry-crashes"] });
              queryClient.invalidateQueries({ queryKey: ["telemetry-pending"] });
            }}
          >
            <RefreshCw className="size-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Radio}
          label="Telemetry"
          value={settings?.enabled ? "Enabled" : "Disabled"}
          color={settings?.enabled ? "green" : "default"}
        />
        <StatCard
          icon={Bug}
          label="Total Crashes"
          value={totalCrashes}
          color={totalCrashes > 0 ? "red" : "green"}
        />
        <StatCard
          icon={Send}
          label="Pending Submit"
          value={pendingCount}
          color={pendingCount > 0 ? "yellow" : "green"}
        />
        <StatCard
          icon={Shield}
          label="Scrub Level"
          value={settings?.scrub_level ?? "..."}
          color="blue"
        />
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telemetry Settings</CardTitle>
          <CardDescription>
            Control what data is collected and how it is handled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : settings ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Enable Telemetry
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Collect and report crash data to improve the system.
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => handleToggle("enabled", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    Review Before Send
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Queue reports for admin approval before submission.
                  </p>
                </div>
                <Switch
                  checked={settings.review_before_send}
                  onCheckedChange={(v) =>
                    handleToggle("review_before_send", v)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Include Logs</Label>
                  <p className="text-xs text-muted-foreground">
                    Attach recent log lines to crash reports.
                  </p>
                </div>
                <Switch
                  checked={settings.include_logs}
                  onCheckedChange={(v) => handleToggle("include_logs", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    PII Scrub Level
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    How aggressively to strip personal data from reports.
                  </p>
                </div>
                <Select
                  value={settings.scrub_level}
                  onValueChange={handleScrubLevel}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Pending Submit Banner */}
      {pendingCount > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {pendingCount} pending crash report{pendingCount > 1 ? "s" : ""}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              Review and submit these reports to help improve the system.
            </span>
            <Button
              size="sm"
              onClick={() =>
                submitMutation.mutate(pending!.map((c) => c.id))
              }
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="size-4 mr-1.5" />
              )}
              Submit All
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Crash Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crash Reports</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {crashesLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !crashItems.length ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon={Bug}
                title="No crash reports"
                description="No crashes have been recorded. That's good news."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crashItems.map((crash) => (
                  <TableRow key={crash.id}>
                    <TableCell>
                      <button
                        className="text-left hover:underline"
                        onClick={() => setDetailCrash(crash)}
                      >
                        <div className="font-medium text-sm truncate max-w-[250px]">
                          {crash.error_type}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                          {crash.error_message}
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{crash.component}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-medium text-sm ${SEVERITY_COLORS[crash.severity] ?? ""}`}
                      >
                        {crash.severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {crash.occurrence_count}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(crash.last_seen_at)}
                    </TableCell>
                    <TableCell>
                      {crash.submitted ? (
                        <Badge variant="secondary">Submitted</Badge>
                      ) : (
                        <Badge>Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!crash.submitted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              submitMutation.mutate([crash.id])
                            }
                            title="Submit"
                          >
                            <Send className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(crash)}
                          title="Delete"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Crash Detail Dialog */}
      <Dialog
        open={!!detailCrash}
        onOpenChange={(open) => !open && setDetailCrash(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailCrash?.error_type}</DialogTitle>
            <DialogDescription>{detailCrash?.error_message}</DialogDescription>
          </DialogHeader>
          {detailCrash && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Component:</span>{" "}
                  {detailCrash.component}
                </div>
                <div>
                  <span className="text-muted-foreground">Severity:</span>{" "}
                  <span className={SEVERITY_COLORS[detailCrash.severity] ?? ""}>
                    {detailCrash.severity}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Version:</span>{" "}
                  {detailCrash.app_version}
                </div>
                <div>
                  <span className="text-muted-foreground">Occurrences:</span>{" "}
                  {detailCrash.occurrence_count}
                </div>
                <div>
                  <span className="text-muted-foreground">First seen:</span>{" "}
                  {new Date(detailCrash.first_seen_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Last seen:</span>{" "}
                  {new Date(detailCrash.last_seen_at).toLocaleString()}
                </div>
                {detailCrash.os_info && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">OS:</span>{" "}
                    {detailCrash.os_info}
                  </div>
                )}
              </div>
              {detailCrash.stack_trace && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Stack Trace
                  </Label>
                  <pre className="mt-1 rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                    {detailCrash.stack_trace}
                  </pre>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Signature
                </Label>
                <code className="block mt-1 text-xs font-mono text-muted-foreground break-all">
                  {detailCrash.error_signature}
                </code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Crash Report"
        description="This will permanently delete this crash report."
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
