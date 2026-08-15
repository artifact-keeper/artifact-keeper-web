"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { HeartPulse, ShieldCheck, Scale, Sparkles, FileText } from "lucide-react";
import { qualityGatesApi } from "@/lib/api/quality-gates";
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
    labelKey: "security" as const,
    weight: "40%",
    icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-emerald-500",
  },
  {
    key: "quality_score" as const,
    labelKey: "quality" as const,
    weight: "25%",
    icon: Sparkles,
    color: "text-blue-600 dark:text-blue-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-blue-500",
  },
  {
    key: "license_score" as const,
    labelKey: "license" as const,
    weight: "20%",
    icon: Scale,
    color: "text-amber-600 dark:text-amber-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-amber-500",
  },
  {
    key: "metadata_score" as const,
    labelKey: "metadata" as const,
    weight: "15%",
    icon: FileText,
    color: "text-purple-600 dark:text-purple-400",
    progressColor:
      "[&_[data-slot=progress-indicator]]:bg-purple-500",
  },
];

export function HealthTabContent({ artifact }: HealthTabContentProps) {
  const t = useTranslations("health");
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
        <p className="text-sm font-medium">{t("noData")}</p>
        <p className="text-xs mt-1">
          {t("noDataDetail")}
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
          <span className="text-xs text-muted-foreground">{t("grade")}</span>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{t("overallHealth")}</span>
            <span className="text-2xl font-bold tabular-nums">
              {Math.round(health.health_score)}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </span>
          </div>
          <Progress value={health.health_score} className="h-2.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("checksPassed", {
                passed: health.checks_passed,
                total: health.checks_total,
              })}
            </span>
            {health.total_issues > 0 && (
              <span>
                {t("issues", { count: health.total_issues })}
                {health.critical_issues > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-medium ml-1">
                    {t("criticalCount", { count: health.critical_issues })}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t("scoreBreakdown")}</h4>
        {SCORE_COMPONENTS.map((comp) => {
          const score = health[comp.key];
          const value = score != null ? Math.round(score) : null;
          const Icon = comp.icon;
          return (
            <div key={comp.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${comp.color}`} />
                  <span className="text-sm font-medium">{t(`components.${comp.labelKey}`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("weight", { weight: comp.weight })}
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {value != null ? (
                    <>
                      {value}
                      <span className="text-muted-foreground font-normal">/100</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground font-normal">{t("na")}</span>
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
          {t("lastEvaluated", {
            date: new Date(health.last_checked_at).toLocaleString(),
          })}
        </p>
      )}
    </div>
  );
}
