import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MCP_RISK_LEVEL_LABEL, type McpRiskLevel, type McpRiskSignal, type McpRiskTone } from "@/lib/mcp/risk";

const TONE: Record<McpRiskTone, string> = {
  neutral: "bg-secondary text-secondary-foreground border-border",
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800",
};

const LEVEL_TONE: Record<McpRiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  medium: TONE.amber,
  high: TONE.red,
  critical: cn(TONE.red, "font-semibold"),
};

/**
 * Risk signals as text badges. Each one explains itself: the reason is the
 * tooltip and is duplicated into the accessible name, so it does not depend
 * on hover or on colour.
 */
export function McpRiskBadges({ signals, max }: { signals: McpRiskSignal[]; max?: number }) {
  if (signals.length === 0) return null;
  const shown = max !== undefined ? signals.slice(0, max) : signals;
  const hidden = signals.length - shown.length;
  return (
    <ul aria-label="Risk signals" className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <li key={s.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                tabIndex={0}
                aria-label={`${s.label}: ${s.reason}`}
                className={cn("border font-normal", TONE[s.tone])}
              >
                {s.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{s.reason}</TooltipContent>
          </Tooltip>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            +{hidden} more
          </Badge>
        </li>
      )}
    </ul>
  );
}

/** The overall reading aid (`Low` .. `Critical`), never an approval. */
export function McpRiskLevelBadge({ level, score }: { level: McpRiskLevel; score?: number }) {
  const label = `${MCP_RISK_LEVEL_LABEL[level]} risk`;
  return (
    <Badge variant="outline" className={cn("border", LEVEL_TONE[level])}>
      {label}
      {score !== undefined && <span className="tabular-nums opacity-80">({score})</span>}
    </Badge>
  );
}
