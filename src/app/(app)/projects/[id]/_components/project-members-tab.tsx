"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { useProjectMembers, projectMembersKey } from "@/hooks/use-projects";
import { adminApi } from "@/lib/api/admin";
import { groupsApi } from "@/lib/api/groups";
import { serviceAccountsApi } from "@/lib/api/service-accounts";
import {
  PROJECT_ROLES,
  actionsForRole,
  roleLabelForActions,
  projectsApi,
  type ProjectMember,
  type ProjectPrincipalType,
  type ProjectRole,
} from "@/lib/api/projects";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";

const PRINCIPAL_LABELS: Record<ProjectPrincipalType, string> = {
  user: "User",
  group: "Group",
  service_account: "Service account",
};

function memberKey(m: Pick<ProjectMember, "principal_type" | "principal_id">) {
  return `${m.principal_type}:${m.principal_id}`;
}

function roleValueForActions(actions: readonly string[]): ProjectRole | "custom" {
  const label = roleLabelForActions(actions);
  return PROJECT_ROLES.find((r) => r.label === label)?.value ?? "custom";
}

interface PrincipalOption {
  id: string;
  label: string;
}

/**
 * Directory lookups for names and the add-member picker. Listing all users and
 * service accounts is global-admin only on the backend, so for anyone else the
 * rows fall back to the raw id and users are added by id; groups are listable
 * by every signed-in user.
 */
