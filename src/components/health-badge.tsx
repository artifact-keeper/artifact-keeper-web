"use client";

import { GRADE_COLORS } from "@/types/quality-gates";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HealthBadgeProps {
  grade: string;
  score?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-sm",
  lg: "px-3 py-1 text-base",
};

export function HealthBadge({
  grade,
  score,
  size = "md",
  className,
}: HealthBadgeProps) {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-bold",
        sizeClasses[size],
        GRADE_COLORS[grade] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {grade}
    </span>
  );

  if (score != null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>Score: {Math.round(score)}/100</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
