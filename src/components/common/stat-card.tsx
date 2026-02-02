"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  description?: string;
  color?: "default" | "blue" | "green" | "yellow" | "red" | "purple";
  onClick?: () => void;
  className?: string;
}

const colorMap = {
  default: "text-muted-foreground",
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-emerald-600 dark:text-emerald-400",
  yellow: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  purple: "text-purple-600 dark:text-purple-400",
};

const bgColorMap = {
  default: "bg-muted/50",
  blue: "bg-blue-50 dark:bg-blue-950/30",
  green: "bg-emerald-50 dark:bg-emerald-950/30",
  yellow: "bg-amber-50 dark:bg-amber-950/30",
  red: "bg-red-50 dark:bg-red-950/30",
  purple: "bg-purple-50 dark:bg-purple-950/30",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  description,
  color = "default",
  onClick,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            bgColorMap[color]
          )}
        >
          <Icon className={cn("size-5", colorMap[color])} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
