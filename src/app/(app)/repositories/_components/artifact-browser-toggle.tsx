"use client";

import { List, Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RepositoryFormat } from "@/types";

export type ArtifactViewMode = "flat" | "grouped";

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

export function supportsGrouping(format: RepositoryFormat): boolean {
  return GROUPABLE_FORMATS.has(format);
}

interface ArtifactBrowserToggleProps {
  value: ArtifactViewMode;
  onChange: (next: ArtifactViewMode) => void;
  /** Repository format — toggle only renders for groupable formats. */
  format: RepositoryFormat;
  className?: string;
}

/**
 * Two-state toggle between flat artifact list and grouped (by Maven
 * component or Docker tag) view.  Renders nothing for formats that don't
 * support grouping.
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
  if (!supportsGrouping(format)) return null;

  const groupedLabel = format === "docker" ? "Group by tag" : "Group by component";

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
        className="h-7 px-2 text-xs"
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
        variant={value === "grouped" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        aria-pressed={value === "grouped"}
        aria-label={groupedLabel}
        data-testid="toggle-grouped"
        onClick={() => onChange("grouped")}
      >
        <Boxes className="size-3.5" aria-hidden="true" />
        Grouped
      </Button>
    </div>
  );
}
