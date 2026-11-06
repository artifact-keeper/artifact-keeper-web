import { CloudOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CACHE_ONLY_TOOLTIP, isCacheOnly, type UpstreamModeInfo } from "@/lib/upstream-mode";

/**
 * "Cache-only" badge for a Remote repository (#1094). Renders only when the
 * proxy enforces cache-only mode: the effective mode, so a Remote forced by
 * `PROXY_UPSTREAM_MODE=cache_only` is badged too. Renders nothing for an
 * online Remote and when the mode is unknown (older backend, still loading).
 */
export function CacheOnlyBadge({
  upstreamMode,
  className,
  focusable = true,
}: {
  upstreamMode: UpstreamModeInfo | null | undefined;
  className?: string;
  /**
   * Whether the badge takes keyboard focus to show its tooltip. Off inside an
   * interactive element (the repository list row is a button, #672), where
   * the tooltip still shows on hover and the label is part of the row's name.
   */
  focusable?: boolean;
}) {
  if (!isCacheOnly(upstreamMode)) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "border-amber-500/50 text-amber-700 dark:text-amber-400 font-normal",
            className,
          )}
          {...(focusable ? { tabIndex: 0, "aria-label": CACHE_ONLY_TOOLTIP } : {})}
        >
          <CloudOff aria-hidden="true" />
          Cache-only
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{CACHE_ONLY_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}
