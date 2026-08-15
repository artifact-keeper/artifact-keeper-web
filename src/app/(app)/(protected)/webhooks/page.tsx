"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Zap,
  History,
  Play,
  Pause,
  Send,
  RotateCcw,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { webhooksApi } from "@/lib/api/webhooks";
import { mutationErrorToast } from "@/lib/error-utils";
import type {
  Webhook as WebhookType,
  WebhookDelivery,
  WebhookEvent,
  CreateWebhookRequest,
} from "@/lib/api/webhooks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

// -- constants --

const WEBHOOK_EVENTS: { value: WebhookEvent; labelKey: string }[] = [
  { value: "artifact_uploaded", labelKey: "event_artifact_uploaded" },
  { value: "artifact_deleted", labelKey: "event_artifact_deleted" },
  { value: "repository_created", labelKey: "event_repository_created" },
  { value: "repository_deleted", labelKey: "event_repository_deleted" },
  { value: "user_created", labelKey: "event_user_created" },
  { value: "user_deleted", labelKey: "event_user_deleted" },
  { value: "build_started", labelKey: "event_build_started" },
  { value: "build_completed", labelKey: "event_build_completed" },
  { value: "build_failed", labelKey: "event_build_failed" },
  { value: "age_gate_queued", labelKey: "event_age_gate_queued" },
  { value: "age_gate_approved", labelKey: "event_age_gate_approved" },
  { value: "age_gate_rejected", labelKey: "event_age_gate_rejected" },
];

function eventColor(event: string): "green" | "red" | "blue" | "default" {
  if (
    event.includes("deleted") ||
    event.includes("failed") ||
    event.includes("rejected")
  )
    return "red";
  if (
    event.includes("created") ||
    event.includes("uploaded") ||
    event.includes("completed") ||
    event.includes("approved")
  )
    return "green";
  if (event.includes("started")) return "blue";
  return "default";
}

const EVENT_BADGE_CLASSES: Record<string, string> = {
  green:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  default: "bg-secondary text-secondary-foreground",
};

// -- page --

