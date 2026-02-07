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
} from "lucide-react";

import securityApi from "@/lib/api/security";
import dtApi from "@/lib/api/dependency-track";
import { artifactsApi } from "@/lib/api/artifacts";
import apiClient from "@/lib/api-client";
import type { RepoSecurityScore } from "@/types/security";
import type { DtPortfolioMetrics } from "@/types/dependency-track";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const { data: repos } = useQuery({
    queryKey: ["repositories-for-scan"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/v1/repositories", {
        params: { per_page: 100 },
      });
      return data?.items ?? data ?? [];
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

      {/* Dependency-Track Portfolio Summary */}
      {dtEnabled && dtPortfolio && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Dependency-Track Portfolio
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={AlertCircle}
              label="DT Critical"
              value={dtPortfolio.critical}
              color={dtPortfolio.critical > 0 ? "red" : "green"}
            />
            <StatCard
              icon={AlertTriangle}
              label="DT High"
              value={dtPortfolio.high}
              color={dtPortfolio.high > 0 ? "yellow" : "green"}
            />
            <StatCard
              icon={Bug}
              label="DT Findings"
              value={dtPortfolio.findingsTotal}
              color={dtPortfolio.findingsTotal > 0 ? "yellow" : "green"}
            />
            <StatCard
              icon={ShieldBan}
              label="DT Violations"
              value={dtPortfolio.policyViolationsTotal}
              color={dtPortfolio.policyViolationsTotal > 0 ? "red" : "green"}
            />
            <StatCard
              icon={ShieldCheck}
              label="DT Projects"
              value={dtPortfolio.projects}
              color="blue"
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Audited: {dtPortfolio.findingsAudited} / {dtPortfolio.findingsTotal}
            </span>
            <span>
              Risk Score: {dtPortfolio.inheritedRiskScore.toFixed(0)}
            </span>
          </div>
        </div>
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
