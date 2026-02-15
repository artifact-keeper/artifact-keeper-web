"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HeartPulse,
  ShieldCheck,
  Package,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import qualityGatesApi from "@/lib/api/quality-gates";
import type { RepoHealth } from "@/types/quality-gates";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { HealthBadge } from "@/components/health-badge";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";

// -- Grade distribution segment bar --

const GRADE_BAR_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-amber-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

const GRADE_TEXT_COLORS: Record<string, string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-blue-600 dark:text-blue-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-orange-600 dark:text-orange-400",
  F: "text-red-600 dark:text-red-400",
};

function GradeDistributionBar({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const grades = ["A", "B", "C", "D", "F"];
  const total = grades.reduce((sum, g) => sum + (distribution[g] ?? 0), 0);

  if (total === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No artifacts evaluated yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Segment bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg border">
        {grades.map((grade) => {
          const count = distribution[grade] ?? 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={grade}
              className={`${GRADE_BAR_COLORS[grade]} flex items-center justify-center text-white text-xs font-bold transition-all`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? "24px" : "0" }}
              title={`Grade ${grade}: ${count} repositories (${pct.toFixed(1)}%)`}
            >
              {pct >= 8 ? grade : ""}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {grades.map((grade) => {
          const count = distribution[grade] ?? 0;
          return (
            <div key={grade} className="flex items-center gap-1.5">
              <div
                className={`size-3 rounded-sm ${GRADE_BAR_COLORS[grade]}`}
              />
              <span className="text-sm text-muted-foreground">
                Grade{" "}
                <span className={`font-semibold ${GRADE_TEXT_COLORS[grade]}`}>
                  {grade}
                </span>
              </span>
              <span className="text-sm font-medium">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Overall health score display --

function OverallHealthScore({
  score,
  grade,
}: {
  score: number;
  grade: string;
}) {
  return (
    <div className="flex items-center gap-5">
      <div className="relative flex size-28 items-center justify-center">
        <svg className="size-28 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${score * 2.64} ${264 - score * 2.64}`}
            className={scoreToStrokeClass(score)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight">
            {Math.round(score)}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="space-y-1">
        <HealthBadge grade={grade} score={score} size="lg" />
        <p className="text-sm text-muted-foreground mt-1">
          Average health score across all repositories
        </p>
      </div>
    </div>
  );
}

// -- Score helpers --

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreToStrokeClass(score: number): string {
  if (score >= 90) return "stroke-emerald-500";
  if (score >= 80) return "stroke-blue-500";
  if (score >= 70) return "stroke-amber-500";
  if (score >= 60) return "stroke-orange-500";
  return "stroke-red-500";
}

// -- Main page --

export default function HealthDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["health-dashboard"],
    queryFn: qualityGatesApi.getHealthDashboard,
    enabled: !!user?.is_admin,
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Health Dashboard" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  const gradeDistribution: Record<string, number> = dashboard
    ? {
        A: dashboard.repos_grade_a,
        B: dashboard.repos_grade_b,
        C: dashboard.repos_grade_c,
        D: dashboard.repos_grade_d,
        F: dashboard.repos_grade_f,
      }
    : {};

  const reposBelowThreshold = (dashboard?.repos_grade_d ?? 0) + (dashboard?.repos_grade_f ?? 0);
  const totalCriticalIssues =
    dashboard?.repositories?.reduce(
      (sum, r) => sum + (r.artifacts_failing ?? 0),
      0
    ) ?? 0;

  function OptionalScore({ value }: { value: number | null | undefined }) {
    if (value != null) {
      return (
        <span className="text-sm text-muted-foreground tabular-nums">
          {Math.round(value)}
        </span>
      );
    }
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  // -- table columns --
  const columns: DataTableColumn<RepoHealth>[] = [
    {
      id: "repository_key",
      header: "Repository",
      accessor: (r) => r.repository_key,
      sortable: true,
      cell: (r) => (
        <span className="text-sm font-medium">{r.repository_key}</span>
      ),
    },
    {
      id: "grade",
      header: "Grade",
      accessor: (r) => r.health_score,
      sortable: true,
      cell: (r) => (
        <HealthBadge grade={r.health_grade} score={r.health_score} />
      ),
    },
    {
      id: "health_score",
      header: "Score",
      accessor: (r) => r.health_score,
      sortable: true,
      cell: (r) => (
        <span className="text-sm font-medium tabular-nums">
          {Math.round(r.health_score)}/100
        </span>
      ),
    },
    {
      id: "security",
      header: "Security",
      accessor: (r) => r.avg_security_score ?? 0,
      sortable: true,
      cell: (r) => <OptionalScore value={r.avg_security_score} />,
    },
    {
      id: "quality",
      header: "Quality",
      accessor: (r) => r.avg_quality_score ?? 0,
      sortable: true,
      cell: (r) => <OptionalScore value={r.avg_quality_score} />,
    },
    {
      id: "license",
      header: "License",
      accessor: (r) => r.avg_license_score ?? 0,
      sortable: true,
      cell: (r) => <OptionalScore value={r.avg_license_score} />,
    },
    {
      id: "metadata",
      header: "Metadata",
      accessor: (r) => r.avg_metadata_score ?? 0,
      sortable: true,
      cell: (r) => <OptionalScore value={r.avg_metadata_score} />,
    },
    {
      id: "artifacts",
      header: "Artifacts",
      accessor: (r) => r.artifacts_evaluated,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {r.artifacts_evaluated}
        </span>
      ),
    },
    {
      id: "passing",
      header: "Passing",
      accessor: (r) => r.artifacts_passing,
      sortable: true,
      cell: (r) => (
        <span className="text-sm tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            {r.artifacts_passing}
          </span>
          <span className="text-muted-foreground">
            /{r.artifacts_evaluated}
          </span>
        </span>
      ),
    },
    {
      id: "failing",
      header: "Failing",
      accessor: (r) => r.artifacts_failing,
      sortable: true,
      cell: (r) =>
        r.artifacts_failing > 0 ? (
          <span className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums">
            {r.artifacts_failing}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">0</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health Dashboard"
        description="Monitor artifact health scores, quality metrics, and grade distribution across all repositories."
        actions={
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["health-dashboard"] })
            }
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      )}

      {dashboard && (
        <>
          {/* Overall score + stat cards */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
            <Card>
              <CardContent className="flex items-center justify-center py-6 px-8">
                <OverallHealthScore
                  score={dashboard.avg_health_score}
                  grade={scoreToGrade(dashboard.avg_health_score)}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <StatCard
                icon={Package}
                label="Artifacts Evaluated"
                value={dashboard.total_artifacts_evaluated}
                color="blue"
              />
              <StatCard
                icon={HeartPulse}
                label="Repositories"
                value={dashboard.total_repositories}
                color="green"
              />
              <StatCard
                icon={ShieldCheck}
                label="Grade A Repos"
                value={dashboard.repos_grade_a}
                color="green"
              />
              <StatCard
                icon={AlertTriangle}
                label="Below Threshold"
                value={reposBelowThreshold}
                description="Grade D or F"
                color={reposBelowThreshold > 0 ? "red" : "green"}
              />
              <StatCard
                icon={AlertCircle}
                label="Failing Artifacts"
                value={totalCriticalIssues}
                color={totalCriticalIssues > 0 ? "red" : "green"}
              />
            </div>
          </div>

          {/* Grade Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Grade Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GradeDistributionBar distribution={gradeDistribution} />
            </CardContent>
          </Card>

          {/* Repository Health Table */}
          <div>
            <h2 className="text-lg font-semibold tracking-tight mb-4">
              Repository Health Scores
            </h2>
            <DataTable
              columns={columns}
              data={dashboard.repositories ?? []}
              loading={false}
              emptyMessage="No repositories have been evaluated yet. Health scores are computed after artifact scans complete."
              rowKey={(r) => r.repository_id}
            />
          </div>
        </>
      )}
    </div>
  );
}
