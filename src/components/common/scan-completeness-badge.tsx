import { AlertTriangle, CheckCircle2, FileQuestion, type LucideIcon } from "lucide-react";
import { createElement } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CompletenessStatus } from "@/types/package-analysis";

interface ScanCompletenessBadgeProps {
  /** Raw completeness status; known values get dedicated styling. */
  status: CompletenessStatus | string;
  reason?: string | null;
  filesRead?: number | null;
  filesTotal?: number | null;
  className?: string;
}

interface CompletenessConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

// Emerald is reserved for the one status where the analyzer actually looked
// at everything. `not_read` / `unsupported` are neutral on purpose: they are
// neither a failure (never red) nor a clean bill (never green) — the package
// simply was not inspected.
const NEUTRAL_CLASS =
  "border-border bg-muted text-muted-foreground";

const COMPLETENESS_CONFIG: Record<CompletenessStatus, CompletenessConfig> = {
  complete: {
    label: "Contents inspected",
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  partial: {
    label: "Partially inspected",
    icon: AlertTriangle,
    className:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  },
  not_read: {
    label: "Contents not inspected",
    icon: FileQuestion,
    className: NEUTRAL_CLASS,
  },
  unsupported: {
    label: "Inspection not supported",
    icon: FileQuestion,
    className: NEUTRAL_CLASS,
  },
};

function isKnownStatus(value: string): value is CompletenessStatus {
  return value in COMPLETENESS_CONFIG;
}

/**
 * Human-readable label for a completeness status. An unrecognized value is
 * returned verbatim (the `scanTypeLabel` precedent) so a status the web
 * doesn't model yet is still readable.
 */
export function completenessLabel(status: string): string {
  return isKnownStatus(status) ? COMPLETENESS_CONFIG[status].label : status;
}

/**
 * Badge summarising how much of a package the analyzer read, modeled on
 * `QuarantineBadge` (badge + tooltip). The tooltip carries the files-read
 * ratio for a partial read and the backend's reason for anything short of
 * `complete`.
 */
export function ScanCompletenessBadge({
  status,
  reason,
  filesRead,
  filesTotal,
  className,
}: ScanCompletenessBadgeProps) {
  const config = isKnownStatus(status) ? COMPLETENESS_CONFIG[status] : null;
  const label = completenessLabel(status);

  const tooltipLines: string[] = [];
  if (
    status === "partial" &&
    filesRead != null &&
    filesTotal != null
  ) {
    tooltipLines.push(`${filesRead} of ${filesTotal} files read`);
  }
  if (reason) tooltipLines.push(reason);

  const badge = (
    <Badge
      variant="outline"
      className={cn("gap-1", config?.className ?? NEUTRAL_CLASS, className)}
      aria-label={label}
      data-testid="scan-completeness"
      data-status={status}
    >
      {createElement(config?.icon ?? FileQuestion, {
        className: "size-3",
        "aria-hidden": true,
      })}
      {label}
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
          {tooltipLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
