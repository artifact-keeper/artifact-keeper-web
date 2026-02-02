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

import { webhooksApi } from "@/lib/api/webhooks";
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
  CardHeader,
  CardTitle,
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

// -- constants --

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: "artifact_uploaded", label: "Artifact Uploaded" },
  { value: "artifact_deleted", label: "Artifact Deleted" },
  { value: "repository_created", label: "Repository Created" },
  { value: "repository_deleted", label: "Repository Deleted" },
  { value: "user_created", label: "User Created" },
  { value: "user_deleted", label: "User Deleted" },
  { value: "build_started", label: "Build Started" },
  { value: "build_completed", label: "Build Completed" },
  { value: "build_failed", label: "Build Failed" },
];

function eventColor(event: string): "green" | "red" | "blue" | "default" {
  if (event.includes("deleted") || event.includes("failed")) return "red";
  if (
    event.includes("created") ||
    event.includes("uploaded") ||
    event.includes("completed")
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
      toast.success("Webhook created");
    },
    onError: () => toast.error("Failed to create webhook"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setDeleteId(null);
      toast.success("Webhook deleted");
    },
    onError: () => toast.error("Failed to delete webhook"),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook enabled");
    },
    onError: () => toast.error("Failed to enable webhook"),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook disabled");
    },
    onError: () => toast.error("Failed to disable webhook"),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Test succeeded (HTTP ${result.status_code})`);
      } else {
        toast.warning(
          `Test failed: ${result.error || `HTTP ${result.status_code}`}`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: () => toast.error("Failed to send test"),
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
      toast.success("Redelivery sent");
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: () => toast.error("Failed to redeliver"),
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
      header: "Name",
      accessor: (w) => w.name,
      sortable: true,
      cell: (w) => (
        <div className="flex items-center gap-2">
          <Send className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{w.name}</span>
          {!w.is_enabled && (
            <Badge variant="secondary" className="text-xs">
              Disabled
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
      header: "Events",
      cell: (w) => (
        <div className="flex flex-wrap gap-1">
          {w.events.map((e) => (
            <span
              key={e}
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${EVENT_BADGE_CLASSES[eventColor(e)]}`}
            >
              {e.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (w) => (
        <StatusBadge
          status={w.is_enabled ? "Active" : "Disabled"}
          color={w.is_enabled ? "green" : "default"}
        />
      ),
    },
    {
      id: "last_triggered",
      header: "Last Triggered",
      accessor: (w) => w.last_triggered_at ?? "",
      cell: (w) => (
        <span className="text-sm text-muted-foreground">
          {w.last_triggered_at
            ? new Date(w.last_triggered_at).toLocaleString()
            : "Never"}
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
            <TooltipContent>View deliveries</TooltipContent>
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
            <TooltipContent>Send test</TooltipContent>
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
              <TooltipContent>Disable</TooltipContent>
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
              <TooltipContent>Enable</TooltipContent>
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
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Manage webhooks for event-driven integrations."
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
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Webhook
            </Button>
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold">{webhooks.length}</p>
            </div>
            <Send className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
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
              <p className="text-sm text-muted-foreground">Disabled</p>
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
          title="No webhooks configured"
          description="Create a webhook to receive event notifications via HTTP callbacks."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Webhook
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={webhooks}
          loading={isLoading}
          rowKey={(w) => w.id}
          emptyMessage="No webhooks found."
        />
      )}

      {/* -- Create Webhook Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Webhook</DialogTitle>
            <DialogDescription>
              Configure a new webhook to receive event notifications.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (formEvents.length === 0) {
                toast.error("Select at least one event");
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
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Slack Notifications"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">Payload URL</Label>
              <Input
                id="wh-url"
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            <div className="space-y-3">
              <Label>Events</Label>
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
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-secret">
                Secret{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="wh-secret"
                type="password"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
                placeholder="Shared secret for payload signing"
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
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Webhook"}
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
              Deliveries: {deliveryWebhook?.name ?? ""}
            </SheetTitle>
            <SheetDescription>
              Recent webhook delivery attempts and their results.
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
                No deliveries yet
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
                      {d.event.replace(/_/g, " ")}
                    </span>
                    <StatusBadge
                      status={
                        d.success
                          ? `HTTP ${d.response_status}`
                          : d.response_status
                            ? `HTTP ${d.response_status}`
                            : "Failed"
                      }
                      color={d.success ? "green" : "red"}
                    />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Attempts: {d.attempts}
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
                        Redeliver
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
        title="Delete Webhook"
        description="This will permanently remove the webhook and its delivery history. This action cannot be undone."
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
      />
    </div>
  );
}
