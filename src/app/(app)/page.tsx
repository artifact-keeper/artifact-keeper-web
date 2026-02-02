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
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { adminApi } from "@/lib/api/admin";
import { repositoriesApi } from "@/lib/api/repositories";
import type { Repository } from "@/types";
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

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
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: health,
    isLoading: healthLoading,
    isFetching: healthFetching,
  } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
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

  const isRefreshing = healthFetching || statsFetching || reposFetching;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["health"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["recent-repositories"] });
  }

  const greeting = user?.display_name || user?.username;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={greeting ? `Welcome back, ${greeting}` : "Dashboard"}
        description="Overview of your Artifact Keeper instance."
        actions={
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
        }
      />

      {/* System Health */}
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
