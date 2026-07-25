"use client";

import { List, Boxes, FolderTree } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RepositoryFormat } from "@/types";

export type ArtifactViewMode = "flat" | "grouped" | "tree";

/**
 * Repository formats for which a "grouped" artifact view is meaningful.
 * Maven/Gradle use server-side `group_by=maven_component` (#254).  Docker
 * uses client-side aggregation by manifest tag (#330).
 */
const GROUPABLE_FORMATS = new Set<RepositoryFormat>([
  "maven",
  "gradle",
  "docker",
]);

/**
 * Repository formats for which a folder-tree view is meaningful (issue #2791).
 * RAW/Generic repos have no package/version semantics — just files at arbitrary
 * paths — so a directory tree built client-side from the flat artifact list is
 * the natural way to browse them.
 */
const TREE_FORMATS = new Set<RepositoryFormat>(["generic"]);

export function supportsGrouping(format: RepositoryFormat): boolean {
  return GROUPABLE_FORMATS.has(format);
}

export function supportsTree(format: RepositoryFormat): boolean {
  return TREE_FORMATS.has(format);
}

interface ArtifactBrowserToggleProps {
  value: ArtifactViewMode;
  onChange: (next: ArtifactViewMode) => void;
  /** Repository format — toggle only renders for formats that offer an
   *  alternate (grouped or tree) view. */
  format: RepositoryFormat;
  className?: string;
}

/**
 * Two-state toggle between the flat artifact list and an alternate view. The
 * alternate is format-dependent: groupable formats (Maven/Gradle/Docker) toggle
 * to a grouped view; RAW/Generic formats toggle to a folder tree (#2791).
 * Renders nothing for formats that offer neither.
 *
 * Behaves as a single-select radio group for screen readers: each button
 * exposes `aria-pressed` so the selected state is announced.
 */
export function ArtifactBrowserToggle({
  value,
  onChange,
  format,
  className,
}: ArtifactBrowserToggleProps) {
  const groupable = supportsGrouping(format);
  const treeable = supportsTree(format);
  if (!groupable && !treeable) return null;

  // Groupable formats keep their existing grouped alternate; otherwise offer
  // the folder-tree alternate.
  const altMode: ArtifactViewMode = groupable ? "grouped" : "tree";
  const altLabel = groupable
    ? format === "docker"
      ? "Group by tag"
      : "Group by component"
    : "Folder tree view";
  const AltIcon = groupable ? Boxes : FolderTree;

  return (
    <div
      role="group"
      aria-label="Artifact view mode"
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5",
        className,
      )}
      data-testid="artifact-browser-toggle"
    >
      <Button
        type="button"
        variant={value === "flat" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-3 text-xs"
        aria-pressed={value === "flat"}
        aria-label="Flat list view"
        data-testid="toggle-flat"
        onClick={() => onChange("flat")}
      >
        <List className="size-3.5" aria-hidden="true" />
        Flat
      </Button>
      <Button
        type="button"
        variant={value === altMode ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-3 text-xs"
        aria-pressed={value === altMode}
        aria-label={altLabel}
        data-testid={groupable ? "toggle-grouped" : "toggle-tree"}
        onClick={() => onChange(altMode)}
      >
        <AltIcon className="size-3.5" aria-hidden="true" />
        {groupable ? "Grouped" : "Tree"}
      </Button>
    </div>
  );
}
