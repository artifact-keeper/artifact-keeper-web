"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { RepoDetailContent } from "./repo-detail-content";

interface RepoDetailPanelProps {
  repoKey: string;
}

export function RepoDetailPanel({ repoKey }: RepoDetailPanelProps) {
  return (
    // Radix's ScrollArea viewport wraps its children in a `display: table`
    // div that sizes to the widest descendant, so a wide tab strip or table
    // made the detail pane wider than its panel and the right side was cut
    // off (or, before the layout's min-w-0, widened the whole page). Forcing
    // that wrapper to `block` bounds the content by the panel; wide tables
    // keep their own horizontal scroll.
    <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:!block">
      <div className="p-4 min-w-0">
        <RepoDetailContent repoKey={repoKey} />
      </div>
    </ScrollArea>
  );
}
