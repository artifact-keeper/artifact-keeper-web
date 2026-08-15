"use client";

import { useTranslations } from "next-intl";
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
  /**
   * Resolved format label (#592). For repos backed by a WASM plugin layout
   * (`format: "generic"` + `format_key`) the parent passes the plugin layout
   * name so the row does not show a bare "GENERIC"; defaults to `repo.format`.
   */
  formatLabel?: string;
}

export function RepoListItem({ repo, isSelected, onSelect, onEdit, onDelete, artifactMatchCount, formatLabel }: RepoListItemProps) {
  const t = useTranslations("app/repositories/_components/repo-list-item");
  // #672: the row's primary action is a real <button> that is a SIBLING of the
  // actions dropdown trigger — never an ancestor — so no interactive element
  // nests inside another and the row's accessible name stays clean (it no
  // longer concatenates the "Repository actions" label).
  return (
    <div
      className={cn(
        "group flex items-start w-full border-l-2 border-transparent hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent border-l-primary"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(repo)}
        className="flex-1 min-w-0 text-left px-3 py-2.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-start gap-2 min-w-0">
          <Package className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{repo.key}</span>
              {!repo.is_public && <Lock className="size-3 shrink-0 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground truncate" aria-hidden={repo.name === repo.key}>
              {repo.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">
                {formatLabel ?? repo.format}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                data-type={repo.repo_type}
                className={cn("text-[11px] font-medium", REPO_TYPE_COLORS[repo.repo_type] ? "" : "text-muted-foreground")}
              >
                <span className={cn("inline-block size-1.5 rounded-full mr-1",
                  repo.repo_type === "local" ? "bg-green-500" :
                  repo.repo_type === "remote" ? "bg-blue-500" : "bg-purple-500"
                )} />
                {t(`typeLabels.${repo.repo_type}`)}
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
                  {t("artifactMatch", { count: artifactMatchCount })}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>
      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 mt-2.5 mr-3 text-muted-foreground hover:text-foreground"
              aria-label={t("actionsFor", { name: repo.name })}
            >
              <Settings className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(repo)}>
                <Pencil className="size-3.5 mr-2" />
                {t("edit")}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(repo)}>
                <Trash2 className="size-3.5 mr-2" />
                {t("delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
