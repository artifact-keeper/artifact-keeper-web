"use client";

import { useState } from "react";
import { ChevronRight, FileIcon, Package as PackageIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatBytes } from "@/lib/utils";
import type { MavenComponent } from "@/types";

interface MavenComponentListProps {
  components: MavenComponent[];
  loading?: boolean;
  emptyMessage?: string;
  /**
   * Total component count from the server.  Used for the "showing N of M"
   * helper text when paginated.  Optional.
   */
  total?: number;
}

/**
 * Renders Maven/Gradle artifacts grouped by GAV (groupId, artifactId,
 * version).  Each component row is a collapsible disclosure: collapsed it
 * shows summary stats; expanded it reveals the individual filenames (jar,
 * pom, checksums, …) that share the same coordinates.
 *
 * Source: backend ak#701 — `?group_by=maven_component`.
 */
export function MavenComponentList({
  components,
  loading = false,
  emptyMessage = "No components found.",
  total,
}: MavenComponentListProps) {
  if (loading) {
    return (
      <div className="space-y-2" data-testid="maven-component-list-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!components.length) {
    return (
      <div
        className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
        data-testid="maven-component-list-empty"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-md border" data-testid="maven-component-list">
      <ul className="divide-y" role="list">
        {components.map((c) => (
          <MavenComponentRow key={`${c.group_id}:${c.artifact_id}:${c.version}`} component={c} />
        ))}
      </ul>
      {typeof total === "number" && total > components.length && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          Showing {components.length} of {total} components
        </div>
      )}
    </div>
  );
}

interface MavenComponentRowProps {
  component: MavenComponent;
}

function MavenComponentRow({ component }: MavenComponentRowProps) {
  const [open, setOpen] = useState(false);
  const fileCount = component.artifact_files.length;

  return (
    <li
      className="text-sm"
      data-testid="maven-component-row"
      data-gav={`${component.group_id}:${component.artifact_id}:${component.version}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left",
              "hover:bg-muted/50 focus-visible:bg-muted/50",
            )}
            aria-expanded={open}
            aria-label={`${component.group_id}:${component.artifact_id}:${component.version}, ${fileCount} ${
              fileCount === 1 ? "file" : "files"
            }`}
          >
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
              aria-hidden="true"
            />
            <PackageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="truncate font-medium">
                <span className="text-muted-foreground">{component.group_id}</span>
                <span className="text-muted-foreground">:</span>
                <span>{component.artifact_id}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {component.version}
              </span>
            </div>
            <Badge variant="outline" className="font-normal">
              {fileCount} {fileCount === 1 ? "file" : "files"}
            </Badge>
            <span className="hidden text-xs text-muted-foreground sm:inline-block min-w-[60px] text-right">
              {formatBytes(component.size_bytes)}
            </span>
            <span className="hidden text-xs text-muted-foreground md:inline-block min-w-[80px] text-right">
              {component.download_count.toLocaleString()} dl
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul
            className="divide-y border-t bg-muted/20"
            data-testid="maven-component-files"
            role="list"
          >
            {component.artifact_files.map((filename) => (
              <li
                key={filename}
                className="flex items-center gap-2 px-12 py-2 text-xs text-muted-foreground"
              >
                <FileIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">{filename}</span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
