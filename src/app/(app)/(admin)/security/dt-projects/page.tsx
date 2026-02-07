"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  Search,
} from "lucide-react";

import dtApi from "@/lib/api/dependency-track";
import type { DtProject, DtProjectMetrics } from "@/types/dependency-track";
import { riskScoreColor } from "@/lib/dt-utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- severity pill --

function SeverityPill({
  count,
  level,
}: {
  count: number;
  level: "critical" | "high" | "medium" | "low";
}) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">0</span>;
  }
  const colors: Record<string, string> = {
    critical:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    medium:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[level]}`}
    >
      {count}
    </span>
  );
}

// -- merged row type --

interface ProjectRow {
  project: DtProject;
  metrics: DtProjectMetrics | null;
  metricsLoading: boolean;
}

export default function DtProjectsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // -- fetch DT status --
  const { data: dtStatus } = useQuery({
    queryKey: ["dt", "status"],
    queryFn: dtApi.getStatus,
  });

  const dtEnabled = dtStatus?.enabled && dtStatus?.healthy;

  // -- fetch projects --
  const {
    data: projects,
    isLoading: projectsLoading,
  } = useQuery({
    queryKey: ["dt", "projects"],
    queryFn: dtApi.listProjects,
    enabled: !!dtEnabled,
  });

  // -- fetch metrics for each project (capped at 30) --
  const projectsToFetch = useMemo(
    () => (projects ?? []).slice(0, 30),
    [projects]
  );

  const metricsQueries = useQueries({
    queries: projectsToFetch.map((p) => ({
      queryKey: ["dt", "project-metrics", p.uuid],
      queryFn: () => dtApi.getProjectMetrics(p.uuid),
      enabled: !!dtEnabled && !!projects,
      staleTime: 5 * 60 * 1000,
    })),
  });

  // -- build rows --
  const rows: ProjectRow[] = useMemo(() => {
    if (!projects) return [];
    return projects.map((project, i) => {
      const metricsQuery = i < 30 ? metricsQueries[i] : undefined;
      return {
        project,
        metrics: metricsQuery?.data ?? null,
        metricsLoading: metricsQuery?.isLoading ?? false,
      };
    });
  }, [projects, metricsQueries]);

  // -- filter by search --
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.project.name.toLowerCase().includes(q) ||
        (r.project.version && r.project.version.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  // -- table columns --
  const columns: DataTableColumn<ProjectRow>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (r) => r.project.name,
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{r.project.name}</p>
          {r.project.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {r.project.description}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (r) => r.project.version ?? "",
      sortable: true,
      cell: (r) =>
        r.project.version ? (
          <Badge variant="secondary" className="text-xs font-normal">
            {r.project.version}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "lastBomImport",
      header: "Last BOM Import",
      accessor: (r) => r.project.lastBomImport ?? 0,
      sortable: true,
      cell: (r) =>
        r.project.lastBomImport ? (
          <span className="text-sm text-muted-foreground">
            {new Date(r.project.lastBomImport).toLocaleDateString()}
          </span>
        ) : (
          <Badge variant="secondary" className="text-xs font-normal">
            Never
          </Badge>
        ),
    },
    {
      id: "critical",
      header: "Critical",
      accessor: (r) => r.metrics?.critical ?? 0,
      sortable: true,
      cell: (r) =>
        r.metricsLoading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <SeverityPill count={r.metrics?.critical ?? 0} level="critical" />
        ),
    },
    {
      id: "high",
      header: "High",
      accessor: (r) => r.metrics?.high ?? 0,
      sortable: true,
      cell: (r) =>
        r.metricsLoading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <SeverityPill count={r.metrics?.high ?? 0} level="high" />
        ),
    },
    {
      id: "medium",
      header: "Medium",
      accessor: (r) => r.metrics?.medium ?? 0,
      sortable: true,
      cell: (r) =>
        r.metricsLoading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <SeverityPill count={r.metrics?.medium ?? 0} level="medium" />
        ),
    },
    {
      id: "low",
      header: "Low",
      accessor: (r) => r.metrics?.low ?? 0,
      sortable: true,
      cell: (r) =>
        r.metricsLoading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <SeverityPill count={r.metrics?.low ?? 0} level="low" />
        ),
    },
    {
      id: "risk",
      header: "Risk Score",
      accessor: (r) => r.metrics?.inheritedRiskScore ?? 0,
      sortable: true,
      cell: (r) =>
        r.metricsLoading ? (
          <Skeleton className="h-4 w-12" />
        ) : r.metrics ? (
          <span
            className={`text-sm font-semibold tabular-nums ${riskScoreColor(r.metrics.inheritedRiskScore)}`}
          >
            {r.metrics.inheritedRiskScore}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
  ];

  // -- not connected state --
  if (dtStatus && !dtEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="DT Projects"
          description="Browse Dependency-Track projects and their vulnerability metrics."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/security")}
            >
              <ArrowLeft className="size-4" />
              Back to Security
            </Button>
          }
        />
        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/30">
          <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
              Dependency-Track is unavailable
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
              The Dependency-Track integration is currently disconnected.
              Projects cannot be displayed until the service recovers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DT Projects"
        description="Browse Dependency-Track projects and their vulnerability metrics."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/security")}
          >
            <ArrowLeft className="size-4" />
            Back to Security
          </Button>
        }
      />

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Projects table */}
      <DataTable
        columns={columns}
        data={filteredRows}
        loading={projectsLoading}
        emptyMessage={
          searchQuery.trim()
            ? "No projects match your search."
            : "No Dependency-Track projects found."
        }
        onRowClick={(r) =>
          router.push(`/security/dt-projects/${r.project.uuid}`)
        }
        rowKey={(r) => r.project.uuid}
      />
    </div>
  );
}
