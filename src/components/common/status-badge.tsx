import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusColor = "green" | "yellow" | "red" | "blue" | "purple" | "default";

interface StatusBadgeProps {
  status: string;
  color?: StatusColor;
  className?: string;
}

const colorClasses: Record<StatusColor, string> = {
  green:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  yellow:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  red:
    "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800",
  blue:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  purple:
    "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  default:
    "bg-secondary text-secondary-foreground border-border",
};

/**
 * Derive a color from a health/status string automatically.
 */
function autoColor(status: string): StatusColor {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "ok" || s === "up" || s === "active" || s === "local") return "green";
  if (s === "degraded" || s === "warning" || s === "remote") return "yellow";
  if (s === "unhealthy" || s === "down" || s === "error") return "red";
  if (s === "virtual") return "purple";
  return "default";
}

export function StatusBadge({ status, color, className }: StatusBadgeProps) {
  const resolvedColor = color ?? autoColor(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium capitalize",
        colorClasses[resolvedColor],
        className
      )}
    >
      {status}
    </Badge>
  );
}