function usePrincipalDirectory(isGlobalAdmin: boolean) {
  const users = useQuery({
    queryKey: ["project-directory", "users"],
    queryFn: () => adminApi.listUsersPage({ perPage: 100 }),
    enabled: isGlobalAdmin,
  });
  const groups = useQuery({
    queryKey: ["project-directory", "groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
  });
  const serviceAccounts = useQuery({
    queryKey: ["project-directory", "service-accounts"],
    queryFn: () => serviceAccountsApi.list(),
    enabled: isGlobalAdmin,
  });

  return useMemo(() => {
    const options: Record<ProjectPrincipalType, PrincipalOption[]> = {
      user: (users.data?.items ?? []).map((u) => ({ id: u.id, label: u.display_name ? `${u.display_name} (${u.username})` : u.username })),
      group: (groups.data?.items ?? []).map((g) => ({ id: g.id, label: g.name })),
      service_account: (serviceAccounts.data ?? []).map((s) => ({
        id: s.id,
        label: s.display_name ? `${s.display_name} (${s.username})` : s.username,
      })),
    };
    const names = new Map<string, string>();
    for (const type of Object.keys(options) as ProjectPrincipalType[]) {
      for (const o of options[type]) names.set(`${type}:${o.id}`, o.label);
    }
    return { options, names, canListUsers: isGlobalAdmin };
  }, [users.data, groups.data, serviceAccounts.data, isGlobalAdmin]);
}

interface ProjectMembersTabProps {
  projectId: string;
  /** Global admins and project admins may change membership. */
  canManage: boolean;
  isGlobalAdmin: boolean;
}

export function ProjectMembersTab({ projectId, canManage, isGlobalAdmin }: ProjectMembersTabProps) {
  const queryClient = useQueryClient();
  const { data: members = [], isLoading, isError, error } = useProjectMembers(projectId);
  const directory = usePrincipalDirectory(isGlobalAdmin);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: projectMembersKey(projectId) });

  const upsert = useMutation({
    mutationFn: (m: ProjectMember) => projectsApi.addMember(projectId, m),
    onSuccess: () => {
      toast.success("Member saved");
      refresh();
      setAddOpen(false);
    },
    onError: mutationErrorToast("Failed to save member"),
  });

  const remove = useMutation({
    mutationFn: (m: ProjectMember) => projectsApi.removeMember(projectId, m),
    onSuccess: () => {
      toast.success("Member removed");
      refresh();
      setRemoving(null);
    },
    onError: mutationErrorToast("Failed to remove member"),
  });

  const columns: DataTableColumn<ProjectMember>[] = [
    {
      id: "principal",
      header: "Member",
      accessor: (m) => directory.names.get(memberKey(m)) ?? m.principal_id,
      sortable: true,
      cell: (m) => {
        const name = directory.names.get(memberKey(m));
        return name ? (
          <span>{name}</span>
        ) : (
          <code className="text-xs text-muted-foreground">{m.principal_id}</code>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      accessor: (m) => m.principal_type,
      cell: (m) => <Badge variant="outline">{PRINCIPAL_LABELS[m.principal_type]}</Badge>,
    },
    {
      id: "role",
      header: "Role",
      cell: (m) =>
        canManage ? (
          <Select
            value={roleValueForActions(m.actions)}
            onValueChange={(v) => {
              if (v !== "custom") {
                upsert.mutate({ ...m, actions: actionsForRole(v as ProjectRole) });
              }
            }}
          >
            <SelectTrigger className="h-8 w-40" aria-label={`Role for ${m.principal_id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" disabled>
                Custom ({m.actions.join(", ")})
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{roleLabelForActions(m.actions)}</Badge>
        ),
    },
    {
      id: "actions",
      header: "Permissions",
      cell: (m) => <span className="text-xs text-muted-foreground">{m.actions.join(", ")}</span>,
    },
    ...(canManage
      ? [
          {
            id: "remove",
            header: <span className="sr-only">Remove</span>,
            cell: (m: ProjectMember) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${directory.names.get(memberKey(m)) ?? m.principal_id}`}
                onClick={() => setRemoving(m)}
              >
                <Trash2 className="size-4" />
              </Button>
            ),
          } satisfies DataTableColumn<ProjectMember>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Members get their role on every repository in this project.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add member
          </Button>
        )}
      </div>
      {isError ? (
        <EmptyState
          icon={Users}
          title="Could not load members"
          description={toUserMessage(error, "The member list could not be loaded.")}
        />
      ) : !isLoading && members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members"
          description="Add users, groups or service accounts to give them access to this project's repositories."
        />
      ) : (
        <DataTable
          columns={columns}
          data={members}
          loading={isLoading}
          rowKey={memberKey}
          emptyMessage="No members"
        />
      )}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        directory={directory}
        pending={upsert.isPending}
        onSubmit={(m) => upsert.mutate(m)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove member"
        description="They lose the access this project gave them. Direct grants on individual repositories are not affected."
        confirmText="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </div>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  directory,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: ReturnType<typeof usePrincipalDirectory>;
  pending: boolean;
  onSubmit: (m: ProjectMember) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AddMemberForm onOpenChange={onOpenChange} directory={directory} pending={pending} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function AddMemberForm({
  onOpenChange,
  directory,
  pending,
  onSubmit,
}: {
  onOpenChange: (open: boolean) => void;
  directory: ReturnType<typeof usePrincipalDirectory>;
  pending: boolean;
  onSubmit: (m: ProjectMember) => void;
}) {
  const [type, setType] = useState<ProjectPrincipalType>("user");
  const [principalId, setPrincipalId] = useState("");
  const [role, setRole] = useState<ProjectRole>("developer");

  // Without directory access the only way to name a user or service account is by id.
  const pickable = type === "group" || directory.canListUsers;
  const choices = directory.options[type];

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>
          Adding an existing member replaces their role.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!principalId.trim()) return;
          onSubmit({
            principal_type: type,
            principal_id: principalId.trim(),
            actions: actionsForRole(role),
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="member-type">Type</Label>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as ProjectPrincipalType);
              setPrincipalId("");
            }}
          >
            <SelectTrigger id="member-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRINCIPAL_LABELS) as ProjectPrincipalType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {PRINCIPAL_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="member-principal">{PRINCIPAL_LABELS[type]}</Label>
          {pickable ? (
            <Select value={principalId} onValueChange={setPrincipalId}>
              <SelectTrigger id="member-principal">
                <SelectValue placeholder={`Select a ${PRINCIPAL_LABELS[type].toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                id="member-principal"
                value={principalId}
                placeholder="00000000-0000-0000-0000-000000000000"
                onChange={(e) => setPrincipalId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Only global admins can browse users. Enter the account&apos;s id.
              </p>
            </>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="member-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
            <SelectTrigger id="member-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label} ({r.actions.join(", ")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!principalId.trim() || pending}>
            Add
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
