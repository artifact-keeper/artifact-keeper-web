"use client";

import { useState, useCallback, useDeferredValue } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { mutationErrorToast } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
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
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";

// -- types --

interface GroupForm {
  name: string;
  description: string;
}

const EMPTY_FORM: GroupForm = { name: "", description: "" };

// SSO-synced groups (is_external) are owned by the IdP; the backend blocks edits (#2874).
const SSO_DISABLED_KEY = "ssoDisabled";
const SSO_READONLY_KEY = "ssoReadonly";

// -- page --

export default function GroupsPage() {
  const t = useTranslations("adminGroups");
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
  const [addUserSearch, setAddUserSearch] = useState("");
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
    queryFn: () => groupsApi.getDetail(selectedGroup!.id),
    enabled: membersOpen && !!selectedGroup?.id,
  });

  // Users for the add member dropdown, filtered server-side so any user in
  // the instance is reachable even beyond the first page (#564). The backend
  // clamps per_page to 100, so a truncation notice covers the remainder.
  const deferredAddUserSearch = useDeferredValue(addUserSearch);
  const { data: pickerUsersData } = useQuery({
    queryKey: ["admin-users", "picker", deferredAddUserSearch],
    queryFn: () =>
      adminApi.listUsersPage({
        search: deferredAddUserSearch || undefined,
        perPage: 100,
      }),
    enabled: membersOpen && !!currentUser?.is_admin,
  });

  const allUsers = pickerUsersData?.items ?? [];
  const pickerTotal = pickerUsersData?.total ?? 0;

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: GroupForm) =>
      groupsApi.create({ name: data.name, description: data.description }),
    onSuccess: () => {
      toast.success(t("toastCreated"));
      invalidateGroup(queryClient, "groups");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: mutationErrorToast(t("toastCreateFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: GroupForm }) =>
      // PUT is a full replacement: backend requires `name`, so resend the
      // (unchanged, non-editable) name alongside the new description.
      groupsApi.update(id, { name: data.name, description: data.description }),
    onSuccess: () => {
      toast.success(t("toastUpdated"));
      invalidateGroup(queryClient, "groups");
      setEditOpen(false);
      setSelectedGroup(null);
    },
    onError: mutationErrorToast(t("toastUpdateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupsApi.delete(id),
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      invalidateGroup(queryClient, "groups");
      setDeleteOpen(false);
      setSelectedGroup(null);
    },
    onError: mutationErrorToast(t("toastDeleteFailed")),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.addMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success(t("toastMemberAdded"));
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      invalidateGroup(queryClient, "groups");
      setAddUserId("");
    },
    onError: mutationErrorToast(t("toastMemberAddFailed")),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.removeMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success(t("toastMemberRemoved"));
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      invalidateGroup(queryClient, "groups");
    },
    onError: mutationErrorToast(t("toastMemberRemoveFailed")),
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
    setAddUserSearch("");
    setAddUserId("");
    setMembersOpen(true);
  }, []);

  // SSO-synced groups: membership is read-only in the dialog (backend rejects edits).
  const selectedIsExternal = !!selectedGroup?.is_external;

  // Compute members with type safety
  const members: GroupMember[] = groupDetail?.members ?? [];

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableUsers = allUsers.filter((u: User) => !memberIds.has(u.id));

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
      header: t("colName"),
      accessor: (g) => g.name,
      sortable: true,
      cell: (g) => <span className="text-sm font-medium">{g.name}</span>,
    },
    {
      id: "description",
      header: t("colDescription"),
      accessor: (g) => g.description ?? "",
      cell: (g) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {g.description || "\u2014"}
        </span>
      ),
    },
    {
      id: "member_count",
      header: t("colMembers"),
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
      header: t("colCreated"),
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
              {/* span wrapper: disabled Button has pointer-events-none, so the tooltip fires on the span. */}
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={g.is_external}
                  onClick={() => handleEdit(g)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {g.is_external ? t(SSO_DISABLED_KEY) : t("editTooltip")}
            </TooltipContent>
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
            <TooltipContent>
              {g.is_external ? t(SSO_READONLY_KEY) : t("manageMembers")}
            </TooltipContent>
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
            <TooltipContent>{t("deleteTooltip")}</TooltipContent>
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
        <p className="text-sm text-muted-foreground">
          {t("accessDeniedDescription")}
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("createGroup")}
          </Button>
        }
      />

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          icon={Users2}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("createGroup")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={groups}
          loading={isLoading}
          emptyMessage={t("emptyMessage")}
          rowKey={(g) => g.id}
        />
      )}
      <ListTruncationNotice
        shown={groups.length}
        total={groupsData?.pagination?.total ?? 0}
      />

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
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
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
              <Label htmlFor="group-name">{t("nameLabel")}</Label>
              <Input
                id="group-name"
                placeholder={t("namePlaceholder")}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-desc">{t("descriptionLabel")}</Label>
              <Textarea
                id="group-desc"
                placeholder={t("descriptionPlaceholder")}
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
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("creating") : t("createGroup")}
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
            <DialogTitle>{t("editDialogTitle", { name: selectedGroup?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("editDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedGroup) {
                updateMutation.mutate({
                  id: selectedGroup.id,
                  data: { name: form.name, description: form.description },
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">{t("nameLabel")}</Label>
              <Input id="edit-group-name" value={form.name} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-desc">{t("descriptionLabel")}</Label>
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
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("saveChanges")}
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
            setAddUserSearch("");
            setAddUserId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("manageMembersTitle", { name: selectedGroup?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {selectedIsExternal
                ? t(SSO_READONLY_KEY)
                : t("manageMembersDescription")}
            </DialogDescription>
          </DialogHeader>

          {/* Add member */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>{t("addMemberLabel")}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  aria-label={t("searchUsersToAddAria")}
                  placeholder={t("searchUsersPlaceholder")}
                  className="pl-8"
                  value={addUserSearch}
                  disabled={selectedIsExternal}
                  onChange={(e) => {
                    setAddUserSearch(e.target.value);
                    setAddUserId("");
                  }}
                />
              </div>
              <Select
                value={addUserId}
                onValueChange={setAddUserId}
                disabled={selectedIsExternal}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectUserPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u: User) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name || u.username} ({u.username})
                    </SelectItem>
                  ))}
                  {availableUsers.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {addUserSearch
                        ? t("noUsersMatch")
                        : t("noUsersAvailable")}
                    </div>
                  )}
                </SelectContent>
              </Select>
              <ListTruncationNotice
                shown={allUsers.length}
                total={pickerTotal}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper so the tooltip fires on the disabled button */}
                <span className="inline-flex">
                  <Button
                    size="sm"
                    disabled={
                      selectedIsExternal ||
                      !addUserId ||
                      addMemberMutation.isPending
                    }
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
                    {t("add")}
                  </Button>
                </span>
              </TooltipTrigger>
              {selectedIsExternal && (
                <TooltipContent>{t(SSO_DISABLED_KEY)}</TooltipContent>
              )}
            </Tooltip>
          </div>

          <Separator />

          {/* Member list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {t("membersCount", { count: members.length })}
              </Label>
              {members.length > 5 && (
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    aria-label={t("filterMembersAria")}
                    placeholder={t("filterMembersPlaceholder")}
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
                  {t("loadingMembers")}
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  {members.length === 0
                    ? t("noMembersInGroup")
                    : t("noMembersMatch")}
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
                          <span className="inline-flex">
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
                              disabled={
                                selectedIsExternal ||
                                removeMemberMutation.isPending
                              }
                            >
                              <UserMinus className="size-3.5" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {selectedIsExternal ? t(SSO_DISABLED_KEY) : t("remove")}
                        </TooltipContent>
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
              {t("done")}
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
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: selectedGroup?.name ?? "" })}
        typeToConfirm={selectedGroup?.name}
        confirmText={t("deleteConfirm")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedGroup) deleteMutation.mutate(selectedGroup.id);
        }}
      />
    </div>
  );
}
