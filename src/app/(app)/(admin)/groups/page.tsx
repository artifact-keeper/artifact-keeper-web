"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Users2,
  UserPlus,
  UserMinus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { groupsApi } from "@/lib/api/groups";
import { adminApi } from "@/lib/api/admin";
import { useAuth } from "@/providers/auth-provider";
import type { Group, GroupMember } from "@/types/groups";
import type { User } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

// -- types --

interface GroupForm {
  name: string;
  description: string;
}

const EMPTY_FORM: GroupForm = { name: "", description: "" };

// -- page --

export default function GroupsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [memberSearch, setMemberSearch] = useState("");
  const [addUserId, setAddUserId] = useState<string>("");

  // -- queries --
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const groups = groupsData?.items ?? [];

  // fetch group detail (with members) when members modal is open
  const { data: groupDetail, isLoading: membersLoading } = useQuery({
    queryKey: ["admin-group-detail", selectedGroup?.id],
    queryFn: () => groupsApi.get(selectedGroup!.id),
    enabled: membersOpen && !!selectedGroup?.id,
  });

  // all users for the add member dropdown
  const { data: allUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: membersOpen && !!currentUser?.is_admin,
  });

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: GroupForm) =>
      groupsApi.create({ name: data.name, description: data.description }),
    onSuccess: () => {
      toast.success("Group created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error("Failed to create group"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GroupForm> }) =>
      groupsApi.update(id, { description: data.description }),
    onSuccess: () => {
      toast.success("Group updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      setEditOpen(false);
      setSelectedGroup(null);
    },
    onError: () => toast.error("Failed to update group"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupsApi.delete(id),
    onSuccess: () => {
      toast.success("Group deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setDeleteOpen(false);
      setSelectedGroup(null);
    },
    onError: () => toast.error("Failed to delete group"),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.addMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success("Member added");
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setAddUserId("");
    },
    onError: () => toast.error("Failed to add member"),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.removeMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
    },
    onError: () => toast.error("Failed to remove member"),
  });

  // -- handlers --
  const handleEdit = useCallback((g: Group) => {
    setSelectedGroup(g);
    setForm({ name: g.name, description: g.description ?? "" });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((g: Group) => {
    setSelectedGroup(g);
    setDeleteOpen(true);
  }, []);

  const handleManageMembers = useCallback((g: Group) => {
    setSelectedGroup(g);
    setMemberSearch("");
    setAddUserId("");
    setMembersOpen(true);
  }, []);

  // Compute members with type safety
  const members: GroupMember[] =
    (groupDetail as { members?: GroupMember[] })?.members ?? [];

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableUsers = (allUsers ?? []).filter(
    (u: User) => !memberIds.has(u.id)
  );

  const filteredMembers = memberSearch
    ? members.filter(
        (m) =>
          m.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
          (m.display_name ?? "")
            .toLowerCase()
            .includes(memberSearch.toLowerCase())
      )
    : members;

  // -- columns --
  const columns: DataTableColumn<Group>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (g) => g.name,
      sortable: true,
      cell: (g) => <span className="text-sm font-medium">{g.name}</span>,
    },
    {
      id: "description",
      header: "Description",
      accessor: (g) => g.description ?? "",
      cell: (g) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {g.description || "\u2014"}
        </span>
      ),
    },
    {
      id: "member_count",
      header: "Members",
      accessor: (g) => g.member_count,
      sortable: true,
      cell: (g) => (
        <Badge variant="secondary" className="text-xs">
          {g.member_count}
        </Badge>
      ),
    },
    {
      id: "created_at",
      header: "Created",
      accessor: (g) => g.created_at,
      sortable: true,
      cell: (g) => (
        <span className="text-sm text-muted-foreground">
          {new Date(g.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (g) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(g)}
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
                onClick={() => handleManageMembers(g)}
              >
                <Users2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Manage Members</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(g)}
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
        <PageHeader title="Groups" />
        <p className="text-sm text-muted-foreground">
          You must be an administrator to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Organize users into groups for easier permission management."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Group
          </Button>
        }
      />

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No groups yet"
          description="Create a group to organize users and manage permissions collectively."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Group
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={groups}
          loading={isLoading}
          emptyMessage="No groups found."
          rowKey={(g) => g.id}
        />
      )}

      {/* Create Group Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Add a new group to organize users.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                placeholder="engineering"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-desc">Description</Label>
              <Textarea
                id="group-desc"
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
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
                {createMutation.isPending ? "Creating..." : "Create Group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedGroup(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Group: {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Update the group description.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedGroup) {
                updateMutation.mutate({
                  id: selectedGroup.id,
                  data: { description: form.description },
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">Name</Label>
              <Input id="edit-group-name" value={form.name} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-desc">Description</Label>
              <Textarea
                id="edit-group-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedGroup(null);
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

      {/* Manage Members Dialog */}
      <Dialog
        open={membersOpen}
        onOpenChange={(o) => {
          setMembersOpen(o);
          if (!o) {
            setSelectedGroup(null);
            setMemberSearch("");
            setAddUserId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Members: {selectedGroup?.name}
            </DialogTitle>
            <DialogDescription>
              Add or remove users from this group.
            </DialogDescription>
          </DialogHeader>

          {/* Add member */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>Add Member</Label>
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u: User) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name || u.username} ({u.username})
                    </SelectItem>
                  ))}
                  {availableUsers.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No users available to add
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!addUserId || addMemberMutation.isPending}
              onClick={() => {
                if (selectedGroup && addUserId) {
                  addMemberMutation.mutate({
                    groupId: selectedGroup.id,
                    userId: addUserId,
                  });
                }
              }}
            >
              <UserPlus className="size-3.5 mr-1" />
              Add
            </Button>
          </div>

          <Separator />

          {/* Member list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Members ({members.length})
              </Label>
              {members.length > 5 && (
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter members..."
                    className="pl-8 h-8 text-xs"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
              )}
            </div>
            <ScrollArea className="h-[240px] rounded-md border">
              {membersLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Loading members...
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  {members.length === 0
                    ? "No members in this group"
                    : "No members match your search"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredMembers.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.username}</p>
                        {m.display_name && (
                          <p className="text-xs text-muted-foreground">
                            {m.display_name}
                          </p>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (selectedGroup) {
                                removeMemberMutation.mutate({
                                  groupId: selectedGroup.id,
                                  userId: m.user_id,
                                });
                              }
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <UserMinus className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMembersOpen(false);
                setSelectedGroup(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedGroup(null);
        }}
        title="Delete Group"
        description={`Deleting "${selectedGroup?.name}" will remove all member associations. Members will lose any permissions granted through this group. This action cannot be undone.`}
        typeToConfirm={selectedGroup?.name}
        confirmText="Delete Group"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedGroup) deleteMutation.mutate(selectedGroup.id);
        }}
      />
    </div>
  );
}
