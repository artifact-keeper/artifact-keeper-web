"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Info, Plus, Trash2, Loader2, User, Bot, Network } from "lucide-react";

import {
  rateLimitsApi,
  validateExemption,
  type ExemptionType,
  type RateLimitConfig,
  type RateLimitExemption,
} from "@/lib/api/rate-limits";
import { mutationErrorToast } from "@/lib/error-utils";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const RATE_LIMITS_QUERY_KEY = ["rate-limits"] as const;
export const RATE_LIMIT_EXEMPTIONS_QUERY_KEY = ["rate-limit-exemptions"] as const;

const TYPE_META: Record<
  ExemptionType,
  { label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }
> = {
  username: { label: "Username", icon: User, placeholder: "ci-bot" },
  service_account: { label: "Service account", icon: Bot, placeholder: "deploy-sa" },
  cidr: { label: "CIDR range", icon: Network, placeholder: "10.0.0.0/8" },
};

function rate(window: { limit: number; window_secs: number }): string {
  if (window.window_secs <= 0) return `${window.limit} requests`;
  return `${window.limit} requests / ${window.window_secs}s`;
}

// -- Current configuration card --

function ConfigCard({
  config,
  isLoading,
  isError,
}: {
  config: RateLimitConfig | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Current Rate Limits</CardTitle>
        <CardDescription>
          Effective per-window request limits. Configured via environment
          variables and shown read-only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (isError || !config) && (
          <p className="text-sm text-muted-foreground">
            Rate-limit configuration is not available from this server.
          </p>
        )}
        {!isLoading && config && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Authentication</dt>
              <dd className="text-sm font-medium">{rate(config.auth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">API</dt>
              <dd className="text-sm font-medium">{rate(config.api)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Search</dt>
              <dd className="text-sm font-medium">{rate(config.search)}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-muted-foreground">
                Service accounts globally exempt
              </dt>
              <dd className="text-sm font-medium">
                {config.exempt_service_accounts ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

// -- Add exemption dialog --

function AddExemptionDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ExemptionType>("username");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  // Validation error associated with the value input via aria-describedby so it
  // is announced rather than only surfaced in a toast. (review fix #465)
  const [valueError, setValueError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () => rateLimitsApi.addExemption({ type, value, note }),
    onSuccess: () => {
      toast.success("Exemption added");
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setOpen(false);
      setValue("");
      setNote("");
      setType("username");
      setValueError(null);
    },
    onError: mutationErrorToast("Failed to add exemption"),
  });

  function handleSubmit() {
    const error = validateExemption({ type, value, note });
    if (error) {
      setValueError(error);
      return;
    }
    setValueError(null);
    addMutation.mutate();
  }

  const meta = TYPE_META[type];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4 mr-1.5" />
          Add Exemption
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Rate-Limit Exemption</DialogTitle>
          <DialogDescription>
            Exempt a user, service account, or network range from rate limiting.
            Use sparingly, exemptions weaken abuse protection.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="exemption-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExemptionType)}>
              <SelectTrigger id="exemption-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="username">Username</SelectItem>
                <SelectItem value="service_account">Service account</SelectItem>
                <SelectItem value="cidr">CIDR range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exemption-value">{meta.label}</Label>
            <Input
              id="exemption-value"
              placeholder={meta.placeholder}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (valueError) setValueError(null);
              }}
              aria-invalid={valueError != null}
              aria-describedby="exemption-value-error"
            />
            {/* Persistent live region so the validation error is announced and
                stays associated with the input. */}
            <p
              id="exemption-value-error"
              role="alert"
              className="min-h-[1rem] text-sm text-destructive"
            >
              {valueError}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exemption-note">Note (optional)</Label>
            <Input
              id="exemption-note"
              placeholder="Why is this exempt?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={addMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending}>
            {addMutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            Add Exemption
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Exemptions table --

function ExemptionsTable({
  exemptions,
  isLoading,
  isError,
}: {
  exemptions: RateLimitExemption[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<RateLimitExemption | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => rateLimitsApi.removeExemption(id),
    onSuccess: () => {
      toast.success("Exemption removed");
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setPendingDelete(null);
    },
    onError: mutationErrorToast("Failed to remove exemption"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Exemptions unavailable</AlertTitle>
        <AlertDescription>
          Unable to load rate-limit exemptions. This server may not support
          managing exemptions through the UI yet.
        </AlertDescription>
      </Alert>
    );
  }

  if (!exemptions || exemptions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No rate-limit exemptions configured.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-[1%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {exemptions.map((ex) => {
            const meta = TYPE_META[ex.type];
            const Icon = meta.icon;
            return (
              <TableRow key={ex.id}>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm">
                    <Icon className="size-3.5 text-muted-foreground" />
                    {meta.label}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{ex.value}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ex.note || "—"}
                </TableCell>
                <TableCell>
                  {ex.source_env ? (
                    <Badge variant="secondary">Environment</Badge>
                  ) : (
                    <Badge variant="outline">Manual</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove exemption ${ex.value}`}
                    disabled={ex.source_env}
                    title={
                      ex.source_env
                        ? "Configured via environment variable, edit server config to change"
                        : "Remove exemption"
                    }
                    onClick={() => setPendingDelete(ex)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove exemption?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                `${TYPE_META[pendingDelete.type].label} "${pendingDelete.value}" will be subject to rate limits again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) removeMutation.mutate(pendingDelete.id);
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// -- Page --

export default function RateLimitsPage() {
  const { user } = useAuth();

  const configQuery = useQuery({
    queryKey: RATE_LIMITS_QUERY_KEY,
    queryFn: () => rateLimitsApi.getConfig(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const exemptionsQuery = useQuery({
    queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY,
    queryFn: () => rateLimitsApi.listExemptions(),
    retry: false,
    staleTime: 60 * 1000,
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rate Limits" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to manage rate-limit exemptions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rate Limits"
        description="View request rate limits and manage exemptions for trusted users, service accounts, and networks."
        actions={
          <span className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="size-5" />
          </span>
        }
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>About exemptions</AlertTitle>
        <AlertDescription>
          Exempt principals bypass rate limiting entirely. Entries marked
          Environment come from server configuration and are read-only here.
          Manual entries can be added and removed below.
        </AlertDescription>
      </Alert>

      <ConfigCard
        config={configQuery.data}
        isLoading={configQuery.isLoading}
        isError={configQuery.isError}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Exemptions</CardTitle>
            <CardDescription>
              Users, service accounts, and CIDR ranges that bypass rate limiting.
            </CardDescription>
          </div>
          <AddExemptionDialog />
        </CardHeader>
        <CardContent>
          <ExemptionsTable
            exemptions={exemptionsQuery.data}
            isLoading={exemptionsQuery.isLoading}
            isError={exemptionsQuery.isError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
