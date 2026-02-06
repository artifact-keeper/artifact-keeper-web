"use client";

import { Package, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import type { Repository } from "@/types";
import { formatBytes, cn } from "@/lib/utils";

interface StagingListItemProps {
  repo: Repository;
  isSelected: boolean;
  onSelect: (repo: Repository) => void;
  artifactCount?: number;
  policyStats?: {
    passing: number;
    failing: number;
    warning: number;
    pending: number;
  };
}

export function StagingListItem({
  repo,
  isSelected,
  onSelect,
  artifactCount,
  policyStats,
}: StagingListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(repo)}
      className={cn(
        "group w-full text-left px-3 py-2.5 border-l-2 border-transparent hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent border-l-primary"
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Package className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{repo.key}</span>
          </div>
          {repo.name !== repo.key && (
            <p className="text-xs text-muted-foreground truncate">{repo.name}</p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] font-medium uppercase text-muted-foreground">
              {repo.format}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground">
              {formatBytes(repo.storage_used_bytes)}
            </span>
            {artifactCount !== undefined && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">
                  {artifactCount} artifact{artifactCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          {policyStats && (
            <div className="flex items-center gap-2 mt-1">
              {policyStats.passing > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                  <CheckCircle className="size-2.5" />
                  {policyStats.passing}
                </span>
              )}
              {policyStats.failing > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400">
                  <XCircle className="size-2.5" />
                  {policyStats.failing}
                </span>
              )}
              {policyStats.warning > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="size-2.5" />
                  {policyStats.warning}
                </span>
              )}
              {policyStats.pending > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                  <Clock className="size-2.5" />
                  {policyStats.pending}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
