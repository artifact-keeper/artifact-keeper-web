"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

import { useRepositories } from "@/hooks/use-repositories";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository, VirtualRepoMember } from "@/types";
import { REPO_TYPE_COLORS } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface VirtualMembersPanelProps {
  repository: Repository;
}

export function VirtualMembersPanel({ repository }: VirtualMembersPanelProps) {
  const t = useTranslations("virtualMembers");
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<VirtualRepoMember | null>(null);

  // Fetch members for this virtual repo
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["virtual-members", repository.key],
    queryFn: () => repositoriesApi.listMembers(repository.key),
    enabled: repository.repo_type === "virtual",
  });

  // Fetch all repositories to find eligible members
  const { data: allReposData, isLoading: reposLoading } = useRepositories(
    { per_page: 1000 },
    { enabled: addDialogOpen },
  );

  const members = useMemo(() => membersData?.members ?? [], [membersData?.members]);
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.priority - b.priority),
    [members]
  );

  // Filter eligible repos: same format, local or remote only, not already a member
  const eligibleRepos = useMemo(() => {
    const items = allReposData?.items;
    if (!items) return [];
    const memberKeys = new Set(members.map((m) => m.member_repo_key));
    return items.filter(
      (r) =>
        (r.repo_type === "local" || r.repo_type === "remote") &&
        r.format === repository.format &&
        !memberKeys.has(r.key) &&
        r.key !== repository.key
    );
  }, [allReposData, members, repository.format, repository.key]);

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: (memberKey: string) =>
      repositoriesApi.addMember(repository.key, memberKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["virtual-members", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      toast.success(t("added"));
    },
    onError: mutationErrorToast(t("addFailed")),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberKey: string) =>
      repositoriesApi.removeMember(repository.key, memberKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["virtual-members", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      toast.success(t("removed"));
    },
    onError: mutationErrorToast(t("removeFailed")),
  });

  const reorderMutation = useMutation({
    mutationFn: (newOrder: { member_key: string; priority: number }[]) =>
      repositoriesApi.reorderMembers(repository.key, newOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["virtual-members", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
    },
    onError: mutationErrorToast(t("reorderFailed")),
  });

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...sortedMembers];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    reorderMutation.mutate(
      newOrder.map((m, i) => ({ member_key: m.member_repo_key, priority: i + 1 }))
    );
  };

  const handleMoveDown = (index: number) => {
    if (index === sortedMembers.length - 1) return;
    const newOrder = [...sortedMembers];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    reorderMutation.mutate(
      newOrder.map((m, i) => ({ member_key: m.member_repo_key, priority: i + 1 }))
    );
  };

  const handleRemoveClick = (member: VirtualRepoMember) => {
    setMemberToRemove(member);
    setRemoveDialogOpen(true);
  };

  const handleAddMember = (memberKey: string) => {
    addMemberMutation.mutate(memberKey);
    setAddDialogOpen(false);
  };

  if (membersLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("title")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("description")}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      {sortedMembers.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-muted-foreground">
          <p className="text-sm">{t("empty")}</p>
          <p className="text-xs mt-1">
            {t("emptyDetail")}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {sortedMembers.map((member, index) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 hover:bg-muted/50"
            >
              <div className="flex flex-col gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || reorderMutation.isPending}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("moveUp")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === sortedMembers.length - 1 || reorderMutation.isPending}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("moveDown")}</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {member.member_repo_key}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {t("priority", { priority: member.priority })}
                  </Badge>
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveClick(member)}
                    disabled={removeMemberMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("removeTooltip")}</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>
              {t("addDescription", { format: repository.format.toUpperCase() })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {reposLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : eligibleRepos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">{t("noEligible")}</p>
                <p className="text-xs mt-1">
                  {t("noEligibleDetail", { format: repository.format.toUpperCase() })}
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {eligibleRepos.map((repo) => (
                  <button
                    key={repo.key}
                    className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted text-left"
                    onClick={() => handleAddMember(repo.key)}
                    disabled={addMemberMutation.isPending}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{repo.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {repo.key}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        REPO_TYPE_COLORS[repo.repo_type] ?? ""
                      }`}
                    >
                      {repo.repo_type}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <ListTruncationNotice
              className="mt-3"
              shown={allReposData?.items.length ?? 0}
              total={allReposData?.pagination?.total ?? 0}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={t("removeTitle")}
        description={t("removeDescription", {
          key: memberToRemove?.member_repo_key ?? "",
        })}
        confirmText={t("removeConfirm")}
        danger
        loading={removeMemberMutation.isPending}
        onConfirm={() => {
          if (memberToRemove) {
            removeMemberMutation.mutate(memberToRemove.member_repo_key);
          }
        }}
      />
    </div>
  );
}
