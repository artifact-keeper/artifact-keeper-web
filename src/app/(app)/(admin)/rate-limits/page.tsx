"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  { labelKey: string; icon: React.ComponentType<{ className?: string }>; placeholderKey: string }
> = {
  username: { labelKey: "typeUsername", icon: User, placeholderKey: "typeUsernamePlaceholder" },
  service_account: { labelKey: "typeServiceAccount", icon: Bot, placeholderKey: "typeServiceAccountPlaceholder" },
  cidr: { labelKey: "typeCidr", icon: Network, placeholderKey: "typeCidrPlaceholder" },
};

function rate(
  window: { limit: number; window_secs: number },
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  if (window.window_secs <= 0) return t("requests", { count: window.limit });
  return t("requestsPerWindow", { count: window.limit, seconds: window.window_secs });
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
  const t = useTranslations("admin.rateLimits");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("currentRateLimits")}</CardTitle>
        <CardDescription>
          {t("currentRateLimitsDescription")}
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
            {t("configUnavailable")}
          </p>
        )}
        {!isLoading && config && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("authentication")}</dt>
              <dd className="text-sm font-medium">{rate(config.auth, t)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("api")}</dt>
              <dd className="text-sm font-medium">{rate(config.api, t)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("search")}</dt>
              <dd className="text-sm font-medium">{rate(config.search, t)}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-muted-foreground">
                {t("serviceAccountsExempt")}
              </dt>
              <dd className="text-sm font-medium">
                {config.exempt_service_accounts ? t("yes") : t("no")}
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
  const t = useTranslations("admin.rateLimits");
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
      toast.success(t("toast.exemptionAdded"));
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setOpen(false);
      setValue("");
      setNote("");
      setType("username");
      setValueError(null);
    },
    onError: mutationErrorToast(t("toast.addFailed")),
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
          {t("addExemption")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addExemptionTitle")}</DialogTitle>
          <DialogDescription>
            {t("addExemptionDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="exemption-type">{t("type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExemptionType)}>
              <SelectTrigger id="exemption-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="username">{t("typeUsername")}</SelectItem>
                <SelectItem value="service_account">{t("typeServiceAccount")}</SelectItem>
                <SelectItem value="cidr">{t("typeCidr")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exemption-value">{t(meta.labelKey)}</Label>
            <Input
              id="exemption-value"
              placeholder={t(meta.placeholderKey)}
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
            <Label htmlFor="exemption-note">{t("note")}</Label>
            <Input
              id="exemption-note"
              placeholder={t("notePlaceholder")}
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
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending}>
            {addMutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            {t("addExemption")}
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
  const t = useTranslations("admin.rateLimits");
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<RateLimitExemption | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => rateLimitsApi.removeExemption(id),
    onSuccess: () => {
      toast.success(t("toast.exemptionRemoved"));
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setPendingDelete(null);
    },
    onError: mutationErrorToast(t("toast.removeFailed")),
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
        <AlertTitle>{t("exemptionsUnavailable")}</AlertTitle>
        <AlertDescription>
          {t("exemptionsUnavailableDescription")}
        </AlertDescription>
      </Alert>
    );
  }

  if (!exemptions || exemptions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("noExemptions")}
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colType")}</TableHead>
            <TableHead>{t("colValue")}</TableHead>
            <TableHead>{t("colNote")}</TableHead>
            <TableHead>{t("colSource")}</TableHead>
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
                    {t(meta.labelKey)}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{ex.value}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ex.note || "—"}
                </TableCell>
                <TableCell>
                  {ex.source_env ? (
                    <Badge variant="secondary">{t("environment")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("manual")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("removeAria", { value: ex.value })}
                    disabled={ex.source_env}
                    title={
                      ex.source_env
                        ? t("removeTooltipEnv")
                        : t("removeTooltip")
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
            <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                t("removeDescription", { type: t(TYPE_META[pendingDelete.type].labelKey), value: pendingDelete.value })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              {t("cancel")}
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
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// -- Page --

export default function RateLimitsPage() {
  const t = useTranslations("admin.rateLimits");
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
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("accessDeniedDescription")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <span className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="size-5" />
          </span>
        }
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>{t("aboutExemptions")}</AlertTitle>
        <AlertDescription>
          {t("aboutExemptionsDescription")}
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
            <CardTitle className="text-base">{t("exemptions")}</CardTitle>
            <CardDescription>
              {t("exemptionsDescription")}
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
