"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  Scale,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { sbomApi } from "@/lib/api/sbom";
import { mutationErrorToast } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import type {
  LicensePolicy,
  UpsertLicensePolicyRequest,
  PolicyAction,
} from "@/types/sbom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

interface PolicyForm {
  name: string;
  description: string;
  allowed_licenses: string;
  denied_licenses: string;
  allow_unknown: boolean;
  action: PolicyAction;
  is_enabled: boolean;
}

const EMPTY_FORM: PolicyForm = {
  name: "",
  description: "",
  allowed_licenses: "",
  denied_licenses: "",
  allow_unknown: true,
  action: "warn",
  is_enabled: true,
};

const ACTION_ICONS: Record<PolicyAction, typeof ShieldCheck> = {
  allow: ShieldCheck,
  warn: AlertTriangle,
  block: ShieldAlert,
};

const ACTION_COLORS: Record<PolicyAction, string> = {
  allow: "text-green-500",
  warn: "text-yellow-500",
  block: "text-red-500",
};

const ACTION_LABELS: Record<PolicyAction, string> = {
  allow: "actionAllow",
  warn: "actionWarn",
  block: "actionBlock",
};

export default function LicensePoliciesPage() {
  const t = useTranslations("admin.licensePolicies");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<LicensePolicy | null>(null);

  // form
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);

  // -- queries --
  const { data: policies, isLoading } = useQuery({
    queryKey: ["license-policies"],
    queryFn: () => sbomApi.listPolicies(),
    enabled: !!user?.is_admin,
  });

  // -- mutations --
  const upsertMutation = useMutation({
    mutationFn: (req: UpsertLicensePolicyRequest) => sbomApi.upsertPolicy(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["license-policies"] });
      setCreateOpen(false);
      setEditOpen(false);
      setSelectedPolicy(null);
      setForm(EMPTY_FORM);
      toast.success(selectedPolicy ? t("toastUpdated") : t("toastCreated"));
    },
    onError: mutationErrorToast(t("toastSaveFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sbomApi.deletePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["license-policies"] });
      setDeleteOpen(false);
      setSelectedPolicy(null);
      toast.success(t("toastDeleted"));
    },
    onError: mutationErrorToast(t("toastDeleteFailed")),
  });

  const toggleMutation = useMutation({
    mutationFn: async (policy: LicensePolicy) => {
      return sbomApi.upsertPolicy({
        name: policy.name,
        description: policy.description ?? undefined,
        allowed_licenses: policy.allowed_licenses,
        denied_licenses: policy.denied_licenses,
        allow_unknown: policy.allow_unknown,
        action: policy.action as PolicyAction,
        is_enabled: !policy.is_enabled,
      });
    },
    onSuccess: (_, policy) => {
      queryClient.invalidateQueries({ queryKey: ["license-policies"] });
      toast.success(policy.is_enabled ? t("toastDisabled") : t("toastEnabled"));
    },
    onError: mutationErrorToast(t("toastToggleFailed")),
  });

  // -- handlers --
  const handleCreate = useCallback(() => {
    setSelectedPolicy(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }, []);

  const handleEdit = useCallback((policy: LicensePolicy) => {
    setSelectedPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description ?? "",
      allowed_licenses: policy.allowed_licenses.join(", "),
      denied_licenses: policy.denied_licenses.join(", "),
      allow_unknown: policy.allow_unknown,
      action: policy.action as PolicyAction,
      is_enabled: policy.is_enabled,
    });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((policy: LicensePolicy) => {
    setSelectedPolicy(policy);
    setDeleteOpen(true);
  }, []);

  const handleToggle = useCallback(
    (policy: LicensePolicy) => {
      toggleMutation.mutate(policy);
    },
    [toggleMutation]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const request: UpsertLicensePolicyRequest = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        allowed_licenses: form.allowed_licenses
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        denied_licenses: form.denied_licenses
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        allow_unknown: form.allow_unknown,
        action: form.action,
        is_enabled: form.is_enabled,
      };
      upsertMutation.mutate(request);
    },
    [form, upsertMutation]
  );

  // -- columns --
  const columns: DataTableColumn<LicensePolicy>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" />
          <span className="font-medium">{p.name}</span>
        </div>
      ),
    },
    {
      id: "action",
      header: t("colAction"),
      accessor: (p) => p.action,
      cell: (p) => {
        const Icon = ACTION_ICONS[p.action as PolicyAction] ?? AlertTriangle;
        const color = ACTION_COLORS[p.action as PolicyAction] ?? "";
        return (
          <div className="flex items-center gap-1.5">
            <Icon className={`size-4 ${color}`} />
            <span className="text-sm capitalize">{t(ACTION_LABELS[p.action as PolicyAction])}</span>
          </div>
        );
      },
    },
    {
      id: "allowed",
      header: t("colAllowed"),
      accessor: (p) => p.allowed_licenses.length,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.allowed_licenses.length > 0 ? (
            <>
              {p.allowed_licenses.slice(0, 2).map((lic) => (
                <Badge key={lic} variant="outline" className="text-xs text-green-600">
                  {lic}
                </Badge>
              ))}
              {p.allowed_licenses.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{p.allowed_licenses.length - 2}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t("anyLicenses")}</span>
          )}
        </div>
      ),
    },
    {
      id: "denied",
      header: t("colDenied"),
      accessor: (p) => p.denied_licenses.length,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.denied_licenses.length > 0 ? (
            <>
              {p.denied_licenses.slice(0, 2).map((lic) => (
                <Badge key={lic} variant="outline" className="text-xs text-red-600">
                  {lic}
                </Badge>
              ))}
              {p.denied_licenses.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{p.denied_licenses.length - 2}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t("noneLicenses")}</span>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      accessor: (p) => (p.is_enabled ? "Enabled" : "Disabled"),
      cell: (p) => (
        <StatusBadge
          status={p.is_enabled ? t("statusEnabled") : t("statusDisabled")}
          color={p.is_enabled ? "green" : "default"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (p) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(p)}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("editTooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={() => handleToggle(p)}>
                {p.is_enabled ? (
                  <ToggleRight className="size-3.5" />
                ) : (
                  <ToggleLeft className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{p.is_enabled ? t("disableTooltip") : t("enableTooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(p)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("deleteTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- render --
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

  const FormDialog = createOpen || editOpen;
  const isEditing = !!selectedPolicy;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            {t("createPolicy")}
          </Button>
        }
      />

      {!isLoading && (policies?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Scale}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={handleCreate}>
              <Plus className="size-4" />
              {t("createPolicy")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={policies ?? []}
          loading={isLoading}
          emptyMessage={t("emptyMessage")}
          rowKey={(p) => p.id}
          onRowClick={handleEdit}
        />
      )}

      {/* Create/Edit Policy Dialog */}
      <Dialog
        open={FormDialog}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditOpen(false);
            setSelectedPolicy(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? t("dialogEditDescription")
                : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="policy-name">{t("nameLabel")}</Label>
              <Input
                id="policy-name"
                placeholder={t("namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-desc">{t("descriptionLabel")}</Label>
              <Textarea
                id="policy-desc"
                placeholder={t("descriptionPlaceholder")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-allowed">
                {t("allowedLabel")}{" "}
                <span className="text-muted-foreground font-normal">({t("commaSeparated")})</span>
              </Label>
              <Input
                id="policy-allowed"
                placeholder={t("allowedPlaceholder")}
                value={form.allowed_licenses}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allowed_licenses: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("allowedHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-denied">
                {t("deniedLabel")}{" "}
                <span className="text-muted-foreground font-normal">({t("commaSeparated")})</span>
              </Label>
              <Input
                id="policy-denied"
                placeholder={t("deniedPlaceholder")}
                value={form.denied_licenses}
                onChange={(e) =>
                  setForm((f) => ({ ...f, denied_licenses: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("actionLabel")}</Label>
              <Select
                value={form.action}
                onValueChange={(v) => setForm((f) => ({ ...f, action: v as PolicyAction }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-green-500" />
                      {t("actionAllowOption")}
                    </div>
                  </SelectItem>
                  <SelectItem value="warn">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-yellow-500" />
                      {t("actionWarnOption")}
                    </div>
                  </SelectItem>
                  <SelectItem value="block">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-red-500" />
                      {t("actionBlockOption")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="policy-unknown">{t("allowUnknownLabel")}</Label>
              <Switch
                id="policy-unknown"
                checked={form.allow_unknown}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_unknown: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="policy-enabled">{t("enabledLabel")}</Label>
              <Switch
                id="policy-enabled"
                checked={form.is_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setEditOpen(false);
                  setSelectedPolicy(null);
                  setForm(EMPTY_FORM);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending
                  ? t("saving")
                  : isEditing
                    ? t("saveChanges")
                    : t("createPolicy")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedPolicy(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: selectedPolicy?.name ?? "" })}
        confirmText={t("deleteConfirm")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedPolicy) deleteMutation.mutate(selectedPolicy.id);
        }}
      />
    </div>
  );
}
