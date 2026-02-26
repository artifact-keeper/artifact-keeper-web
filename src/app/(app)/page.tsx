"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  FileBox,
  Users,
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Package,
  ArrowRight,
  Shield,
  ShieldAlert,
  ShieldX,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { adminApi } from "@/lib/api/admin";
import { repositoriesApi } from "@/lib/api/repositories";
import sbomApi from "@/lib/api/sbom";
import { formatBytes } from "@/lib/utils";
import type { Repository } from "@/types";
import type { CveTrends } from "@/types/sbom";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function healthIcon(status: string | undefined) {
  if (!status) return <XCircle className="size-4 text-muted-foreground" />;
  const s = status.toLowerCase();
  if (s === "healthy") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (s === "degraded" || s === "unavailable")
    return <AlertTriangle className="size-4 text-amber-500" />;
  return <XCircle className="size-4 text-red-500" />;
}

function healthColor(status: string | undefined): string {
  if (!status) return "text-muted-foreground";
  const s = status.toLowerCase();
  if (s === "healthy") return "text-emerald-600 dark:text-emerald-400";
  if (s === "degraded" || s === "unavailable")
    return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

const formatBadgeColors: Record<string, string> = {
  maven: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  pypi: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  npm: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  docker: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  cargo: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  helm: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  nuget: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  go: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
  generic: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function getFormatBadgeClass(format: string): string {
  return formatBadgeColors[format.toLowerCase()] ?? formatBadgeColors.generic;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthCard({
  label,
  status,
}: {
  label: string;
  status: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      {healthIcon(status)}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium capitalize ${healthColor(status)}`}>
          {status ?? "Unknown"}
        </p>
      </div>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[100px] rounded-xl" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 px-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 rounded-md" />
      ))}
    </div>
  );
}

function RepoRow({ repo }: { repo: Repository }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/repositories/${repo.key}`}
          className="font-medium text-primary hover:underline"
        >
          {repo.name || repo.key}
        </Link>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`border font-medium uppercase text-xs ${getFormatBadgeClass(repo.format)}`}
        >
          {repo.format}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={repo.repo_type} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatBytes(repo.storage_used_bytes)}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Severity breakdown for CVE trends
// ---------------------------------------------------------------------------

const SEVERITY_LEVELS = ["critical", "high", "medium", "low"] as const;

const SEVERITY_BAR_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

const SEVERITY_TEXT_COLORS: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-blue-600 dark:text-blue-400",
};

function SeverityBreakdown({ trends }: { trends: CveTrends }) {
  const counts = {
    critical: trends.critical_count,
    high: trends.high_count,
    medium: trends.medium_count,
    low: trends.low_count,
  };
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-4">
      {/* Horizontal bar chart */}
      <div className="space-y-3">
        {SEVERITY_LEVELS.map((sev) => {
          const count = counts[sev];
          const pct = (count / max) * 100;
          return (
            <div key={sev} className="flex items-center gap-3">
              <span className={`text-xs font-medium capitalize w-16 ${SEVERITY_TEXT_COLORS[sev]}`}>
                {sev}
              </span>
              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${SEVERITY_BAR_COLORS[sev]}`}
                  style={{ width: `${pct}%`, minWidth: count > 0 ? "8px" : "0" }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Status summary row */}
      <div className="flex items-center gap-6 pt-2 border-t text-xs text-muted-foreground">
        <span>Open: <strong className="text-foreground">{trends.open_cves}</strong></span>
        <span>Fixed: <strong className="text-foreground">{trends.fixed_cves}</strong></span>
        <span>Acknowledged: <strong className="text-foreground">{trends.acknowledged_cves}</strong></span>
        {trends.avg_days_to_fix != null && (
          <span>Avg fix time: <strong className="text-foreground">{Math.round(trends.avg_days_to_fix)}d</strong></span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: health,
    isLoading: healthLoading,
    isFetching: healthFetching,
  } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
    enabled: isAuthenticated,
  });

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
  } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats(),
    enabled: !!user?.is_admin,
  });

  const {
    data: recentRepos,
    isLoading: reposLoading,
    isFetching: reposFetching,
  } = useQuery({
    queryKey: ["recent-repositories"],
    queryFn: () => repositoriesApi.list({ per_page: 5 }),
  });

  const {
    data: cveTrends,
    isLoading: cveTrendsLoading,
    isFetching: cveTrendsFetching,
  } = useQuery({
    queryKey: ["cve-trends"],
    queryFn: () => sbomApi.getCveTrends(),
    enabled: !!user?.is_admin,
  });

  const isRefreshing = healthFetching || statsFetching || reposFetching || cveTrendsFetching;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["health"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["recent-repositories"] });
    queryClient.invalidateQueries({ queryKey: ["cve-trends"] });
  }

  const greeting = user?.display_name || user?.username;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={greeting ? `Welcome back, ${greeting}` : "Dashboard"}
        description="Overview of your Artifact Keeper instance."
        actions={
          isAuthenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          ) : undefined
        }
      />

      {/* System Health (authenticated users only) */}
      {isAuthenticated && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            System Health
          </h2>
          {healthLoading ? (
            <HealthSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <HealthCard label="Overall" status={health?.status} />
              <HealthCard
                label="Database"
                status={health?.checks?.database?.status}
              />
              <HealthCard
                label="Storage"
                status={health?.checks?.storage?.status}
              />
              {health?.checks?.security_scanner && (
                <HealthCard
                  label="Security Scanner"
                  status={health.checks.security_scanner.status}
                />
              )}
              {health?.checks?.meilisearch && (
                <HealthCard
                  label="Search Engine"
                  status={health.checks.meilisearch.status}
                />
              )}
            </div>
          )}
        </section>
      )}

      {/* Admin Stats */}
      {user?.is_admin && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Statistics
          </h2>
          {statsLoading ? (
            <StatsSkeleton />
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Database}
                label="Repositories"
                value={stats.total_repositories}
                color="blue"
                onClick={() => {
                  /* navigate to /repositories */
                }}
              />
              <StatCard
                icon={FileBox}
                label="Artifacts"
                value={stats.total_artifacts}
                color="green"
              />
              <StatCard
                icon={Users}
                label="Users"
                value={stats.total_users}
                color="purple"
              />
              <StatCard
                icon={HardDrive}
                label="Storage Used"
                value={formatBytes(stats.total_storage_bytes)}
                color="yellow"
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Failed to load admin statistics.
            </div>
          )}
        </section>
      )}

      {/* Security Overview (Admin only) */}
      {user?.is_admin && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Security Overview
          </h2>
          {cveTrendsLoading ? (
            <StatsSkeleton />
          ) : cveTrends ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  icon={Shield}
                  label="Total CVEs"
                  value={cveTrends.total_cves}
                  color="blue"
                />
                <StatCard
                  icon={ShieldAlert}
                  label="Open CVEs"
                  value={cveTrends.open_cves}
                  color="yellow"
                />
                <StatCard
                  icon={ShieldX}
                  label="Critical"
                  value={cveTrends.critical_count}
                  color="red"
                />
                <StatCard
                  icon={ShieldCheck}
                  label="Fixed"
                  value={cveTrends.fixed_cves}
                  color="green"
                />
              </div>

              {/* Severity Breakdown */}
              {cveTrends.total_cves > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Severity Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SeverityBreakdown trends={cveTrends} />
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              No CVE data available yet. Generate SBOMs and run security scans to track vulnerabilities.
            </div>
          )}
        </section>
      )}

      {/* Recent Repositories */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Repositories</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/repositories">
                View all
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        {reposLoading ? (
          <TableSkeleton />
        ) : recentRepos && recentRepos.items.length > 0 ? (
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Storage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRepos.items.map((repo) => (
                  <RepoRow key={repo.id} repo={repo} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
          <CardContent>
            <EmptyState
              icon={Package}
              title="No repositories yet"
              description="Create your first repository to get started with Artifact Keeper."
              action={
                <Button asChild>
                  <Link href="/repositories">Create Repository</Link>
                </Button>
              }
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
