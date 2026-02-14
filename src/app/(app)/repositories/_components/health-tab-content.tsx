"use client";

import { useQuery } from "@tanstack/react-query";
import { HeartPulse, ShieldCheck, Scale, Sparkles, FileText } from "lucide-react";
import qualityGatesApi from "@/lib/api/quality-gates";
import type { Artifact } from "@/types";
import { HealthBadge } from "@/components/health-badge";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthTabContentProps {
  artifact: Artifact;
}

const SCORE_COMPONENTS = [
  {
    key: "security_score" as const,
    label: "Security",
    weight: "40%",
    icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-emerald-500",
  },
  {
    key: "quality_score" as const,
    label: "Quality",
    weight: "25%",
    icon: Sparkles,
    color: "text-blue-600 dark:text-blue-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-blue-500",
  },
  {
    key: "license_score" as const,
    label: "License",
    weight: "20%",
    icon: Scale,
    color: "text-amber-600 dark:text-amber-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-amber-500",
  },
  {
    key: "metadata_score" as const,
    label: "Metadata",
    weight: "15%",
    icon: FileText,
    color: "text-purple-600 dark:text-purple-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-purple-500",
  },
];

export function HealthTabContent({ artifact }: HealthTabContentProps) {
  const { data: health, isLoading, error } = useQuery({
    queryKey: ["artifact-health", artifact.id],
    queryFn: () => qualityGatesApi.getArtifactHealth(artifact.id),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <HeartPulse className="size-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">No health data available</p>
        <p className="text-xs mt-1">
          Health scores are computed after quality checks complete.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall score header */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="flex flex-col items-center gap-1">
          <HealthBadge grade={health.health_grade} score={health.health_score} size="lg" />
          <span className="text-xs text-muted-foreground">Grade</span>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Overall Health</span>
            <span className="text-2xl font-bold tabular-nums">
              {Math.round(health.health_score)}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </span>
          </div>
          <Progress value={health.health_score} className="h-2.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {health.checks_passed}/{health.checks_total} checks passed
            </span>
            {health.total_issues > 0 && (
              <span>
                {health.total_issues} issue{health.total_issues !== 1 ? "s" : ""}
                {health.critical_issues > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-medium ml-1">
                    ({health.critical_issues} critical)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Score Breakdown</h4>
        {SCORE_COMPONENTS.map((comp) => {
          const score = health[comp.key];
          const value = score != null ? Math.round(score) : null;
          const Icon = comp.icon;
          return (
            <div key={comp.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${comp.color}`} />
                  <span className="text-sm font-medium">{comp.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({comp.weight} weight)
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {value != null ? (
                    <>
                      {value}
                      <span className="text-muted-foreground font-normal">/100</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground font-normal">N/A</span>
                  )}
                </span>
              </div>
              <Progress
                value={value ?? 0}
                className={`h-2 ${comp.progressColor}`}
              />
            </div>
          );
        })}
      </div>

      {/* Last checked timestamp */}
      {health.last_checked_at && (
        <p className="text-xs text-muted-foreground">
          Last evaluated:{" "}
          {new Date(health.last_checked_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
