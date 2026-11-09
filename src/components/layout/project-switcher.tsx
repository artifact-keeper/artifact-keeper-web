"use client";

import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveProject } from "@/providers/project-provider";

/** Scopes the repository views to one project. Hidden until a project exists. */
export function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId } = useActiveProject();
  if (projects.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-48 gap-2"
          aria-label="Switch project"
        >
          <FolderKanban className="size-4 shrink-0" />
          <span className="truncate">{activeProject?.name ?? "All projects"}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setActiveProjectId(null)}>
          <span className="flex-1">All projects</span>
          {!activeProject && <Check className="size-4" />}
        </DropdownMenuItem>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => setActiveProjectId(p.id)}>
            <span className="flex-1 truncate">{p.name}</span>
            {activeProject?.id === p.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
