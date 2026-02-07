"use client";

import { Lock, Settings, Pencil, Trash2, Package, Search } from "lucide-react";
import type { Repository } from "@/types";
import { formatBytes, REPO_TYPE_COLORS, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RepoListItemProps {
  repo: Repository;
  isSelected: boolean;
  onSelect: (repo: Repository) => void;
  onEdit?: (repo: Repository) => void;
  onDelete?: (repo: Repository) => void;
  artifactMatchCount?: number;
}

export function RepoListItem({ repo, isSelected, onSelect, onEdit, onDelete, artifactMatchCount }: RepoListItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(repo)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(repo); }}
      className={cn(
        "group w-full text-left px-3 py-2.5 border-l-2 border-transparent hover:bg-accent/50 transition-colors cursor-pointer",
        isSelected && "bg-accent border-l-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Package className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{repo.key}</span>
              {!repo.is_public && <Lock className="size-3 shrink-0 text-muted-foreground" />}
            </div>
            {repo.name !== repo.key && (
              <p className="text-xs text-muted-foreground truncate">{repo.name}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">
                {repo.format}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={cn("text-[11px] font-medium", REPO_TYPE_COLORS[repo.repo_type] ? "" : "text-muted-foreground")}>
                <span className={cn("inline-block size-1.5 rounded-full mr-1",
                  repo.repo_type === "local" ? "bg-green-500" :
                  repo.repo_type === "remote" ? "bg-blue-500" : "bg-purple-500"
                )} />
                {repo.repo_type}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">
                {formatBytes(repo.storage_used_bytes)}
              </span>
            </div>
            {artifactMatchCount && (
              <div className="flex items-center gap-1 mt-0.5">
                <Search className="size-2.5 text-blue-500" />
                <span className="text-[11px] text-blue-500">
                  {artifactMatchCount} artifact{artifactMatchCount > 1 ? "s" : ""} match
                </span>
              </div>
            )}
          </div>
        </div>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground hover:text-foreground">
                <Settings className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(repo); }}>
                  <Pencil className="size-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(repo); }}>
                  <Trash2 className="size-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
