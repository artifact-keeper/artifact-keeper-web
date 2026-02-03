"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { RepoDetailContent } from "./repo-detail-content";

interface RepoDetailPanelProps {
  repoKey: string;
}

export function RepoDetailPanel({ repoKey }: RepoDetailPanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <RepoDetailContent repoKey={repoKey} />
      </div>
    </ScrollArea>
  );
}
