"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { useProjectMembers } from "@/hooks/use-projects";
import { projectsApi } from "@/lib/api/projects";
import { mutationErrorToast } from "@/lib/error-utils";
import { invalidateGroup, QUERY_KEYS } from "@/lib/query-keys";
import { formatQuota } from "@/lib/project-utils";
import { useAuth } from "@/providers/auth-provider";
import { useActiveProject } from "@/providers/project-provider";
import { FolderKanban } from "lucide-react";
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from "../_components/project-form-dialog";
import { ProjectMembersTab } from "./_components/project-members-tab";
import { ProjectReposTab } from "./_components/project-repos-tab";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeProject, setActiveProjectId } = useActiveProject();
  const isGlobalAdmin = user?.is_admin ?? false;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: project, isLoading, isError } = useQuery({
    queryKey: [...QUERY_KEYS.PROJECTS, id],
    queryFn: () => projectsApi.get(id),
  });
  const { data: members = [] } = useProjectMembers(id);

  // The backend decides; this only controls whether the controls are shown.
  const isProjectAdmin = members.some(
    (m) => m.principal_type === "user" && m.principal_id === user?.id && m.actions.includes("admin"),
  );
  const canManage = isGlobalAdmin || isProjectAdmin;

  const updateMutation = useMutation({
    mutationFn: (v: ProjectFormValues) =>
      projectsApi.update(id, {
        name: v.name,
        description: v.description,
        ...(isGlobalAdmin ? { quota_bytes: v.quota_bytes ?? 0 } : {}),
      }),
    onSuccess: () => {
      toast.success("Project updated");
      invalidateGroup(queryClient, "projects");
      setEditOpen(false);
    },
    onError: mutationErrorToast("Failed to update project"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id),
    onSuccess: () => {
      toast.success("Project deleted");
      if (activeProject?.id === id) setActiveProjectId(null);
      invalidateGroup(queryClient, "projects");
      router.push("/projects");
    },
    onError: mutationErrorToast("Failed to delete project"),
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (isError || !project) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        description="It may have been deleted, or you may not have access to it."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/projects">
          <ArrowLeft className="size-4" />
          Projects
        </Link>
      </Button>
      <PageHeader
        title={project.name}
        description={project.description || `Project key: ${project.key}`}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              {isGlobalAdmin && (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            </>
          )
        }
      />
      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Key</dt>
          <dd>
            <code>{project.key}</code>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Storage quota</dt>
          <dd>{formatQuota(project.quota_bytes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(project.created_at).toLocaleDateString()}</dd>
        </div>
      </dl>
      <Tabs defaultValue="repositories">
        <TabsList>
          <TabsTrigger value="repositories">Repositories</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="repositories" className="pt-4">
          <ProjectReposTab
            projectId={project.id}
            projectKey={project.key}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <ProjectMembersTab
            projectId={project.id}
            canManage={canManage}
            isGlobalAdmin={isGlobalAdmin}
          />
        </TabsContent>
      </Tabs>
      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        canEditQuota={isGlobalAdmin}
        pending={updateMutation.isPending}
        onSubmit={(v) => updateMutation.mutate(v)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project"
        description="Its repositories are not deleted but are no longer part of the project, and its member roles are removed."
        confirmText="Delete"
        typeToConfirm={project.key}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
