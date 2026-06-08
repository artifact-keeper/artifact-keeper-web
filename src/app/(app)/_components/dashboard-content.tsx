"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  FileBox,
  Users,
  HardDrive,
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
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function healthGlyph(status: string | undefined): string {
  if (!status) return "○";
  const s = status.toLowerCase();
  if (s === "healthy") return "●";
  if (s === "degraded" || s === "unavailable") return "◐";
  return "✕";
}

function healthTone(status: string | undefined): string {
  if (!status) return "text-muted-foreground";
  const s = status.toLowerCase();
  if (s === "healthy") return "text-primary";
  if (s === "degraded" || s === "unavailable") return "text-foreground/70";
  return "text-seal";
}

function SectionLabel({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs">
      <span aria-hidden className="text-muted-foreground/70">─</span>
      <span className="lowercase text-primary">{children}</span>
      <span aria-hidden className="flex-1 border-t border-border/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthCard({
  label,
  status,
}: Readonly<{
  label: string;
  status: string | undefined;
}>) {
  return (
    <div className="group flex items-baseline gap-2 border border-border/60 bg-card/40 px-3 py-2 hover:border-primary/60 hover:bg-card">
      <span className={`leading-none ${healthTone(status)}`} aria-hidden>
        {healthGlyph(status)}
      </span>
      <span className="text-xs lowercase text-muted-foreground">{label}</span>
      <span className={`ml-auto text-xs lowercase ${healthTone(status)}`}>
        {status ?? "unknown"}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  signal,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  signal?: boolean;
}>) {
  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground/60">=</span>
      <span className={signal ? "text-primary" : "text-foreground"}>{value}</span>
    </span>
  );
}

function StatusLine({
  user,
  health,
  stats,
  isRefreshing,
  onRefresh,
}: Readonly<{
  user: { display_name?: string | null; username?: string | null } | null | undefined;
  health: { status?: string; version?: string } | undefined;
  stats: {
    total_repositories?: number;
    total_artifacts?: number;
    total_storage_bytes?: number;
    total_users?: number;
  } | undefined;
  isRefreshing: boolean;
  onRefresh: () => void;
}>) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const ident = user?.username ?? "anon";

  return (
    <section className="border border-border bg-background/40">
      <header className="flex items-baseline justify-between gap-4 border-b border-border bg-card/40 px-4 py-2">
        <span className="text-sm">
          <span className="text-primary">ak://</span>
          <span className="text-foreground">prod</span>
          <span className="text-muted-foreground"> · {ident}@</span>
          <span className="text-foreground/80">artifact-keeper</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {stamp}Z
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 border border-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>reload</span>
          </button>
        </div>
      </header>
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <Stat
            label="health"
            signal
            value={
              <span className={healthTone(health?.status)}>
                {healthGlyph(health?.status)}
                {(health?.status ?? "unknown").toLowerCase()}
              </span>
            }
          />
          <Stat
            label="repos"
            value={stats?.total_repositories?.toLocaleString() ?? "—"}
          />
          <Stat
            label="artifacts"
            value={stats?.total_artifacts?.toLocaleString() ?? "—"}
          />
          <Stat
            label="storage"
            value={
              stats?.total_storage_bytes != null
                ? formatBytes(stats.total_storage_bytes)
                : "—"
            }
          />
          <Stat
            label="users"
            value={stats?.total_users?.toLocaleString() ?? "—"}
          />
          <Stat label="audit" value="clean" />
          <Stat label="build" value={health?.version ?? "dev"} />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          <span className="text-primary">$</span>{" "}
          <span className="text-foreground/80">ak status</span>{" "}
          <span className="text-muted-foreground">--watch</span>
          {"   "}
          <span className="text-muted-foreground/70">
            # streaming events · ctrl-c to exit
          </span>
        </div>
      </div>
    </section>
  );
}

function HealthSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {["a", "b", "c", "d", "e"].map((id) => (
        <Skeleton key={id} className="h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {["a", "b", "c", "d"].map((id) => (
        <Skeleton key={id} className="h-[100px] rounded-xl" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 px-6">
      {["a", "b", "c", "d", "e"].map((id) => (
        <Skeleton key={id} className="h-10 rounded-md" />
      ))}
    </div>
  );
}

function RepoRow({ repo }: Readonly<{ repo: Repository }>) {
  return (
    <TableRow className="group">
      <TableCell>
        <Link
          href={`/repositories/${repo.key}`}
          className="text-sm text-foreground group-hover:text-primary"
        >
          <span className="text-primary">{repo.format.toLowerCase()}</span>
          <span className="text-muted-foreground">:</span>
          <span>{repo.name || repo.key}</span>
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={repo.repo_type} />
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums text-foreground/80">
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
  critical: "bg-seal",
  high: "bg-primary",
  medium: "bg-primary/60",
  low: "bg-foreground/30",
};

const SEVERITY_TEXT_COLORS: Record<string, string> = {
  critical: "text-seal",
  high: "text-primary",
  medium: "text-foreground/80",
  low: "text-muted-foreground",
};

function SeverityBreakdown({ trends }: Readonly<{ trends: CveTrends }>) {
  const counts = {
    critical: trends.critical_count,
    high: trends.high_count,
    medium: trends.medium_count,
    low: trends.low_count,
  };
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {SEVERITY_LEVELS.map((sev) => {
          const count = counts[sev];
          const pct = (count / max) * 100;
          return (
            <div key={sev} className="flex items-center gap-3">
              <span
                className={`text-[10px] uppercase tracking-[0.2em] w-20 ${SEVERITY_TEXT_COLORS[sev]}`}
              >
                {sev}
              </span>
              <div className="flex-1 h-2 bg-muted/60 overflow-hidden">
                <div
                  className={`h-full transition-all ${SEVERITY_BAR_COLORS[sev]}`}
                  style={{ width: `${pct}%`, minWidth: count > 0 ? "4px" : "0" }}
                />
              </div>
              <span className="text-sm tabular-nums w-10 text-right text-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>
          Open <strong className="ml-1 text-foreground tabular-nums">{trends.open_cves}</strong>
        </span>
        <span>
          Fixed <strong className="ml-1 text-foreground tabular-nums">{trends.fixed_cves}</strong>
        </span>
        <span>
          Ack <strong className="ml-1 text-foreground tabular-nums">{trends.acknowledged_cves}</strong>
        </span>
        {trends.avg_days_to_fix != null && (
          <span>
            ttf{" "}
            <strong className="ml-1 text-foreground tabular-nums">
              {Math.round(trends.avg_days_to_fix)}d
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export function DashboardContent() {
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

  return (
    <div className="space-y-8">
      {isAuthenticated && (
        <StatusLine
          user={user}
          health={health}
          stats={stats}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
        />
      )}

      {isAuthenticated && (
        <section>
          <SectionLabel>subsystems</SectionLabel>
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
              {(health?.checks?.opensearch ?? health?.checks?.meilisearch) && (
                <HealthCard
                  label="Search Engine"
                  status={
                    (health?.checks?.opensearch ?? health?.checks?.meilisearch)!
                      .status
                  }
                />
              )}
            </div>
          )}
        </section>
      )}

      {user?.is_admin && (
        <section>
          <SectionLabel>stats</SectionLabel>
          {statsLoading && <StatsSkeleton />}
          {!statsLoading && stats && (
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
          )}
          {!statsLoading && !stats && (
            <div className="rounded-lg border bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Failed to load admin statistics.
            </div>
          )}
        </section>
      )}

      {user?.is_admin && (
        <section>
          <SectionLabel>security</SectionLabel>
          {cveTrendsLoading && <StatsSkeleton />}
          {!cveTrendsLoading && cveTrends && (
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
          )}
          {!cveTrendsLoading && !cveTrends && (
            <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              No CVE data available yet. Generate SBOMs and run security scans to track vulnerabilities.
            </div>
          )}
        </section>
      )}

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
        {reposLoading && <TableSkeleton />}
        {!reposLoading && recentRepos && recentRepos.items.length > 0 && (
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
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
        )}
        {!reposLoading && (!recentRepos || recentRepos.items.length === 0) && (
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
