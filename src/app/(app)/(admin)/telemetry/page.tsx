"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Radio,
  Send,
  Trash2,
  Shield,
  AlertTriangle,
  Bug,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { telemetryApi } from "@/lib/api/telemetry";
import { mutationErrorToast } from "@/lib/error-utils";
import type { CrashReport, TelemetrySettings } from "@/types/telemetry";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";
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

function timeAgo(dateStr: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return t("lessThanHourAgo");
  if (hours < 24) return t("hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { days });
}

export default function TelemetryPage() {
  const t = useTranslations("adminTelemetry");
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
      toast.success(t("settingsUpdated"));
      queryClient.invalidateQueries({ queryKey: ["telemetry-settings"] });
    },
    onError: mutationErrorToast(t("settingsUpdateFailed")),
  });

  const submitMutation = useMutation({
    mutationFn: (ids: string[]) => telemetryApi.submitCrashes(ids),
    onSuccess: (result) => {
      toast.success(t("crashesSubmitted", { count: result.marked_submitted }));
      queryClient.invalidateQueries({ queryKey: ["telemetry-crashes"] });
      queryClient.invalidateQueries({ queryKey: ["telemetry-pending"] });
    },
    onError: mutationErrorToast(t("submitFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => telemetryApi.deleteCrash(id),
    onSuccess: () => {
      toast.success(t("deleted"));
      queryClient.invalidateQueries({ queryKey: ["telemetry-crashes"] });
      queryClient.invalidateQueries({ queryKey: ["telemetry-pending"] });
      setDeleteTarget(null);
    },
    onError: mutationErrorToast(t("deleteFailed")),
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
        <PageHeader title={t("accessTitle")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
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
        title={t("title")}
        description={t("description")}
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
            {t("refresh")}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Radio}
          label={t("statTelemetry")}
          value={settings?.enabled ? t("enabled") : t("disabled")}
          color={settings?.enabled ? "green" : "default"}
        />
        <StatCard
          icon={Bug}
          label={t("statTotalCrashes")}
          value={totalCrashes}
          color={totalCrashes > 0 ? "red" : "green"}
        />
        <StatCard
          icon={Send}
          label={t("statPending")}
          value={pendingCount}
          color={pendingCount > 0 ? "yellow" : "green"}
        />
        <StatCard
          icon={Shield}
          label={t("statScrubLevel")}
          value={settings?.scrub_level ?? "..."}
          color="blue"
        />
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settingsTitle")}</CardTitle>
          <CardDescription>
            {t("settingsDescription")}
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
                  <Label htmlFor="telemetry-enabled" className="text-sm font-medium">
                    {t("enableTelemetry")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("enableTelemetryHint")}
                  </p>
                </div>
                <Switch
                  id="telemetry-enabled"
                  checked={settings.enabled}
                  onCheckedChange={(v) => handleToggle("enabled", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="telemetry-review-before-send" className="text-sm font-medium">
                    {t("reviewBeforeSend")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("reviewBeforeSendHint")}
                  </p>
                </div>
                <Switch
                  id="telemetry-review-before-send"
                  checked={settings.review_before_send}
                  onCheckedChange={(v) =>
                    handleToggle("review_before_send", v)
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="telemetry-include-logs" className="text-sm font-medium">{t("includeLogs")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("includeLogsHint")}
                  </p>
                </div>
                <Switch
                  id="telemetry-include-logs"
                  checked={settings.include_logs}
                  onCheckedChange={(v) => handleToggle("include_logs", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">
                    {t("scrubLevel")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("scrubLevelHint")}
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
                    <SelectItem value="minimal">{t("scrubMinimal")}</SelectItem>
                    <SelectItem value="standard">{t("scrubStandard")}</SelectItem>
                    <SelectItem value="aggressive">{t("scrubAggressive")}</SelectItem>
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
            {t("pendingCount", { count: pendingCount })}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {t("pendingHint")}
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
              {t("submitAll")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Crash Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("crashTitle")}</CardTitle>
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
                title={t("noCrashesTitle")}
                description={t("noCrashesDescription")}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colError")}</TableHead>
                  <TableHead>{t("colComponent")}</TableHead>
                  <TableHead>{t("colSeverity")}</TableHead>
                  <TableHead className="text-right">{t("colCount")}</TableHead>
                  <TableHead>{t("colLastSeen")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
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
                      {timeAgo(crash.last_seen_at, t)}
                    </TableCell>
                    <TableCell>
                      {crash.submitted ? (
                        <Badge variant="secondary">{t("submitted")}</Badge>
                      ) : (
                        <Badge>{t("pending")}</Badge>
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
                            aria-label={t("submitAria", { error: crash.error_type })}
                          >
                            <Send className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(crash)}
                          aria-label={t("deleteAria", { error: crash.error_type })}
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
          <ListTruncationNotice
            className="px-6 pb-4"
            shown={crashItems.length}
            total={crashes?.total ?? 0}
          />
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
                  <span className="text-muted-foreground">{t("detailComponent")}:</span>{" "}
                  {detailCrash.component}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("detailSeverity")}:</span>{" "}
                  <span className={SEVERITY_COLORS[detailCrash.severity] ?? ""}>
                    {detailCrash.severity}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("detailVersion")}:</span>{" "}
                  {detailCrash.app_version}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("detailOccurrences")}:</span>{" "}
                  {detailCrash.occurrence_count}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("detailFirstSeen")}:</span>{" "}
                  {new Date(detailCrash.first_seen_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("detailLastSeen")}:</span>{" "}
                  {new Date(detailCrash.last_seen_at).toLocaleString()}
                </div>
                {detailCrash.os_info && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t("detailOs")}:</span>{" "}
                    {detailCrash.os_info}
                  </div>
                )}
              </div>
              {detailCrash.stack_trace && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t("stackTrace")}
                  </Label>
                  <pre className="mt-1 rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                    {detailCrash.stack_trace}
                  </pre>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t("signature")}
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
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
