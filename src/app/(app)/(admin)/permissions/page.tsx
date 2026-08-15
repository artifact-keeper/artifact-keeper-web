"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Plus, Pencil, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

import { permissionsApi } from "@/lib/api/permissions";
import type {
  Permission,
  PermissionAction,
  PermissionPrincipalType,
  PermissionTargetType,
  CreatePermissionRequest,
} from "@/lib/api/permissions";
import { groupsApi } from "@/lib/api/groups";
import { useRepositories } from "@/hooks/use-repositories";
import { adminApi } from "@/lib/api/admin";
import { serviceAccountsApi } from "@/lib/api/service-accounts";
import { mutationErrorToast } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import type { User, Repository } from "@/types";
import type { Group } from "@/types/groups";
import type { ServiceAccount } from "@/lib/api/service-accounts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

// -- constants --

const ALL_ACTIONS: PermissionAction[] = ["read", "write", "delete", "admin"];

const ACTION_COLORS: Record<PermissionAction, string> = {
  read: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  write: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

// -- form type --

interface PermissionForm {
  principal_type: PermissionPrincipalType;
  principal_id: string;
  target_type: PermissionTargetType;
  target_id: string;
  actions: PermissionAction[];
}

interface PrincipalOption {
  value: string;
  label: string;
  searchText?: string;
}

const EMPTY_FORM: PermissionForm = {
  principal_type: "user",
  principal_id: "",
  target_type: "repository",
  target_id: "",
  actions: ["read"],
};

const PRINCIPAL_TYPE_LABEL_KEYS: Record<PermissionPrincipalType, string> = {
  user: "principalType.user",
  service_account: "principalType.serviceAccount",
  group: "principalType.group",
};

// -- page --

export default function PermissionsPage() {
  const t = useTranslations("adminPermissions");
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);

  const [form, setForm] = useState<PermissionForm>(EMPTY_FORM);
  const [principalPickerOpen, setPrincipalPickerOpen] = useState(false);
  const [principalSearch, setPrincipalSearch] = useState("");

  // -- queries --
  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => permissionsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!currentUser?.is_admin,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const { data: repositoriesData } = useRepositories(
    { per_page: 1000 },
    { enabled: !!currentUser?.is_admin },
  );

  const { data: serviceAccountsData, isLoading: serviceAccountsLoading } = useQuery({
    queryKey: ["service-accounts"],
    queryFn: () => serviceAccountsApi.list(),
    enabled: !!currentUser?.is_admin,
  });

  const permissions = permissionsData?.items ?? [];
  const users = usersData ?? [];
  const groups = groupsData?.items ?? [];
  const repositories = repositoriesData?.items ?? [];

  // principal options based on selected type
  const principalOptions = useMemo(() => {
    switch (form.principal_type) {
      case "user":
        return users.map((u: User): PrincipalOption => ({
          value: u.id,
          label: u.display_name || u.username,
        }));
      case "service_account":
        return (serviceAccountsData ?? []).map((account: ServiceAccount): PrincipalOption => ({
          value: account.id,
          label: account.display_name || account.username,
          // Display names often contain a description, while tokens and API
          // clients refer to the account by its stable svc-* username.
          searchText: account.username,
        }));
      case "group":
        return groups.map((g: Group): PrincipalOption => ({
          value: g.id,
          label: g.name,
        }));
    }
  }, [form.principal_type, users, serviceAccountsData, groups]);

  const selectedPrincipal = useMemo(
    () => principalOptions.find((principal) => principal.value === form.principal_id),
    [form.principal_id, principalOptions]
  );

  const serviceAccountNames = useMemo(
    () => new Map(
      (serviceAccountsData ?? []).map((account: ServiceAccount) => [
        account.id,
        account.display_name || account.username,
      ])
    ),
    [serviceAccountsData]
  );

  const getPrincipalLabel = useCallback(
    (permission: Permission) =>
      permission.principal_name ??
      (permission.principal_type === "service_account"
        ? serviceAccountNames.get(permission.principal_id)
        : undefined) ??
      permission.principal_id,
    [serviceAccountNames]
  );

  const filteredPrincipalOptions = useMemo(() => {
    const search = principalSearch.trim().toLowerCase();
    if (!search) return principalOptions;

    return principalOptions.filter((principal) =>
      principal.label.toLowerCase().includes(search) ||
      principal.searchText?.toLowerCase().includes(search) ||
      principal.value.toLowerCase().startsWith(search)
    );
  }, [principalOptions, principalSearch]);

  const repositoryOptions = useMemo(() =>
    repositories.map((r: Repository) => ({
      value: r.id,
      label: `${r.key}${r.name ? ` — ${r.name}` : ""}`,
    })),
  [repositories]);

  const targetOptions = useMemo(() => {
    switch (form.target_type) {
      case "repository":
        return repositoryOptions;
      case "group":
        return groups.map((g: Group) => ({ value: g.id, label: g.name }));
      default:
        return [];
    }
  }, [form.target_type, repositoryOptions, groups]);

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: CreatePermissionRequest) => permissionsApi.create(data),
    onSuccess: () => {
      toast.success(t("toast.created"));
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: mutationErrorToast(t("toast.createFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CreatePermissionRequest;
    }) => permissionsApi.update(id, data),
    onSuccess: () => {
      toast.success(t("toast.updated"));
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setEditOpen(false);
      setSelectedPermission(null);
    },
    onError: mutationErrorToast(t("toast.updateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => permissionsApi.delete(id),
    onSuccess: () => {
      toast.success(t("toast.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setDeleteOpen(false);
      setSelectedPermission(null);
    },
    onError: mutationErrorToast(t("toast.deleteFailed")),
  });

  // -- handlers --
  const handleEdit = useCallback(
    (p: Permission) => {
      setSelectedPermission(p);
      setForm({
        principal_type: p.principal_type,
        principal_id: p.principal_id,
        target_type: p.target_type,
        target_id: p.target_id,
        actions: [...p.actions],
      });
      setEditOpen(true);
    },
    []
  );

  const handleDelete = useCallback((p: Permission) => {
    setSelectedPermission(p);
    setDeleteOpen(true);
  }, []);

  const toggleAction = useCallback((action: PermissionAction) => {
    setForm((f) => ({
      ...f,
      actions: f.actions.includes(action)
        ? f.actions.filter((a) => a !== action)
        : [...f.actions, action],
    }));
  }, []);

  // -- columns --
  const columns: DataTableColumn<Permission>[] = [
    {
      id: "principal",
      header: t("colPrincipal"),
      accessor: getPrincipalLabel,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {t(PRINCIPAL_TYPE_LABEL_KEYS[p.principal_type])}
          </Badge>
          <span className="text-sm font-medium">
            {getPrincipalLabel(p)}
          </span>
        </div>
      ),
    },
    {
      id: "target",
      header: t("colTarget"),
      accessor: (p) => p.target_name ?? p.target_id,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs capitalize">
            {p.target_type}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {p.target_name ?? p.target_id}
          </span>
        </div>
      ),
    },
    {
      id: "actions_list",
      header: t("colActions"),
      cell: (p) => (
        <div className="flex items-center gap-1 flex-wrap">
          {p.actions.map((a) => (
            <span
              key={a}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[a] ?? ""}`}
            >
              {a}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "created_at",
      header: t("colCreated"),
      accessor: (p) => p.created_at,
      sortable: true,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {new Date(p.created_at).toLocaleDateString()}
        </span>
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
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(p)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("edit")}</TooltipContent>
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
            <TooltipContent>{t("delete")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- shared form fields --
  const renderFormFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("principalTypeLabel")}</Label>
          <Select
            value={form.principal_type}
            onValueChange={(v) => {
              setForm((f) => ({
                ...f,
                principal_type: v as PermissionPrincipalType,
                principal_id: "",
              }));
              setPrincipalPickerOpen(false);
              setPrincipalSearch("");
            }}
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t("principalType.user")}</SelectItem>
              <SelectItem value="service_account">{t("principalType.serviceAccount")}</SelectItem>
              <SelectItem value="group">{t("principalType.group")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("principalLabel")}</Label>
          <Popover
            open={principalPickerOpen}
            onOpenChange={(open) => {
              setPrincipalPickerOpen(open);
              if (!open) setPrincipalSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-label={t("principalLabel")}
                aria-expanded={principalPickerOpen}
                className="w-full justify-between font-normal"
                disabled={
                  editOpen ||
                  (form.principal_type === "service_account" && serviceAccountsLoading)
                }
              >
                {form.principal_type === "service_account" && serviceAccountsLoading
                  ? t("loadingServiceAccounts")
                  : selectedPrincipal?.label ??
                    (editOpen && selectedPermission
                      ? getPrincipalLabel(selectedPermission)
                      : t("select"))}
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  aria-label={t("searchPrincipalsAria")}
                  placeholder={t("searchPrincipalsPlaceholder")}
                  value={principalSearch}
                  onValueChange={setPrincipalSearch}
                />
                <CommandList>
                  {filteredPrincipalOptions.length === 0 && (
                    <CommandEmpty>
                      {principalSearch
                        ? t("noPrincipalsMatch")
                        : t("noPrincipalsAvailable")}
                    </CommandEmpty>
                  )}
                  {filteredPrincipalOptions.length > 0 && (
                    <CommandGroup heading={t("principals")}>
                      {filteredPrincipalOptions.map((principal) => (
                        <CommandItem
                          key={principal.value}
                          value={principal.value}
                          onSelect={() => {
                            setForm((f) => ({ ...f, principal_id: principal.value }));
                            setPrincipalPickerOpen(false);
                            setPrincipalSearch("");
                          }}
                        >
                          <Check
                            className={`size-4 ${
                              form.principal_id === principal.value
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate">{principal.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("targetTypeLabel")}</Label>
          <Select
            value={form.target_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                target_type: v as PermissionTargetType,
                target_id: "",
              }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repository">{t("targetType.repository")}</SelectItem>
              <SelectItem value="group">{t("targetType.group")}</SelectItem>
              <SelectItem value="artifact">{t("targetType.artifact")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{form.target_type === "repository" ? t("targetType.repository") : form.target_type === "group" ? t("targetGroup") : t("artifactId")}</Label>
          {form.target_type === "artifact" ? (
            <Input
              placeholder={t("artifactUuid")}
              value={form.target_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, target_id: e.target.value.trim() }))
              }
              disabled={editOpen}
            />
          ) : (
            <Select
              value={form.target_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, target_id: v }))
              }
              disabled={editOpen}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectTarget", { targetType: form.target_type })} />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("actionsLabel")}</Label>
        <div className="flex items-center gap-4">
          {ALL_ACTIONS.map((action) => (
            <div key={action} className="flex items-center gap-2">
              <Checkbox
                id={`action-${action}`}
                checked={form.actions.includes(action)}
                onCheckedChange={() => toggleAction(action)}
              />
              <Label
                htmlFor={`action-${action}`}
                className="text-sm capitalize cursor-pointer"
              >
                {action}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // -- render --
  if (!currentUser?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} />
        <p className="text-sm text-muted-foreground">
          {t("accessDenied")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("createPermission")}
          </Button>
        }
      />

      {!permissionsLoading && permissions.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t("noPermissions")}
          description={t("noPermissionsDescription")}
          action={
            <Button
              onClick={() => {
                setForm(EMPTY_FORM);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("createPermission")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={permissions}
          loading={permissionsLoading}
          emptyMessage={t("noPermissionsFound")}
          rowKey={(p) => p.id}
        />
      )}
      <ListTruncationNotice
        shown={permissions.length}
        total={permissionsData?.pagination?.total ?? 0}
      />

      {/* Create Permission Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setForm(EMPTY_FORM);
            setPrincipalPickerOpen(false);
            setPrincipalSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
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
              if (!form.principal_id || !form.target_id || form.actions.length === 0) {
                toast.error(t("requiredFields"));
                return;
              }
              createMutation.mutate({
                principal_type: form.principal_type,
                principal_id: form.principal_id,
                target_type: form.target_type,
                target_id: form.target_id,
                actions: form.actions,
              });
            }}
          >
            {renderFormFields()}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setForm(EMPTY_FORM);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("creating") : t("createPermission")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Permission Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setSelectedPermission(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editPermission")}</DialogTitle>
            <DialogDescription>
              {t("editDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedPermission && form.principal_id && form.target_id && form.actions.length > 0) {
                updateMutation.mutate({
                  id: selectedPermission.id,
                  data: {
                    principal_type: form.principal_type,
                    principal_id: form.principal_id,
                    target_type: form.target_type,
                    target_id: form.target_id,
                    actions: form.actions,
                  },
                });
              }
            }}
          >
            {renderFormFields()}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedPermission(null);
                  setForm(EMPTY_FORM);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Permission Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedPermission(null);
        }}
        title={t("deletePermission")}
        description={t("deleteDescription")}
        confirmText={t("deletePermission")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedPermission) deleteMutation.mutate(selectedPermission.id);
        }}
      />
    </div>
  );
}
