/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Key,
  ToggleLeft,
  ToggleRight,
  Copy,
  Users,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import "@/lib/sdk-client";
import {
  createUser as sdkCreateUser,
  updateUser as sdkUpdateUser,
  resetPassword as sdkResetPassword,
  deleteUser as sdkDeleteUser,
} from "@artifact-keeper/sdk";
import { adminApi } from "@/lib/api/admin";
import type { ApiKey } from "@/lib/api/profile";
import { mutationErrorToast } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import type { User, CreateUserResponse } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { AuthSourceBadge, getAuthProviderLabel } from "@/components/common/auth-source-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";
import { unwrap } from "@/lib/sdk-utils";

// -- helpers --

function generateRandomPassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (n) => chars[n % chars.length]).join("");
}

// -- types --

interface CreateUserForm {
  username: string;
  email: string;
  display_name: string;
  password: string;
  auto_generate: boolean;
  is_admin: boolean;
}

interface EditUserForm {
  email: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
}

const EMPTY_CREATE: CreateUserForm = {
  username: "",
  email: "",
  display_name: "",
  password: "",
  auto_generate: true,
  is_admin: false,
};

// -- page --

export default function UsersPage() {
  const t = useTranslations("adminUsers");
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordUsername, setPasswordUsername] = useState<string | null>(null);

  // forms
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_CREATE);
  const [editForm, setEditForm] = useState<EditUserForm>({
    email: "",
    display_name: "",
    is_admin: false,
    is_active: true,
  });

  // server-side pagination (#564)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // -- queries --
  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin-users", page, pageSize],
    queryFn: () => adminApi.listUsersPage({ page, perPage: pageSize }),
    enabled: !!currentUser?.is_admin,
  });

  const users = usersData?.items;
  const totalUsers = usersData?.total ?? 0;

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: async (form: CreateUserForm) => {
      const payload: Record<string, unknown> = {
        username: form.username,
        email: form.email,
        display_name: form.display_name,
        is_admin: form.is_admin,
      };
      if (!form.auto_generate && form.password) {
        payload.password = form.password;
      }
      const data = await unwrap(sdkCreateUser({
        body: payload as any,
      }));
      return data as any as CreateUserResponse;
    },
    onSuccess: (data) => {
      invalidateGroup(queryClient, "users");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);

      if (data.generated_password) {
        setGeneratedPassword(data.generated_password);
        setPasswordUsername(data.user.username);
        setPasswordOpen(true);
      } else {
        toast.success(t("toastCreated"));
      }
    },
    onError: mutationErrorToast(t("toastCreateFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: EditUserForm }) => {
      const data = await unwrap(sdkUpdateUser({
        path: { id },
        body: {
          email: formData.email,
          display_name: formData.display_name,
          is_admin: formData.is_admin,
          is_active: formData.is_active,
        },
      }));
      return data;
    },
    onSuccess: () => {
      toast.success(t("toastUpdated"));
      invalidateGroup(queryClient, "users");
      setEditOpen(false);
      setSelectedUser(null);
    },
    onError: mutationErrorToast(t("toastUpdateFailed")),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await unwrap(sdkUpdateUser({
        path: { id },
        body: { is_active },
      }));
    },
    onSuccess: (_, vars) => {
      toast.success(vars.is_active ? t("toastEnabled") : t("toastDisabled"));
      invalidateGroup(queryClient, "users");
    },
    onError: mutationErrorToast(t("toastStatusUpdateFailed")),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const data = await unwrap(sdkResetPassword({
        path: { id },
      }));
      return data as any as { temporary_password: string };
    },
    onSuccess: (data, userId) => {
      const u = users?.find((x) => x.id === userId);
      setGeneratedPassword(data.temporary_password);
      setPasswordUsername(u?.username ?? t("user"));
      setPasswordOpen(true);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: mutationErrorToast(t("toastResetPasswordFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(sdkDeleteUser({ path: { id } }));
    },
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      invalidateGroup(queryClient, "users");
      setDeleteOpen(false);
      setSelectedUser(null);
    },
    onError: mutationErrorToast(t("toastDeleteFailed")),
  });

  // -- user tokens query (for the selected user) --
  const {
    data: userTokens,
    isLoading: tokensLoading,
  } = useQuery({
    queryKey: ["admin-user-tokens", selectedUser?.id],
    queryFn: () => adminApi.listUserTokens(selectedUser!.id),
    enabled: tokensOpen && !!selectedUser,
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async ({ userId, tokenId }: { userId: string; tokenId: string }) => {
      await adminApi.revokeUserToken(userId, tokenId);
    },
    onSuccess: () => {
      toast.success(t("toastTokenRevoked"));
      queryClient.invalidateQueries({
        queryKey: ["admin-user-tokens", selectedUser?.id],
      });
      setRevokeTokenId(null);
    },
    onError: mutationErrorToast(t("toastTokenRevokeFailed")),
  });

  // -- handlers --
  const isSelf = useCallback(
    (u: User) => u.id === currentUser?.id,
    [currentUser]
  );

  const handleEdit = useCallback((u: User) => {
    setSelectedUser(u);
    setEditForm({
      email: u.email,
      display_name: u.display_name ?? "",
      is_admin: u.is_admin,
      is_active: u.is_active ?? true,
    });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error(t("cannotDeleteSelf"));
        return;
      }
      setSelectedUser(u);
      setDeleteOpen(true);
    },
    [isSelf, t]
  );

  const handleResetPassword = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error(t("cannotResetSelfPassword"));
        return;
      }
      resetPasswordMutation.mutate(u.id);
    },
    [isSelf, resetPasswordMutation, t]
  );

  const handleViewTokens = useCallback((u: User) => {
    setSelectedUser(u);
    setTokensOpen(true);
  }, []);

  const handleToggleStatus = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error(t("cannotDisableSelf"));
        return;
      }
      toggleStatusMutation.mutate({
        id: u.id,
        is_active: !(u.is_active ?? true),
      });
    },
    [isSelf, toggleStatusMutation, t]
  );

  const copyPassword = useCallback(() => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success(t("toastPasswordCopied"));
    }
  }, [generatedPassword, t]);

  // -- columns --
  const columns: DataTableColumn<User>[] = [
    {
      id: "username",
      header: t("colUsername"),
      accessor: (u) => u.username,
      sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{u.username}</span>
          {u.is_admin && (
            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="size-3 mr-1" />
              {t("admin")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "email",
      header: t("colEmail"),
      accessor: (u) => u.email,
      sortable: true,
      cell: (u) => <span className="text-sm text-muted-foreground">{u.email}</span>,
    },
    {
      id: "display_name",
      header: t("colDisplayName"),
      accessor: (u) => u.display_name ?? "",
      sortable: true,
      cell: (u) => (
        <span className="text-sm">{u.display_name || "\u2014"}</span>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      accessor: (u) => (u.is_active !== false ? t("active") : t("inactive")),
      cell: (u) => (
        <StatusBadge
          status={u.is_active !== false ? t("active") : t("inactive")}
          color={u.is_active !== false ? "green" : "red"}
        />
      ),
    },
    {
      id: "auth_source",
      header: t("colAuthSource"),
      accessor: (u) => getAuthProviderLabel(u.auth_provider),
      sortable: true,
      cell: (u) => <AuthSourceBadge provider={u.auth_provider} />,
    },
    {
      id: "actions",
      header: "",
      cell: (u) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("viewTokensAria", { name: u.username })} onClick={() => handleViewTokens(u)}>
                <Key className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("viewTokens")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("editAria", { name: u.username })} onClick={() => handleEdit(u)}>
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
                aria-label={t("resetPasswordAria", { name: u.username })}
                onClick={() => handleResetPassword(u)}
                disabled={isSelf(u)}
              >
                <KeyRound className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("resetPassword")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t(u.is_active !== false ? "disableAria" : "enableAria", { name: u.username })}
                onClick={() => handleToggleStatus(u)}
                disabled={isSelf(u)}
              >
                {u.is_active !== false ? (
                  <ToggleRight className="size-3.5" />
                ) : (
                  <ToggleLeft className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {u.is_active !== false ? t("disable") : t("enable")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("deleteAria", { name: u.username })}
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(u)}
                disabled={isSelf(u)}
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

  // -- render --
  if (!currentUser?.is_admin) {
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("createUser")}
          </Button>
        }
      />

      {!isLoading && totalUsers === 0 ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("createUser")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={users ?? []}
          total={totalUsers}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          pageSizeOptions={[20, 50, 100]}
          loading={isLoading}
          emptyMessage={t("emptyMessage")}
          rowKey={(u) => u.id}
        />
      )}

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateForm(EMPTY_CREATE);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("createUser")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(createForm);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="create-username">{t("usernameLabel")}</Label>
              <Input
                id="create-username"
                placeholder={t("usernamePlaceholder")}
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">{t("emailLabel")}</Label>
              <Input
                id="create-email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display">{t("displayNameLabel")}</Label>
              <Input
                id="create-display"
                placeholder={t("displayNamePlaceholder")}
                value={createForm.display_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, display_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-password">{t("passwordLabel")}</Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="auto-generate"
                    className="text-xs text-muted-foreground"
                  >
                    {t("autoGenerate")}
                  </Label>
                  <Switch
                    id="auto-generate"
                    checked={createForm.auto_generate}
                    onCheckedChange={(v) =>
                      setCreateForm((f) => ({
                        ...f,
                        auto_generate: v,
                        password: v ? "" : f.password,
                      }))
                    }
                  />
                </div>
              </div>
              {!createForm.auto_generate && (
                <>
                  <div className="flex gap-2">
                    <Input
                      id="create-password"
                      type="text"
                      placeholder={t("passwordPlaceholder")}
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCreateForm((f) => ({
                          ...f,
                          password: generateRandomPassword(),
                        }))
                      }
                    >
                      {t("generate")}
                    </Button>
                  </div>
                  <PasswordPolicyHint password={createForm.password} />
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="create-admin"
                checked={createForm.is_admin}
                onCheckedChange={(v) =>
                  setCreateForm((f) => ({ ...f, is_admin: v }))
                }
              />
              <Label htmlFor="create-admin">{t("administrator")}</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateForm(EMPTY_CREATE);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("creating") : t("createUser")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedUser(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle", { name: selectedUser?.username ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("editDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedUser) {
                updateMutation.mutate({ id: selectedUser.id, data: editForm });
              }
            }}
          >
            <div className="space-y-2">
              <Label>{t("authSourceLabel")}</Label>
              <div data-testid="edit-auth-source">
                <AuthSourceBadge provider={selectedUser?.auth_provider} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">{t("emailLabel")}</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display">{t("displayNameLabel")}</Label>
              <Input
                id="edit-display"
                value={editForm.display_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, display_name: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-admin"
                checked={editForm.is_admin}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, is_admin: v }))
                }
                disabled={selectedUser ? isSelf(selectedUser) : false}
              />
              <Label htmlFor="edit-admin">{t("administrator")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-active"
                checked={editForm.is_active}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, is_active: v }))
                }
                disabled={selectedUser ? isSelf(selectedUser) : false}
              />
              <Label htmlFor="edit-active">{t("active")}</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog
        open={passwordOpen}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordOpen(false);
            setGeneratedPassword(null);
            setPasswordUsername(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tempPasswordTitle")}</DialogTitle>
            <DialogDescription>
              {t("tempPasswordDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTitle>{t("savePasswordTitle")}</AlertTitle>
              <AlertDescription>
                {t("savePasswordDescription")}
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("usernameLabel")}</p>
              <code className="block rounded bg-muted px-3 py-2 text-sm font-mono">
                {passwordUsername}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("temporaryPassword")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {generatedPassword}
                </code>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  <Copy className="size-3.5 mr-1" />
                  {t("copy")}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setPasswordOpen(false);
                setGeneratedPassword(null);
                setPasswordUsername(null);
              }}
            >
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedUser(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: selectedUser?.username ?? "" })}
        typeToConfirm={selectedUser?.username}
        confirmText={t("deleteConfirm")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedUser) deleteMutation.mutate(selectedUser.id);
        }}
      />

      {/* User Tokens Dialog */}
      <Dialog
        open={tokensOpen}
        onOpenChange={(o) => {
          setTokensOpen(o);
          if (!o) {
            setSelectedUser(null);
            setRevokeTokenId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("tokensTitle", { name: selectedUser?.username ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("tokensDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {tokensLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t("loadingTokens")}
              </p>
            ) : (userTokens ?? []).length === 0 ? (
              <EmptyState
                icon={Key}
                title={t("noTokensTitle")}
                description={t("noTokensDescription")}
              />
            ) : (
              <div className="divide-y">
                {(userTokens ?? []).map((token: ApiKey) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {token.name}
                        </span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs shrink-0">
                          {token.key_prefix}...
                        </code>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(token.scopes ?? []).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          {t("createdLabel")}{" "}
                          {token.created_at
                            ? new Date(token.created_at).toLocaleDateString()
                            : t("na")}
                        </span>
                        {token.expires_at && (
                          <span>
                            {t("expiresLabel")}{" "}
                            {new Date(token.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span>
                          {t("lastUsedLabel")}{" "}
                          {token.last_used_at
                            ? new Date(token.last_used_at).toLocaleDateString()
                            : t("never")}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive shrink-0 ml-2"
                      onClick={() => setRevokeTokenId(token.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      {t("revoke")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTokensOpen(false);
                setSelectedUser(null);
                setRevokeTokenId(null);
              }}
            >
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke User Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title={t("revokeTokenTitle")}
        description={t("revokeTokenDescription")}
        confirmText={t("revokeTokenConfirm")}
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId && selectedUser) {
            revokeTokenMutation.mutate({
              userId: selectedUser.id,
              tokenId: revokeTokenId,
            });
          }
        }}
      />
    </div>
  );
}
