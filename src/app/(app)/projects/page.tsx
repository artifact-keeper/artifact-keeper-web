"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { useProjects } from "@/hooks/use-projects";
import { projectsApi, type Project } from "@/lib/api/projects";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { formatQuota } from "@/lib/project-utils";
import { useAuth } from "@/providers/auth-provider";
import { ProjectFormDialog, type ProjectFormValues } from "./_components/project-form-dialog";

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;
  const [createOpen, setCreateOpen] = useState(false);

  const { data: projects = [], isLoading, isError, error } = useProjects();

  const createMutation = useMutation({
    mutationFn: (v: ProjectFormValues) =>
      projectsApi.create({
        key: v.key,
        name: v.name,
        description: v.description || undefined,
        quota_bytes: v.quota_bytes,
      }),
    onSuccess: (project) => {
      toast.success("Project created");
      invalidateGroup(queryClient, "projects");
      setCreateOpen(false);
      router.push(`/projects/${project.id}`);
    },
    onError: mutationErrorToast("Failed to create project"),
  });

  const columns: DataTableColumn<Project>[] = [
    {
      id: "key",
      header: "Key",
      accessor: (p) => p.key,
      sortable: true,
      cell: (p) => <code className="text-xs">{p.key}</code>,
    },
    { id: "name", header: "Name", accessor: (p) => p.name, sortable: true },
    {
      id: "description",
      header: "Description",
      cell: (p) => (
        <span className="text-muted-foreground">{p.description || "-"}</span>
      ),
    },
    {
      id: "quota",
      header: "Storage quota",
      accessor: (p) => p.quota_bytes ?? 0,
      sortable: true,
      cell: (p) => formatQuota(p.quota_bytes),
    },
    {
      id: "created",
      header: "Created",
      accessor: (p) => p.created_at,
      sortable: true,
      cell: (p) => new Date(p.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Group repositories and control who can access them."
        actions={
          isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New project
            </Button>
          )
        }
      />
      {!isAdmin && !isError && (
        <p className="mb-4 text-sm text-muted-foreground">
          Showing the projects you administer. Ask an administrator if a project you belong to is missing.
        </p>
      )}
      {isError ? (
        <EmptyState
          icon={FolderKanban}
          title="Could not load projects"
          description={toUserMessage(error, "The project list could not be loaded.")}
        />
      ) : !isLoading && projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={
            isAdmin
              ? "Create a project to group repositories and manage access to them together."
              : "You are not a member of any project."
          }
          action={
            isAdmin && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New project
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={projects}
          loading={isLoading}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/projects/${p.id}`)}
          emptyMessage="No projects"
        />
      )}
      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canEditQuota={isAdmin}
        pending={createMutation.isPending}
        onSubmit={(v) => createMutation.mutate(v)}
      />
    </div>
  );
}
