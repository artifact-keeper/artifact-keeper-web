"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useActiveProject } from "@/providers/project-provider";
import { cn } from "@/lib/utils";

/**
 * Scopes the repository views to one project. A searchable, scrollable list so
 * it still works with many projects. Hidden until a project exists.
 */
export function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;

  const choose = (id: string | null) => {
    setActiveProjectId(id);
    setOpen(false);
  };

  return (
    <SidebarGroup className="pb-0">
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <SidebarMenuButton
                aria-label="Switch project"
                tooltip={activeProject?.name ?? "All projects"}
                className="border"
              >
                <FolderKanban className="size-4" />
                <span className="flex-1 truncate">{activeProject?.name ?? "All projects"}</span>
                <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent align="start" side="right" className="w-64 p-0">
              <Command
                // Match on the key as well as the name; the value must be unique per row.
                filter={(value, search) =>
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }
              >
                <CommandInput placeholder="Search projects..." />
                <CommandList className="max-h-72">
                  <CommandEmpty>No project found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="all projects" onSelect={() => choose(null)}>
                      <span className="flex-1">All projects</span>
                      <Check className={cn("size-4", activeProject ? "opacity-0" : "opacity-100")} />
                    </CommandItem>
                    {projects.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.name} ${p.key} ${p.id}`}
                        onSelect={() => choose(p.id)}
                      >
                        <span className="flex-1 truncate">{p.name}</span>
                        <code className="text-xs text-muted-foreground">{p.key}</code>
                        <Check
                          className={cn("size-4", activeProject?.id === p.id ? "opacity-100" : "opacity-0")}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
