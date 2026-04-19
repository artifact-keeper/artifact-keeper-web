"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toUserMessage } from "@/lib/error-utils";

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; description: string }[] = [
  {
    value: "artifact_uploaded",
    label: "Artifact Uploaded",
    description: "Triggered when an artifact is pushed to this repository",
  },
  {
    value: "artifact_deleted",
    label: "Artifact Deleted",
    description: "Triggered when an artifact is removed from this repository",
  },
  {
    value: "build_started",
    label: "Build Started",
    description: "Triggered when a build begins for artifacts in this repository",
  },
  {
    value: "build_completed",
    label: "Build Completed",
    description: "Triggered when a build finishes successfully",
  },
  {
    value: "build_failed",
    label: "Build Failed",
    description: "Triggered when a build finishes with errors",
  },
  {
    value: "repository_created",
    label: "Repository Created",
    description: "Triggered when a new repository is created",
  },
  {
    value: "repository_deleted",
    label: "Repository Deleted",
    description: "Triggered when a repository is deleted",
  },
  {
    value: "user_created",
    label: "User Created",
    description: "Triggered when a new user account is created",
  },
  {
    value: "user_deleted",
    label: "User Deleted",
    description: "Triggered when a user account is removed",
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
  const [createOpen, setCreateOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([]);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
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
      toast.success("Webhook created");
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to create webhook"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      toast.success("Webhook deleted");
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to delete webhook"));
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      toast.success("Webhook enabled");
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to enable webhook"));
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      toast.success("Webhook disabled");
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to disable webhook"));
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Test delivery succeeded (HTTP ${result.status_code})`);
      } else {
        toast.error(result.error ?? "Test delivery failed");
      }
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "Failed to send test"));
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
      toast.error("Name, URL, and at least one event are required");
      return;
    }
    createMutation.mutate({
      name: formName.trim(),
      url: formUrl.trim(),
      events: formEvents,
      secret: formSecret.trim() || undefined,
      repository_id: repositoryId,
    });
  }, [formName, formUrl, formSecret, formEvents, repositoryId, createMutation]);

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
          <h3 className="text-sm font-medium">Webhook Notifications</h3>
          {webhooks.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {webhooks.length} configured
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="add-webhook-button"
        >
          <Plus className="size-4 mr-1" />
          Add Webhook
        </Button>
      </div>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            No webhooks configured for this repository.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a webhook to receive notifications when events occur.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onDelete={(id) => deleteMutation.mutate(id)}
              onEnable={(id) => enableMutation.mutate(id)}
              onDisable={(id) => disableMutation.mutate(id)}
              onTest={(id) => testMutation.mutate(id)}
              isDeleting={deleteMutation.isPending}
              isTesting={testMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Name</Label>
              <Input
                id="webhook-name"
                placeholder="e.g. CI/CD Pipeline"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">Payload URL</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-secret">
                Secret{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="webhook-secret"
                type="password"
                placeholder="Used to sign payloads"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>Events</Label>
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
                      aria-label={event.label}
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{event.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {event.description}
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
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="create-webhook-submit"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Webhook"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            {webhook.is_enabled ? "Active" : "Inactive"}
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
                aria-label="Test webhook"
              >
                {isTesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <TestTube className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send test delivery</TooltipContent>
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
                aria-label={webhook.is_enabled ? "Disable webhook" : "Enable webhook"}
              >
                {webhook.is_enabled ? (
                  <PowerOff className="size-3.5" />
                ) : (
                  <Power className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {webhook.is_enabled ? "Disable" : "Enable"}
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
                aria-label="Delete webhook"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
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
              {formatEventLabel(event)}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          {webhook.last_triggered_at ? (
            <>
              <CheckCircle2 className="size-3 text-green-500" />
              <Clock className="size-3" />
              <span>
                Last triggered{" "}
                {new Date(webhook.last_triggered_at).toLocaleDateString()}
              </span>
            </>
          ) : (
            <>
              <XCircle className="size-3" />
              <span>Never triggered</span>
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
  return found?.label ?? event;
}
