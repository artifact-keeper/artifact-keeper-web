/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  ScanSearch,
  Bug,
  AlertTriangle,
  AlertCircle,
  Award,
  ShieldBan,
  RefreshCw,
  Zap,
  FolderSearch,
  Scale,
  XCircle,
} from "lucide-react";

import "@/lib/sdk-client";
import { listRepositories } from "@artifact-keeper/sdk";
import securityApi from "@/lib/api/security";
import dtApi from "@/lib/api/dependency-track";
import { artifactsApi } from "@/lib/api/artifacts";
import type { RepoSecurityScore } from "@/types/security";
import type { DtProjectMetrics } from "@/types/dependency-track";
import {
  Sparkline,
  SeverityBar,
  RiskGauge,
  ProgressRow,
  TrendChart,
} from "@/components/dt";
import { aggregateHistories } from "@/lib/dt-utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- grade badge --

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  B: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  F: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2.5 py-0.5 text-sm font-bold ${GRADE_COLORS[grade] ?? "bg-muted text-muted-foreground"}`}
    >
      {grade}
    </span>
  );
}

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

const VIOLATION_STATE_BADGE: Record<string, string> = {
  FAIL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  WARN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
};

export default function SecurityDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"repo" | "artifact">("repo");
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>(
    undefined
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>(
    undefined
  );

  // -- queries --
  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["security", "dashboard"],
    queryFn: securityApi.getDashboard,
  });

  const { data: scores, isLoading: scoresLoading } = useQuery({
    queryKey: ["security", "scores"],
    queryFn: securityApi.getAllScores,
  });

  // Dependency-Track integration
  const { data: dtStatus } = useQuery({
    queryKey: ["dt", "status"],
    queryFn: dtApi.getStatus,
  });

  const dtEnabled = dtStatus?.enabled && dtStatus?.healthy;

  const { data: dtPortfolio } = useQuery({
    queryKey: ["dt", "portfolio-metrics"],
    queryFn: dtApi.getPortfolioMetrics,
    enabled: !!dtEnabled,
  });

  const { data: dtProjects } = useQuery({
    queryKey: ["dt", "projects"],
    queryFn: dtApi.listProjects,
    enabled: !!dtEnabled,
  });

  const { data: dtHistory } = useQuery({
    queryKey: ["dt", "history", dtProjects?.map((p) => p.uuid).join(",")],
    queryFn: async () => {
      const projects = dtProjects!;
      const historyMap: Record<string, DtProjectMetrics[]> = {};
      await Promise.all(
        projects.slice(0, 20).map(async (p) => {
          try {
            historyMap[p.uuid] = await dtApi.getProjectMetricsHistory(
              p.uuid,
              30
            );
          } catch {
            // skip projects whose history is unavailable
          }
        })
      );
      return aggregateHistories(historyMap);
    },
    enabled: !!dtEnabled && !!dtProjects && dtProjects.length > 0,
  });

  const { data: dtViolations, isLoading: dtViolationsLoading } = useQuery({
    queryKey: ["dt", "portfolio-violations", dtProjects?.map((p) => p.uuid).join(",")],
    queryFn: () => dtApi.getAllViolations(dtProjects!),
    enabled: !!dtEnabled && !!dtProjects && dtProjects.length > 0,
  });

  const { data: repos } = useQuery({
    queryKey: ["repositories-for-scan"],
    queryFn: async () => {
      const { data, error } = await listRepositories({
        query: { per_page: 100 },
      });
      if (error) throw error;
      return (data as any)?.items ?? data ?? [];
    },
    enabled: triggerOpen,
  });

  // Find the repo key from repo id for the artifact list API call
  const selectedRepoKey = selectedRepoId
    ? ((repos as Array<{ id: string; key: string }>) ?? []).find(
        (r) => r.id === selectedRepoId
      )?.key
    : undefined;

  const { data: artifactsList, isLoading: artifactsLoading } = useQuery({
    queryKey: ["artifacts-for-scan", selectedRepoKey],
    queryFn: () => artifactsApi.list(selectedRepoKey!, { per_page: 100 }),
    enabled: scanMode === "artifact" && !!selectedRepoKey,
  });

  const triggerScanMutation = useMutation({
    mutationFn: securityApi.triggerScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security"] });
      setTriggerOpen(false);
      setSelectedRepoId(undefined);
      setSelectedArtifactId(undefined);
      setScanMode("repo");
    },
  });

  // -- table columns --
  const columns: DataTableColumn<RepoSecurityScore>[] = [
    {
      id: "repository_id",
      header: "Repository",
      accessor: (r) => r.repository_id,
      cell: (r) => (
        <code className="text-xs">{r.repository_id.slice(0, 12)}...</code>
      ),
    },
    {
      id: "grade",
      header: "Grade",
      accessor: (r) => r.score,
      sortable: true,
      cell: (r) => <GradeBadge grade={r.grade} />,
    },
    {
      id: "score",
      header: "Score",
      accessor: (r) => r.score,
      sortable: true,
      cell: (r) => (
        <span className="text-sm font-medium">{r.score}/100</span>
      ),
    },
    {
      id: "critical",
      header: "Critical",
      accessor: (r) => r.critical_count,
      sortable: true,
      cell: (r) => (
        <SeverityPill count={r.critical_count} level="critical" />
      ),
    },
    {
      id: "high",
      header: "High",
      accessor: (r) => r.high_count,
      sortable: true,
      cell: (r) => <SeverityPill count={r.high_count} level="high" />,
    },
    {
      id: "medium",
      header: "Medium",
      accessor: (r) => r.medium_count,
      sortable: true,
      cell: (r) => <SeverityPill count={r.medium_count} level="medium" />,
    },
    {
      id: "low",
      header: "Low",
      accessor: (r) => r.low_count,
      sortable: true,
      cell: (r) => <SeverityPill count={r.low_count} level="low" />,
    },
    {
      id: "acknowledged",
      header: "Ack'd",
      accessor: (r) => r.acknowledged_count,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.acknowledged_count}
        </span>
      ),
    },
    {
      id: "last_scan",
      header: "Last Scan",
      accessor: (r) => r.last_scan_at ?? "",
      sortable: true,
      cell: (r) =>
        r.last_scan_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(r.last_scan_at).toLocaleDateString()}
          </span>
        ) : (
          <Badge variant="secondary" className="text-xs font-normal">
            Never
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Monitor vulnerability scanning, security scores, and policy enforcement across all repositories."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["security"] })
              }
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/security/scans")}
            >
              <ScanSearch className="size-4" />
              View All Scans
            </Button>
            <Button onClick={() => setTriggerOpen(true)}>
              <Zap className="size-4" />
              Trigger Scan
            </Button>
          </div>
        }
      />

      {/* Summary stat cards */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            icon={ShieldCheck}
            label="Repos with Scanning"
            value={dashboard.repos_with_scanning}
            color="green"
          />
          <StatCard
            icon={ScanSearch}
            label="Total Scans"
            value={dashboard.total_scans}
            color="blue"
          />
          <StatCard
            icon={AlertCircle}
            label="Critical Findings"
            value={dashboard.critical_findings}
            color={dashboard.critical_findings > 0 ? "red" : "green"}
          />
          <StatCard
            icon={AlertTriangle}
            label="High Findings"
            value={dashboard.high_findings}
            color={dashboard.high_findings > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={Bug}
            label="Open Findings"
            value={dashboard.total_findings}
            color={dashboard.total_findings > 0 ? "yellow" : "green"}
          />
          <StatCard
            icon={Award}
            label="Grade A Repos"
            value={dashboard.repos_grade_a}
            color="green"
          />
          <StatCard
            icon={Award}
            label="Grade F Repos"
            value={dashboard.repos_grade_f}
            color={dashboard.repos_grade_f > 0 ? "red" : "green"}
          />
          <StatCard
            icon={ShieldBan}
            label="Policy Blocks"
            value={dashboard.policy_violations_blocked}
            color="purple"
          />
        </div>
      )}

      {/* Loading skeleton for stats */}
      {dashLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Dependency-Track Dashboard */}
      {dtStatus && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold tracking-tight">
              Dependency-Track
            </CardTitle>
            <div className="flex items-center gap-2">
              {dtEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/security/dt-projects")}
                >
                  <FolderSearch className="size-4" />
                  View DT Projects
                </Button>
              )}
              {dtEnabled ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">Disconnected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!dtEnabled && (
              <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950/30">
                <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
                    Dependency-Track is unavailable
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-1">
                    Portfolio metrics, findings, and policy violations are temporarily offline.
                    The service will reconnect automatically when the container recovers.
                  </p>
                </div>
              </div>
            )}

            {dtEnabled && dtPortfolio && (
              <>
                {/* Summary cards with sparklines */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Critical</span>
                      <Sparkline
                        data={dtHistory?.map((d) => d.critical) ?? []}
                        color="#ef4444"
                      />
                    </div>
                    <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                      {dtPortfolio.critical}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">High</span>
                      <Sparkline
                        data={dtHistory?.map((d) => d.high) ?? []}
                        color="#f97316"
                      />
                    </div>
                    <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">
                      {dtPortfolio.high}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Medium</span>
                      <Sparkline
                        data={dtHistory?.map((d) => d.medium) ?? []}
                        color="#f59e0b"
                      />
                    </div>
                    <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                      {dtPortfolio.medium}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Low</span>
                      <Sparkline
                        data={dtHistory?.map((d) => d.low) ?? []}
                        color="#3b82f6"
                      />
                    </div>
                    <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                      {dtPortfolio.low}
                    </p>
                  </div>
                </div>

                {/* Severity distribution bar */}
                <div>
                  <h3 className="text-sm font-medium mb-2">
                    Vulnerability Distribution
                  </h3>
                  <SeverityBar
                    critical={dtPortfolio.critical}
                    high={dtPortfolio.high}
                    medium={dtPortfolio.medium}
                    low={dtPortfolio.low}
                  />
                </div>

                {/* Progress rows + Risk gauge side by side */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <ProgressRow
                      label="Findings Audited"
                      current={dtPortfolio.findingsAudited}
                      total={dtPortfolio.findingsTotal}
                      color="bg-green-500"
                    />
                    <ProgressRow
                      label="Policy Violations"
                      current={
                        dtPortfolio.policyViolationsFail +
                        dtPortfolio.policyViolationsWarn
                      }
                      total={dtPortfolio.policyViolationsTotal}
                      color="bg-orange-500"
                    />
                    <ProgressRow
                      label="Projects Tracked"
                      current={dtPortfolio.projects}
                      total={dtPortfolio.projects}
                      color="bg-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <RiskGauge score={dtPortfolio.inheritedRiskScore} />
                  </div>
                </div>

                {/* Trend chart */}
                {dtHistory && dtHistory.length > 1 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Vulnerability Trend (30 days)
                    </h3>
                    <TrendChart data={dtHistory} />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Policy Violations Dashboard */}
      {dtEnabled && dtPortfolio && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold tracking-tight">
              Policy Violations
            </CardTitle>
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {dtPortfolio.policyViolationsTotal} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Violation count cards by type */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-400">Fail</span>
                </div>
                <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
                  {dtPortfolio.policyViolationsFail}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Warn</span>
                </div>
                <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                  {dtPortfolio.policyViolationsWarn}
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Info</span>
                </div>
                <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                  {dtPortfolio.policyViolationsInfo}
                </p>
              </div>
            </div>

            {/* Violations table */}
            {dtViolationsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : dtViolations && dtViolations.length > 0 ? (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Component</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Policy</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">State</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dtViolations.slice(0, 20).map((v) => (
                      <tr key={v.uuid} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="min-w-0 max-w-[200px]">
                            <p className="text-sm truncate">
                              {v.component.group
                                ? `${v.component.group}/${v.component.name}`
                                : v.component.name}
                            </p>
                            {v.component.version && (
                              <p className="text-xs text-muted-foreground">{v.component.version}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium">{v.policyCondition.policy.name}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant="outline"
                            className={`border font-semibold uppercase text-xs ${VIOLATION_STATE_BADGE[v.policyCondition.policy.violationState] ?? ""}`}
                          >
                            {v.policyCondition.policy.violationState}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {v.type}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dtViolations.length > 20 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                    Showing 20 of {dtViolations.length} violations.
                    View individual projects for the full list.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No policy violations found across tracked projects.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Repository Security Scores table */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          Repository Security Scores
        </h2>
        <DataTable
          columns={columns}
          data={scores ?? []}
          loading={scoresLoading}
          emptyMessage="No security scores yet. Enable scanning on a repository to get started."
          rowKey={(r) => r.id}
        />
      </div>

      {/* Trigger Scan Dialog */}
      <Dialog
        open={triggerOpen}
        onOpenChange={(o) => {
          setTriggerOpen(o);
          if (!o) {
            setSelectedRepoId(undefined);
            setSelectedArtifactId(undefined);
            setScanMode("repo");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trigger Security Scan</DialogTitle>
            <DialogDescription>
              {scanMode === "repo"
                ? "Select a repository to scan all its artifacts for vulnerabilities."
                : "Select a specific artifact to scan for vulnerabilities."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Scan Mode Toggle */}
            <div className="space-y-2">
              <Label>Scan Mode</Label>
              <div className="flex rounded-lg border p-1 gap-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    scanMode === "repo"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setScanMode("repo");
                    setSelectedArtifactId(undefined);
                  }}
                >
                  Entire Repository
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    scanMode === "artifact"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setScanMode("artifact");
                  }}
                >
                  Specific Artifact
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Repository</Label>
              <Select
                value={selectedRepoId ?? ""}
                onValueChange={(v) => {
                  setSelectedRepoId(v || undefined);
                  setSelectedArtifactId(undefined);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a repository..." />
                </SelectTrigger>
                <SelectContent>
                  {(
                    (repos as Array<{
                      id: string;
                      name: string;
                      key: string;
                      format: string;
                    }>) ?? []
                  ).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name || r.key} ({r.format})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Artifact selector (only in artifact mode) */}
            {scanMode === "artifact" && selectedRepoId && (
              <div className="space-y-2">
                <Label>Artifact</Label>
                <Select
                  value={selectedArtifactId ?? ""}
                  onValueChange={(v) => setSelectedArtifactId(v || undefined)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        artifactsLoading
                          ? "Loading artifacts..."
                          : "Select an artifact..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(artifactsList?.items ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.path})
                      </SelectItem>
                    ))}
                    {!artifactsLoading &&
                      (artifactsList?.items ?? []).length === 0 && (
                        <SelectItem value="__none__" disabled>
                          No artifacts found
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTriggerOpen(false);
                setSelectedRepoId(undefined);
                setSelectedArtifactId(undefined);
                setScanMode("repo");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                triggerScanMutation.isPending ||
                (scanMode === "repo" ? !selectedRepoId : !selectedArtifactId)
              }
              onClick={() => {
                if (scanMode === "repo" && selectedRepoId) {
                  triggerScanMutation.mutate({
                    repository_id: selectedRepoId,
                  });
                } else if (scanMode === "artifact" && selectedArtifactId) {
                  triggerScanMutation.mutate({
                    artifact_id: selectedArtifactId,
                  });
                }
              }}
            >
              {triggerScanMutation.isPending ? "Starting..." : "Start Scan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
