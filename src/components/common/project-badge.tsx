"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/providers/project-provider";

/**
 * Names the project a repository belongs to. Renders nothing when the
 * repository has no project, or when the caller cannot see that project
 * (the project list is limited for non-administrators).
 */
export function ProjectBadge({ projectId }: { projectId?: string }) {
  const { projects } = useActiveProject();
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  if (!project) return null;
  return (
    <Badge variant="outline" asChild className="text-xs font-normal">
      <Link href={`/projects/${project.id}`} title={`Project: ${project.name}`}>
        <FolderKanban className="size-3" aria-hidden="true" />
        {project.name}
      </Link>
    </Badge>
  );
}
