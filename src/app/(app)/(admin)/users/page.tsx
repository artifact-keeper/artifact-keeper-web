/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
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
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

// -- helpers --

function generateRandomPassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
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
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

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

  // -- queries --
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!currentUser?.is_admin,
  });

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
      const { data, error } = await sdkCreateUser({
        body: payload as any,
      });
      if (error) throw error;
      return data as any as CreateUserResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);

      if (data.generated_password) {
        setGeneratedPassword(data.generated_password);
        setPasswordUsername(data.user.username);
        setPasswordOpen(true);
      } else {
        toast.success("User created successfully");
      }
    },
    onError: () => {
      toast.error("Failed to create user");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: EditUserForm }) => {
      const { data, error } = await sdkUpdateUser({
        path: { id },
        body: {
          email: formData.email,
          display_name: formData.display_name,
          is_admin: formData.is_admin,
          is_active: formData.is_active,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("User updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      setEditOpen(false);
      setSelectedUser(null);
    },
    onError: () => {
      toast.error("Failed to update user");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sdkUpdateUser({
        path: { id },
        body: { is_active },
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`User ${vars.is_active ? "enabled" : "disabled"} successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: () => {
      toast.error("Failed to update user status");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sdkResetPassword({
        path: { id },
      });
      if (error) throw error;
      return data as any as { temporary_password: string };
    },
    onSuccess: (data, userId) => {
      const u = users?.find((x) => x.id === userId);
      setGeneratedPassword(data.temporary_password);
      setPasswordUsername(u?.username ?? "User");
      setPasswordOpen(true);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => {
      toast.error("Failed to reset password");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdkDeleteUser({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      setDeleteOpen(false);
      setSelectedUser(null);
    },
    onError: () => {
      toast.error("Failed to delete user");
    },
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
        toast.error("You cannot delete your own account");
        return;
      }
      setSelectedUser(u);
      setDeleteOpen(true);
    },
    [isSelf]
  );

  const handleResetPassword = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error("You cannot reset your own password from here");
        return;
      }
      resetPasswordMutation.mutate(u.id);
    },
    [isSelf, resetPasswordMutation]
  );

  const handleToggleStatus = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error("You cannot disable your own account");
        return;
      }
      toggleStatusMutation.mutate({
        id: u.id,
        is_active: !(u.is_active ?? true),
      });
    },
    [isSelf, toggleStatusMutation]
  );

  const copyPassword = useCallback(() => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success("Password copied to clipboard");
    }
  }, [generatedPassword]);

  // -- columns --
  const columns: DataTableColumn<User>[] = [
    {
      id: "username",
      header: "Username",
      accessor: (u) => u.username,
      sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{u.username}</span>
          {u.is_admin && (
            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="size-3 mr-1" />
              Admin
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "email",
      header: "Email",
      accessor: (u) => u.email,
      sortable: true,
      cell: (u) => <span className="text-sm text-muted-foreground">{u.email}</span>,
    },
    {
      id: "display_name",
      header: "Display Name",
      accessor: (u) => u.display_name ?? "",
      sortable: true,
      cell: (u) => (
        <span className="text-sm">{u.display_name || "\u2014"}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (u) => (u.is_active !== false ? "Active" : "Inactive"),
      cell: (u) => (
        <StatusBadge
          status={u.is_active !== false ? "Active" : "Inactive"}
          color={u.is_active !== false ? "green" : "red"}
        />
      ),
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
              <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(u)}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleResetPassword(u)}
                disabled={isSelf(u)}
              >
                <KeyRound className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset Password</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
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
              {u.is_active !== false ? "Disable" : "Enable"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(u)}
                disabled={isSelf(u)}
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

  // -- render --
  if (!currentUser?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and access."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create User
          </Button>
        }
      />

      {!isLoading && (users?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Create your first user to get started."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create User
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={users ?? []}
          loading={isLoading}
          emptyMessage="No users found."
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
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Add a new user account. A temporary password will be generated if
              auto-generate is enabled.
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
              <Label htmlFor="create-username">Username</Label>
              <Input
                id="create-username"
                placeholder="jdoe"
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="jdoe@example.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display">Display Name</Label>
              <Input
                id="create-display"
                placeholder="John Doe"
                value={createForm.display_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, display_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-password">Password</Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="auto-generate"
                    className="text-xs text-muted-foreground"
                  >
                    Auto-generate
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
                <div className="flex gap-2">
                  <Input
                    id="create-password"
                    type="text"
                    placeholder="Enter password"
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
                    Generate
                  </Button>
                </div>
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
              <Label htmlFor="create-admin">Administrator</Label>
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
                {createMutation.isPending ? "Creating..." : "Create User"}
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
            <DialogTitle>Edit User: {selectedUser?.username}</DialogTitle>
            <DialogDescription>
              Update user details and access level.
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
              <Label htmlFor="edit-email">Email</Label>
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
              <Label htmlFor="edit-display">Display Name</Label>
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
              <Label htmlFor="edit-admin">Administrator</Label>
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
              <Label htmlFor="edit-active">Active</Label>
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
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
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
            <DialogTitle>Temporary Password</DialogTitle>
            <DialogDescription>
              This password will only be shown once. Save it and share it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Save this password!</AlertTitle>
              <AlertDescription>
                The user will be required to change this password on next login.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Username</p>
              <code className="block rounded bg-muted px-3 py-2 text-sm font-mono">
                {passwordUsername}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Temporary Password</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {generatedPassword}
                </code>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  <Copy className="size-3.5 mr-1" />
                  Copy
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
              Done
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
        title="Delete User"
        description={`Deleting "${selectedUser?.username}" will permanently remove their account and revoke all access. This cannot be undone.`}
        typeToConfirm={selectedUser?.username}
        confirmText="Delete User"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedUser) deleteMutation.mutate(selectedUser.id);
        }}
      />
    </div>
  );
}
