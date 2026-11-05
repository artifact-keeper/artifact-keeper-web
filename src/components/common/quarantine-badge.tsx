import { ShieldAlert, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatQuarantineExpiry,
  QUARANTINE_BADGE_LABELS,
  type QuarantineBadgeKind,
} from "@/lib/quarantine";

interface QuarantineBadgeProps {
  reason?: string | null;
  quarantineUntil?: string | null;
  className?: string;
  /**
   * The hold is a conda channel withdrawal (backend artifact-keeper#4059): a
   * permanent hold that also drops the package from repodata and names it in
   * `removed`. Labelled as such instead of "Quarantined".
   */
  withdrawn?: boolean;
  /**
   * Which state to badge (see `quarantineBadgeKind`). Defaults to a plain
   * hold, or `withdrawn` when that flag is set. A rejected artifact must pass
   * `"rejected"` so it is not labelled "Quarantined" (#1085).
   */
  kind?: QuarantineBadgeKind;
}

const HOLD_STYLE =
  "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
const REJECTED_STYLE =
  "border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/60 dark:bg-destructive/20";

/**
 * Compact badge indicating that an artifact is held, policy-refused,
 * withdrawn or rejected.
 * Used in table rows and list items. Shows the reason and expiry
 * in a tooltip on hover.
 */
export function QuarantineBadge({
  reason,
  quarantineUntil,
  className,
  withdrawn,
  kind,
}: QuarantineBadgeProps) {
  const resolvedKind: QuarantineBadgeKind =
    kind ?? (withdrawn ? "withdrawn" : "held");
  const label = QUARANTINE_BADGE_LABELS[resolvedKind];
  const rejected = resolvedKind === "rejected";
  const Icon = rejected ? ShieldX : ShieldAlert;
  // A rejection is final, so a hold-lapse expiry is meaningless for it.
  const expiry = rejected ? null : formatQuarantineExpiry(quarantineUntil);

  const tooltipLines: string[] = [];
  if (reason) tooltipLines.push(reason);
  if (expiry) tooltipLines.push(expiry);

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        rejected ? REJECTED_STYLE : HOLD_STYLE,
        "gap-1",
        className
      )}
      aria-label={label}
    >
      <Icon className="size-3" aria-hidden="true" />
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
          {reason && <p>{reason}</p>}
          {expiry && (
            <p className="text-muted-foreground">{expiry}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
