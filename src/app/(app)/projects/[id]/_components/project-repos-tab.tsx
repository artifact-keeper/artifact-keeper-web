"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Database, Plus, Unlink } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { useRepositories } from "@/hooks/use-repositories";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { formatBytes } from "@/lib/utils";
import type { Repository } from "@/types";

const PAGE_SIZE = 50;

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
  // The backend clamps per_page to 100, so a project with more repositories
  // needs real paging; asking for 1000 silently stopped at 100 (#988 review).
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, error } = useRepositories(
    { project: projectId, page, per_page: PAGE_SIZE },
    { keepPreviousData: true },
  );
  const repos = data?.items ?? [];
  const total = data?.pagination?.total ?? repos.length;
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
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          pageSizeOptions={[PAGE_SIZE]}
          loading={isLoading}
          fetching={isFetching && !isLoading}
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

/** The picker shows this many matches; more are reached by searching. */
const PICKER_LIMIT = 50;

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
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search).trim();

  // Searched on the server: loading "every repository" stopped at the
  // backend's 100-per-page clamp, so a repository past the first hundred
  // could not be added (#988 review).
  const { data, isFetching } = useRepositories(
    { q: deferredSearch || undefined, per_page: PICKER_LIMIT },
    { enabled: open, keepPreviousData: true },
  );
  const candidates = (data?.items ?? []).filter((r) => r.project_id !== projectId);
  const total = data?.pagination?.total ?? candidates.length;

  const assign = useMutation({
    mutationFn: () => repositoriesApi.update(repoKey, { project_id: projectId }),
    onSuccess: () => {
      toast.success("Repository added to project");
      onAssigned();
      setRepoKey("");
      setSearch("");
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
          <Label htmlFor="assign-repo-search">Find a repository</Label>
          <Input
            id="assign-repo-search"
            value={search}
            placeholder="Search by key or name..."
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul
            aria-label="Repositories"
            aria-busy={isFetching}
            className="max-h-56 overflow-y-auto rounded-md border"
          >
            {candidates.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {isFetching ? "Searching..." : "No repositories match."}
              </li>
            )}
            {candidates.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={repoKey === r.key}
                  onClick={() => setRepoKey(r.key)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50 ${
                    repoKey === r.key ? "bg-muted font-medium" : ""
                  }`}
                >
                  <span className="truncate">{r.key}</span>
                  {repoKey === r.key && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
          {total > PICKER_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Showing the first {PICKER_LIMIT} of {total}. Search to narrow the list.
            </p>
          )}
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
