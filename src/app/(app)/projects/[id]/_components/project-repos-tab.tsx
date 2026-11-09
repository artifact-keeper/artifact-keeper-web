"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useRepositories } from "@/hooks/use-repositories";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { formatBytes } from "@/lib/utils";
import type { Repository } from "@/types";

interface ProjectReposTabProps {
  projectId: string;
  projectKey: string;
  canManage: boolean;
}

export function ProjectReposTab({
  projectId,
  projectKey,
  canManage,
}: ProjectReposTabProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useRepositories({ project: projectId, per_page: 1000 });
  const repos = data?.items ?? [];
  const [assignOpen, setAssignOpen] = useState(false);
  const [removing, setRemoving] = useState<Repository | null>(null);

  const refresh = () => invalidateGroup(queryClient, "projects");

  const unassign = useMutation({
    mutationFn: (repo: Repository) => repositoriesApi.update(repo.key, { project_id: null }),
    onSuccess: () => {
      toast.success("Repository removed from project");
      refresh();
      setRemoving(null);
    },
    onError: mutationErrorToast("Failed to remove repository from project"),
  });

  const columns: DataTableColumn<Repository>[] = [
    {
      id: "key",
      header: "Repository",
      accessor: (r) => r.key,
      sortable: true,
      cell: (r) => (
        <Link
          href={`/repositories/${encodeURIComponent(r.key)}`}
          className="font-medium hover:underline"
        >
          {r.key}
        </Link>
      ),
    },
    {
      id: "format",
      header: "Format",
      accessor: (r) => r.format,
      sortable: true,
      cell: (r) => <Badge variant="outline">{r.format}</Badge>,
    },
    {
      id: "type",
      header: "Type",
      accessor: (r) => r.repo_type,
      sortable: true,
    },
    {
      id: "storage",
      header: "Storage",
      accessor: (r) => r.storage_used_bytes,
      sortable: true,
      cell: (r) => formatBytes(r.storage_used_bytes),
    },
    ...(canManage
      ? [
          {
            id: "remove",
            header: <span className="sr-only">Remove from project</span>,
            cell: (r: Repository) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${r.key} from project`}
                onClick={() => setRemoving(r)}
              >
                <Unlink className="size-4" />
              </Button>
            ),
          } satisfies DataTableColumn<Repository>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Repositories in this project inherit the project&apos;s member roles. Name new repositories
          <code className="mx-1">{projectKey}-...</code>; other projects cannot use that prefix.
        </p>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              Add existing
            </Button>
            <Button size="sm" asChild>
              <Link href={`/repositories?new=1&project=${projectId}`}>
                <Plus className="size-4" />
                New repository
              </Link>
            </Button>
          </div>
        )}
      </div>
      {isError ? (
        <EmptyState
          icon={Database}
          title="Could not load repositories"
          description={toUserMessage(error, "The repository list could not be loaded.")}
        />
      ) : !isLoading && repos.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No repositories"
          description="Create a repository in this project, or move an existing one in."
        />
      ) : (
        <DataTable
          columns={columns}
          data={repos}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyMessage="No repositories"
        />
      )}
      <AssignRepoDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        projectId={projectId}
        onAssigned={refresh}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove from project"
        description={`${removing?.key ?? "The repository"} stays as it is but is no longer part of this project, so project members lose the access they got through it.`}
        confirmText="Remove"
        danger
        loading={unassign.isPending}
        onConfirm={() => removing && unassign.mutate(removing)}
      />
    </div>
  );
}

function AssignRepoDialog({
  open,
  onOpenChange,
  projectId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onAssigned: () => void;
}) {
  const [repoKey, setRepoKey] = useState("");
  const { data } = useRepositories({ per_page: 1000 }, { enabled: open });
  const candidates = (data?.items ?? []).filter((r) => r.project_id !== projectId);

  const assign = useMutation({
    mutationFn: () => repositoriesApi.update(repoKey, { project_id: projectId }),
    onSuccess: () => {
      toast.success("Repository added to project");
      onAssigned();
      setRepoKey("");
      onOpenChange(false);
    },
    onError: mutationErrorToast("Failed to add repository to project"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add existing repository</DialogTitle>
          <DialogDescription>
            The backend refuses a key that uses another project&apos;s prefix.
            A repository already in another project is moved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="assign-repo">Repository</Label>
          <Select value={repoKey} onValueChange={setRepoKey}>
            <SelectTrigger id="assign-repo">
              <SelectValue placeholder="Select a repository" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((r) => (
                <SelectItem key={r.id} value={r.key}>
                  {r.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!repoKey || assign.isPending} onClick={() => assign.mutate()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
