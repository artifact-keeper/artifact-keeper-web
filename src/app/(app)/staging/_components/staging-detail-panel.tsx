"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { StagingDetailContent } from "./staging-detail-content";

interface StagingDetailPanelProps {
  repoKey: string;
}

export function StagingDetailPanel({ repoKey }: StagingDetailPanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <StagingDetailContent repoKey={repoKey} />
      </div>
    </ScrollArea>
  );
}
