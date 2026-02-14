import type { StagingArtifact } from "@/types/promotion";
import { formatBytes } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ArtifactListPreviewProps {
  artifacts: StagingArtifact[];
  height?: string;
  /** Optional content rendered on the right side of each artifact row. */
  renderTrailing?: (artifact: StagingArtifact) => React.ReactNode;
}

export function ArtifactListPreview({
  artifacts,
  height = "h-32",
  renderTrailing,
}: ArtifactListPreviewProps) {
  return (
    <div className="space-y-2">
      <Label>Selected Artifacts</Label>
      <ScrollArea className={`${height} rounded-md border`}>
        <div className="p-2 space-y-1">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="flex items-center justify-between text-sm py-1"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="truncate font-medium">{artifact.name}</span>
                {artifact.version && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal shrink-0"
                  >
                    {artifact.version}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatBytes(artifact.size_bytes)}
                </span>
                {renderTrailing?.(artifact)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
