"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
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
import { adminApi } from "@/lib/api/admin";
import { useAuth } from "@/providers/auth-provider";
import type { User } from "@/types";
import type { Group } from "@/types/groups";

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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

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

const EMPTY_FORM: PermissionForm = {
  principal_type: "user",
  principal_id: "",
  target_type: "repository",
  target_id: "",
  actions: ["read"],
};

// -- page --

export default function PermissionsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);

  const [form, setForm] = useState<PermissionForm>(EMPTY_FORM);

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

  const permissions = permissionsData?.items ?? [];
  const users = usersData ?? [];
  const groups = groupsData?.items ?? [];

  // principal options based on selected type
  const principalOptions = useMemo(() => {
    if (form.principal_type === "user") {
      return users.map((u: User) => ({
        value: u.id,
        label: u.display_name || u.username,
      }));
    }
    return groups.map((g: Group) => ({
      value: g.id,
      label: g.name,
    }));
  }, [form.principal_type, users, groups]);

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: CreatePermissionRequest) => permissionsApi.create(data),
    onSuccess: () => {
      toast.success("Permission created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error("Failed to create permission"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreatePermissionRequest>;
    }) => permissionsApi.update(id, data),
    onSuccess: () => {
      toast.success("Permission updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setEditOpen(false);
      setSelectedPermission(null);
    },
    onError: () => toast.error("Failed to update permission"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => permissionsApi.delete(id),
    onSuccess: () => {
      toast.success("Permission deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setDeleteOpen(false);
      setSelectedPermission(null);
    },
    onError: () => toast.error("Failed to delete permission"),
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
      header: "Principal",
      accessor: (p) => p.principal_name ?? p.principal_id,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs capitalize"
          >
            {p.principal_type}
          </Badge>
          <span className="text-sm font-medium">
            {p.principal_name ?? p.principal_id}
          </span>
        </div>
      ),
    },
    {
      id: "target",
      header: "Target",
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
      header: "Actions",
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
      header: "Created",
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
            <TooltipContent>Edit</TooltipContent>
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
            <TooltipContent>Delete</TooltipContent>
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
          <Label>Principal Type</Label>
          <Select
            value={form.principal_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                principal_type: v as PermissionPrincipalType,
                principal_id: "",
              }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="group">Group</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Principal</Label>
          <Select
            value={form.principal_id}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, principal_id: v }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {principalOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Target Type</Label>
          <Select
            value={form.target_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                target_type: v as PermissionTargetType,
              }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repository">Repository</SelectItem>
              <SelectItem value="group">Group</SelectItem>
              <SelectItem value="artifact">Artifact</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Target Pattern</Label>
          <Input
            placeholder="e.g., npm-*, docker-prod-*"
            value={form.target_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, target_id: e.target.value }))
            }
            disabled={editOpen}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Actions</Label>
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
        <PageHeader title="Permissions" />
        <p className="text-sm text-muted-foreground">
          You must be an administrator to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        description="Control access to repositories and resources."
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create Permission
          </Button>
        }
      />

      {!permissionsLoading && permissions.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No permissions configured"
          description="Create a permission rule to control access to repositories and resources."
          action={
            <Button
              onClick={() => {
                setForm(EMPTY_FORM);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              Create Permission
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={permissions}
          loading={permissionsLoading}
          emptyMessage="No permissions found."
          rowKey={(p) => p.id}
        />
      )}

      {/* Create Permission Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Permission</DialogTitle>
            <DialogDescription>
              Grant a user or group access to a target resource.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.principal_id || !form.target_id || form.actions.length === 0) {
                toast.error("Please fill in all required fields");
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
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Permission"}
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
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>
              Update the granted actions for this permission.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedPermission && form.actions.length > 0) {
                updateMutation.mutate({
                  id: selectedPermission.id,
                  data: { actions: form.actions },
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
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
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
        title="Delete Permission"
        description="Deleting this permission will revoke the associated access. Users or groups will lose the granted actions on the target resource. This action cannot be undone."
        confirmText="Delete Permission"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedPermission) deleteMutation.mutate(selectedPermission.id);
        }}
      />
    </div>
  );
}
