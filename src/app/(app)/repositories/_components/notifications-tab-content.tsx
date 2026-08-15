"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Bell,
  Plus,
  Trash2,
  TestTube,
  Power,
  PowerOff,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { webhooksApi } from "@/lib/api/webhooks";
import type {
  Webhook,
  WebhookEvent,
  CreateWebhookRequest,
} from "@/lib/api/webhooks";
import { toUserMessage, mutationErrorToast } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS: {
  value: WebhookEvent;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: "artifact_uploaded",
    labelKey: "evtArtifactUploaded",
    descriptionKey: "evtArtifactUploadedDesc",
  },
  {
    value: "artifact_deleted",
    labelKey: "evtArtifactDeleted",
    descriptionKey: "evtArtifactDeletedDesc",
  },
  {
    value: "build_started",
    labelKey: "evtBuildStarted",
    descriptionKey: "evtBuildStartedDesc",
  },
  {
    value: "build_completed",
    labelKey: "evtBuildCompleted",
    descriptionKey: "evtBuildCompletedDesc",
  },
  {
    value: "build_failed",
    labelKey: "evtBuildFailed",
    descriptionKey: "evtBuildFailedDesc",
  },
  {
    value: "repository_created",
    labelKey: "evtRepositoryCreated",
    descriptionKey: "evtRepositoryCreatedDesc",
  },
  {
    value: "repository_deleted",
    labelKey: "evtRepositoryDeleted",
    descriptionKey: "evtRepositoryDeletedDesc",
  },
  {
    value: "user_created",
    labelKey: "evtUserCreated",
    descriptionKey: "evtUserCreatedDesc",
  },
  {
    value: "user_deleted",
    labelKey: "evtUserDeleted",
    descriptionKey: "evtUserDeletedDesc",
  },
  {
    value: "age_gate_queued",
    labelKey: "evtAgeGateQueued",
    descriptionKey: "evtAgeGateQueuedDesc",
  },
  {
    value: "age_gate_approved",
    labelKey: "evtAgeGateApproved",
    descriptionKey: "evtAgeGateApprovedDesc",
  },
  {
    value: "age_gate_rejected",
    labelKey: "evtAgeGateRejected",
    descriptionKey: "evtAgeGateRejectedDesc",
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationsTabContentProps {
  repositoryId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsTabContent({ repositoryId }: NotificationsTabContentProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("app/repositories/_components/notifications-tab-content");
  const [createOpen, setCreateOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);
  const [actingWebhookId, setActingWebhookId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setUrlError(null);
  }, []);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const { data: webhooksData, isLoading } = useQuery({
    queryKey: ["webhooks", repositoryId],
    queryFn: () => webhooksApi.list({ repository_id: repositoryId }),
    enabled: !!repositoryId,
  });

  const webhooks = webhooksData?.items ?? [];

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhookRequest) => webhooksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setCreateOpen(false);
      resetForm();
      toast.success(t("webhookCreated"));
    },
    onError: mutationErrorToast(t("webhookCreateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setWebhookToDelete(null);
      setActingWebhookId(null);
      toast.success(t("webhookDeleted"));
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, t("webhookDeleteFailed")));
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setActingWebhookId(null);
      toast.success(t("webhookEnabled"));
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, t("webhookEnableFailed")));
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setActingWebhookId(null);
      toast.success(t("webhookDisabled"));
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, t("webhookDisableFailed")));
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (result) => {
      setActingWebhookId(null);
      if (result.success) {
        toast.success(t("testSucceeded", { code: result.status_code ?? 0 }));
      } else {
        toast.error(result.error ?? t("testFailed"));
      }
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, t("testSendFailed")));
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleToggleEvent = useCallback(
    (event: WebhookEvent, checked: boolean) => {
      setFormEvents((prev) =>
        checked ? [...prev, event] : prev.filter((e) => e !== event)
      );
    },
    []
  );

  const handleCreate = useCallback(() => {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      toast.error(t("validationError"));
      return;
    }
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      setUrlError(t("urlError"));
      return;
    }
    setUrlError(null);
    createMutation.mutate({
      name: formName.trim(),
      url: trimmedUrl,
      events: formEvents,
      secret: formSecret.trim() || undefined,
      repository_id: repositoryId,
    });
  }, [formName, formUrl, formSecret, formEvents, repositoryId, createMutation, t]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="notifications-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t("title")}</h3>
          {webhooks.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("configuredCount", { count: webhooks.length })}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="add-webhook-button"
        >
          <Plus className="size-4 mr-1" />
          {t("addWebhook")}
        </Button>
      </div>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => {
            const isActing = actingWebhookId === webhook.id;
            return (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                onDelete={(id) => setWebhookToDelete(id)}
                onEnable={(id) => {
                  setActingWebhookId(id);
                  enableMutation.mutate(id);
                }}
                onDisable={(id) => {
                  setActingWebhookId(id);
                  disableMutation.mutate(id);
                }}
                onTest={(id) => {
                  setActingWebhookId(id);
                  testMutation.mutate(id);
                }}
                isDeleting={isActing && deleteMutation.isPending}
                isTesting={isActing && testMutation.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">{t("nameLabel")}</Label>
              <Input
                id="webhook-name"
                placeholder={t("namePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">{t("urlLabel")}</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder={t("urlPlaceholder")}
                value={formUrl}
                onChange={(e) => {
                  setFormUrl(e.target.value);
                  setUrlError(null);
                }}
              />
              {urlError && (
                <p className="text-xs text-destructive" data-testid="url-error">
                  {urlError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-secret">
                {t("secretLabel")}{" "}
                <span className="text-muted-foreground font-normal">{t("optional")}</span>
              </Label>
              <Input
                id="webhook-secret"
                type="password"
                placeholder={t("secretPlaceholder")}
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>{t("eventsLabel")}</Label>
              <div className="grid gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label
                    key={event.value}
                    className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={formEvents.includes(event.value)}
                      onCheckedChange={(checked) =>
                        handleToggleEvent(event.value, checked === true)
                      }
                      aria-label={t(event.labelKey)}
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{t(event.labelKey)}</span>
                      <p className="text-xs text-muted-foreground">
                        {t(event.descriptionKey)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="create-webhook-submit"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                t("createWebhook")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Webhook Confirm */}
      <ConfirmDialog
        open={!!webhookToDelete}
        onOpenChange={(open) => {
          if (!open) setWebhookToDelete(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        confirmText={t("deleteConfirmText")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (webhookToDelete) {
            setActingWebhookId(webhookToDelete);
            deleteMutation.mutate(webhookToDelete);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebhookCard sub-component
// ---------------------------------------------------------------------------

interface WebhookCardProps {
  webhook: Webhook;
  onDelete: (id: string) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onTest: (id: string) => void;
  isDeleting: boolean;
  isTesting: boolean;
}

function WebhookCard({
  webhook,
  onDelete,
  onEnable,
  onDisable,
  onTest,
  isDeleting,
  isTesting,
}: WebhookCardProps) {
  const t = useTranslations("app/repositories/_components/notifications-tab-content");
  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-3"
      data-testid={`webhook-card-${webhook.id}`}
    >
      {/* Top row: name + status + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{webhook.name}</span>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${
              webhook.is_enabled
                ? "text-green-600 bg-green-100 dark:bg-green-950/40"
                : "text-muted-foreground"
            }`}
          >
            {webhook.is_enabled ? t("active") : t("inactive")}
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onTest(webhook.id)}
                disabled={isTesting}
                aria-label={t("testAria")}
              >
                {isTesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <TestTube className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("sendTest")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  webhook.is_enabled
                    ? onDisable(webhook.id)
                    : onEnable(webhook.id)
                }
                aria-label={webhook.is_enabled ? t("disableAria") : t("enableAria")}
              >
                {webhook.is_enabled ? (
                  <PowerOff className="size-3.5" />
                ) : (
                  <Power className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {webhook.is_enabled ? t("disable") : t("enable")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(webhook.id)}
                disabled={isDeleting}
                aria-label={t("deleteAria")}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("delete")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* URL */}
      <p className="text-xs text-muted-foreground font-mono truncate" title={webhook.url}>
        {webhook.url}
      </p>

      {/* Events + last triggered */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {webhook.events.map((event) => (
            <Badge key={event} variant="secondary" className="text-xs font-normal">
              {t(formatEventLabel(event))}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          {webhook.last_triggered_at ? (
            <>
              <CheckCircle2 className="size-3 text-green-500" />
              <Clock className="size-3" />
              <span>
                {t("lastTriggered", {
                  date: new Date(webhook.last_triggered_at).toLocaleDateString(),
                })}
              </span>
            </>
          ) : (
            <>
              <XCircle className="size-3" />
              <span>{t("neverTriggered")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventLabel(event: WebhookEvent): string {
  const found = WEBHOOK_EVENTS.find((e) => e.value === event);
  return found?.labelKey ?? event;
}