export default function WebhooksPage() {
  const t = useTranslations("app/protected/webhooks");
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deliveryWebhook, setDeliveryWebhook] = useState<WebhookType | null>(
    null
  );

  // create form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([]);
  const [formSecret, setFormSecret] = useState("");

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => webhooksApi.list({ per_page: 100 }),
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
    queryKey: ["webhook-deliveries", deliveryWebhook?.id],
    queryFn: () =>
      webhooksApi.listDeliveries(deliveryWebhook!.id, { per_page: 50 }),
    enabled: !!deliveryWebhook,
  });

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (values: CreateWebhookRequest) => webhooksApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setCreateOpen(false);
      resetForm();
      toast.success(t("created"));
    },
    onError: mutationErrorToast(t("createdError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setDeleteId(null);
      toast.success(t("deleted"));
    },
    onError: mutationErrorToast(t("deletedError")),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success(t("enabled"));
    },
    onError: mutationErrorToast(t("enabledError")),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success(t("disabled"));
    },
    onError: mutationErrorToast(t("disabledError")),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t("testSucceeded", { status: result.status_code ?? 0 }));
      } else {
        toast.warning(
          t("testFailed", {
            error:
              result.error ||
              t("testHttpStatus", { status: result.status_code ?? 0 }),
          })
        );
      }
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: mutationErrorToast(t("testSendError")),
  });

  const redeliverMutation = useMutation({
    mutationFn: ({
      webhookId,
      deliveryId,
    }: {
      webhookId: string;
      deliveryId: string;
    }) => webhooksApi.redeliver(webhookId, deliveryId),
    onSuccess: () => {
      toast.success(t("redeliverySent"));
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: mutationErrorToast(t("redeliveryError")),
  });

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormEvents([]);
    setFormSecret("");
  };

  const toggleEvent = (event: WebhookEvent) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const webhooks = data?.items ?? [];
  const enabledCount = webhooks.filter((w) => w.is_enabled).length;

  // -- columns --
  const columns: DataTableColumn<WebhookType>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (w) => w.name,
      sortable: true,
      cell: (w) => (
        <div className="flex items-center gap-2">
          <Send className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{w.name}</span>
          {!w.is_enabled && (
            <Badge variant="secondary" className="text-xs">
              {t("disabledLabel")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "url",
      header: "URL",
      accessor: (w) => w.url,
      cell: (w) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {w.url}
        </span>
      ),
    },
    {
      id: "events",
      header: t("colEvents"),
      cell: (w) => (
        <div className="flex flex-wrap gap-1">
          {w.events.map((e) => (
            <span
              key={e}
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${EVENT_BADGE_CLASSES[eventColor(e)]}`}
            >
              {t(`event_${e}`)}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: (w) => (
        <StatusBadge
          status={w.is_enabled ? t("activeLabel") : t("disabledLabel")}
          color={w.is_enabled ? "green" : "default"}
        />
      ),
    },
    {
      id: "last_triggered",
      header: t("colLastTriggered"),
      accessor: (w) => w.last_triggered_at ?? "",
      cell: (w) => (
        <span className="text-sm text-muted-foreground">
          {w.last_triggered_at
            ? new Date(w.last_triggered_at).toLocaleString()
            : t("never")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (w) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setDeliveryWebhook(w)}
              >
                <History className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("viewDeliveries")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => testMutation.mutate(w.id)}
              >
                <Zap className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("sendTest")}</TooltipContent>
          </Tooltip>
          {w.is_enabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => disableMutation.mutate(w.id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("disable")}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => enableMutation.mutate(w.id)}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("enable")}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteId(w.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("delete")}</TooltipContent>
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
                    queryClient.invalidateQueries({ queryKey: ["webhooks"] })
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
              {t("createWebhook")}
            </Button>
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statTotal")}</p>
              <p className="text-2xl font-semibold">{webhooks.length}</p>
            </div>
            <Send className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statActive")}</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {enabledCount}
              </p>
            </div>
            <Play className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("statDisabled")}</p>
              <p className="text-2xl font-semibold">
                {webhooks.length - enabledCount}
              </p>
            </div>
            <Pause className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {webhooks.length === 0 && !isLoading ? (
        <EmptyState
          icon={Webhook}
          title={t("noWebhooks")}
          description={t("noWebhooksDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("createWebhook")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={webhooks}
          loading={isLoading}
          rowKey={(w) => w.id}
          emptyMessage={t("noWebhooksFound")}
        />
      )}
      <ListTruncationNotice
        shown={webhooks.length}
        total={data?.total ?? 0}
      />

      {/* -- Create Webhook Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (formEvents.length === 0) {
                toast.error(t("selectAtLeastOneEvent"));
                return;
              }
              createMutation.mutate({
                name: formName,
                url: formUrl,
                events: formEvents,
                secret: formSecret || undefined,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="wh-name">{t("name")}</Label>
              <Input
                id="wh-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("namePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">{t("payloadUrl")}</Label>
              <Input
                id="wh-url"
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder={t("payloadUrlPlaceholder")}
                required
              />
            </div>
            <div className="space-y-3">
              <Label>{t("events")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={formEvents.includes(ev.value)}
                      onCheckedChange={() => toggleEvent(ev.value)}
                    />
                    {t(ev.labelKey)}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-secret">
                {t("secret")}{" "}
                <span className="text-muted-foreground font-normal">
                  ({t("optional")})
                </span>
              </Label>
              <Input
                id="wh-secret"
                type="password"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
                placeholder={t("secretPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("creating") : t("createWebhook")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delivery History Sheet -- */}
      <Sheet
        open={!!deliveryWebhook}
        onOpenChange={(o) => {
          if (!o) setDeliveryWebhook(null);
        }}
      >
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {t("deliveriesTitle", { name: deliveryWebhook?.name ?? "" })}
            </SheetTitle>
            <SheetDescription>
              {t("deliveriesDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-3">
            {deliveriesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (deliveries?.items ?? []).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                {t("noDeliveries")}
              </p>
            ) : (
              (deliveries?.items ?? []).map((d: WebhookDelivery) => (
                <div
                  key={d.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${EVENT_BADGE_CLASSES[eventColor(d.event)]}`}
                    >
                      {t(`event_${d.event}`)}
                    </span>
                    <StatusBadge
                      status={
                        d.success
                          ? `HTTP ${d.response_status}`
                          : d.response_status
                            ? `HTTP ${d.response_status}`
                            : t("failed")
                      }
                      color={d.success ? "green" : "red"}
                    />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t("attempts", { count: d.attempts })}
                    </span>
                    {!d.success && deliveryWebhook && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6"
                        onClick={() =>
                          redeliverMutation.mutate({
                            webhookId: deliveryWebhook.id,
                            deliveryId: d.id,
                          })
                        }
                        disabled={redeliverMutation.isPending}
                      >
                        <RotateCcw className="size-3 mr-1" />
                        {t("redeliver")}
                      </Button>
                    )}
                  </div>
                  {d.response_body && (
                    <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-hidden text-ellipsis whitespace-pre-wrap max-h-20">
                      {d.response_body}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* -- Delete Confirm -- */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        confirmText={t("delete")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
      />
    </div>
  );
}
