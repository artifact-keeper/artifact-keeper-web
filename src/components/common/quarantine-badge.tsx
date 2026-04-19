import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatQuarantineExpiry } from "@/lib/quarantine";

interface QuarantineBadgeProps {
  reason?: string | null;
  quarantineUntil?: string | null;
  className?: string;
}

/**
 * Compact badge indicating that an artifact is quarantined.
 * Used in table rows and list items. Shows the reason and expiry
 * in a tooltip on hover.
 */
export function QuarantineBadge({
  reason,
  quarantineUntil,
  className,
}: QuarantineBadgeProps) {
  const expiry = formatQuarantineExpiry(quarantineUntil);

  const tooltipLines: string[] = [];
  if (reason) tooltipLines.push(reason);
  if (expiry) tooltipLines.push(expiry);

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400 gap-1",
        className
      )}
      aria-label="Quarantined"
    >
      <ShieldAlert className="size-3" aria-hidden="true" />
      Quarantined
    </Badge>
  );

  if (tooltipLines.length === 0) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          {reason && <p>{reason}</p>}
          {expiry && (
            <p className="text-muted-foreground">{expiry}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
