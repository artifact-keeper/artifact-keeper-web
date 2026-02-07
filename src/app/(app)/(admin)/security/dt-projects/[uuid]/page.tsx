"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Info,
  Bug,
  CheckCircle2,
  Package,
  Scale,
  BarChart3,
  ExternalLink,
  Filter,
  CheckSquare,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

import dtApi from "@/lib/api/dependency-track";
import type {
  DtFinding,
  DtComponentFull,
  DtPolicyViolation,
  UpdateAnalysisRequest,
} from "@/types/dependency-track";
import { aggregateHistories } from "@/lib/dt-utils";
import {
  SeverityBar,
  RiskGauge,
  ProgressRow,
  TrendChart,
} from "@/components/dt";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { StatCard } from "@/components/common/stat-card";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- constants --

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  MEDIUM:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  LOW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  UNASSIGNED: "bg-secondary text-secondary-foreground border-border",
  INFO: "bg-secondary text-secondary-foreground border-border",
};

const ANALYSIS_STATES = [
  "NOT_SET",
  "IN_TRIAGE",
  "EXPLOITABLE",
  "NOT_AFFECTED",
  "RESOLVED",
  "FALSE_POSITIVE",
] as const;

const VIOLATION_STATE_BADGE: Record<string, string> = {
  FAIL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  WARN: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
};

function formatAnalysisState(state: string | null): string {
  if (!state) return "NOT_SET";
  return state.replace(/_/g, " ");
}

function findingKey(f: DtFinding): string {
  return `${f.vulnerability.uuid}-${f.component.uuid}`;
}

// -- Inline Triage Row --

function FindingTriageRow({
  finding,
  projectUuid,
  isSelected,
  onToggleSelect,
  isExpanded,
  onToggleExpand,
}: {
  finding: DtFinding;
  projectUuid: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const queryClient = useQueryClient();
  const currentState = finding.analysis?.state ?? "NOT_SET";

  const [triageState, setTriageState] = useState(currentState);
  const [justification, setJustification] = useState(finding.analysis?.justification ?? "");
  const [details, setDetails] = useState(finding.analysis?.details ?? "");
  const [suppressed, setSuppressed] = useState(finding.analysis?.isSuppressed ?? false);

  const updateMutation = useMutation({
    mutationFn: (req: UpdateAnalysisRequest) => dtApi.updateAnalysis(req),
    onSuccess: () => {
      toast.success("Analysis state updated");
      queryClient.invalidateQueries({ queryKey: ["dt", "project-findings", projectUuid] });
      queryClient.invalidateQueries({ queryKey: ["dt", "project-metrics", projectUuid] });
    },
    onError: () => {
      toast.error("Failed to update analysis state");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      project_uuid: projectUuid,
      component_uuid: finding.component.uuid,
      vulnerability_uuid: finding.vulnerability.uuid,
      state: triageState,
      justification: justification || undefined,
      details: details || undefined,
      suppressed,
    });
  };

  const vulnId = finding.vulnerability.vulnId;
  const isCve = vulnId.startsWith("CVE-");

  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        {/* Checkbox */}
        <td className="px-3 py-2.5 w-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        {/* Expand toggle */}
        <td className="px-2 py-2.5 w-8">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </td>
        {/* Severity */}
        <td className="px-3 py-2.5">
          <Badge
            variant="outline"
            className={`border font-semibold uppercase text-xs ${SEVERITY_BADGE[finding.vulnerability.severity] ?? ""}`}
          >
            {finding.vulnerability.severity}
          </Badge>
        </td>
        {/* Vulnerability */}
        <td className="px-3 py-2.5">
          {isCve ? (
            <a
              href={`https://nvd.nist.gov/vuln/detail/${vulnId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {vulnId}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-sm font-medium">{vulnId}</span>
          )}
        </td>
        {/* CVSS */}
        <td className="px-3 py-2.5">
          {finding.vulnerability.cvssV3BaseScore != null ? (
            <span className="text-sm font-medium tabular-nums">
              {finding.vulnerability.cvssV3BaseScore.toFixed(1)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </td>
        {/* Component */}
        <td className="px-3 py-2.5">
          <div className="min-w-0 max-w-[200px]">
            <p className="text-sm truncate">
              {finding.component.group
                ? `${finding.component.group}/${finding.component.name}`
                : finding.component.name}
            </p>
            {finding.component.version && (
              <p className="text-xs text-muted-foreground">{finding.component.version}</p>
            )}
          </div>
        </td>
        {/* Analysis State (inline select) */}
        <td className="px-3 py-2.5">
          <Select
            value={triageState}
            onValueChange={(v) => setTriageState(v)}
          >
            <SelectTrigger
              size="sm"
              className="w-[150px] h-7 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYSIS_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={`inline-block size-2 rounded-full mr-1.5 ${
                    s === "NOT_SET" ? "bg-gray-400" :
                    s === "IN_TRIAGE" ? "bg-amber-500" :
                    s === "EXPLOITABLE" ? "bg-red-500" :
                    "bg-emerald-500"
                  }`} />
                  {formatAnalysisState(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        {/* CWE */}
        <td className="px-3 py-2.5">
          {finding.vulnerability.cwe ? (
            <a
              href={`https://cwe.mitre.org/data/definitions/${finding.vulnerability.cwe.cweId}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              CWE-{finding.vulnerability.cwe.cweId}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
      </tr>
      {/* Expanded triage details */}
      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Justification
                </Label>
                <Input
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="e.g., code not reachable"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Details
                </Label>
                <Input
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Additional context..."
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Suppress
                </Label>
                <div className="flex items-center gap-2 h-8">
                  <Checkbox
                    checked={suppressed}
                    onCheckedChange={(checked) =>
                      setSuppressed(checked === true)
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    Suppress finding
                  </span>
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="h-8 text-xs"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="size-3 animate-spin mr-1" />
                      Saving...
                    </>
                  ) : (
                    "Save Triage"
                  )}
                </Button>
              </div>
            </div>
            {finding.vulnerability.description && (
              <p className="mt-3 text-xs text-muted-foreground max-w-2xl leading-relaxed">
                {finding.vulnerability.description}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function DtProjectDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // -- triage state --
  const [filterState, setFilterState] = useState<string>("ALL");
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<string>("NOT_AFFECTED");
  const [bulkJustification, setBulkJustification] = useState("");
  const [bulkDetails, setBulkDetails] = useState("");
  const [bulkSuppressed, setBulkSuppressed] = useState(false);

  // -- queries --
  const { data: dtStatus } = useQuery({
    queryKey: ["dt", "status"],
    queryFn: dtApi.getStatus,
  });

  const dtEnabled = dtStatus?.enabled && dtStatus?.healthy;

  const { data: projects } = useQuery({
    queryKey: ["dt", "projects"],
    queryFn: dtApi.listProjects,
    enabled: !!dtEnabled,
  });

  const project = useMemo(
    () => projects?.find((p) => p.uuid === uuid),
    [projects, uuid]
  );

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["dt", "project-metrics", uuid],
    queryFn: () => dtApi.getProjectMetrics(uuid!),
    enabled: !!dtEnabled && !!uuid,
  });

  const { data: findings, isLoading: findingsLoading } = useQuery({
    queryKey: ["dt", "project-findings", uuid],
    queryFn: () => dtApi.getProjectFindings(uuid!),
    enabled: !!dtEnabled && !!uuid,
  });

  const { data: components, isLoading: componentsLoading } = useQuery({
    queryKey: ["dt", "project-components", uuid],
    queryFn: () => dtApi.getProjectComponents(uuid!),
    enabled: !!dtEnabled && !!uuid,
  });

  const { data: violations, isLoading: violationsLoading } = useQuery({
    queryKey: ["dt", "project-violations", uuid],
    queryFn: () => dtApi.getProjectViolations(uuid!),
    enabled: !!dtEnabled && !!uuid,
  });

  const { data: metricsHistory } = useQuery({
    queryKey: ["dt", "project-metrics-history", uuid],
    queryFn: () => dtApi.getProjectMetricsHistory(uuid!, 30),
    enabled: !!dtEnabled && !!uuid,
  });

  // -- aggregate history for trend chart --
  const trendData = useMemo(() => {
    if (!metricsHistory || !uuid) return [];
    return aggregateHistories({ [uuid]: metricsHistory });
  }, [metricsHistory, uuid]);

  // -- filtered findings --
  const filteredFindings = useMemo(() => {
    if (!findings) return [];
    if (filterState === "ALL") return findings;
    return findings.filter((f) => {
      const state = f.analysis?.state ?? "NOT_SET";
      return state === filterState;
    });
  }, [findings, filterState]);

  // -- selection helpers --
  const toggleFinding = useCallback((key: string) => {
    setSelectedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    if (!filteredFindings) return;
    const allKeys = filteredFindings.map(findingKey);
    const allSelected = allKeys.every((k) => selectedFindings.has(k));
    if (allSelected) {
      setSelectedFindings(new Set());
    } else {
      setSelectedFindings(new Set(allKeys));
    }
  }, [filteredFindings, selectedFindings]);

  // -- bulk update mutation --
  const bulkUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!findings || !uuid) return;
      const selected = findings.filter((f) => selectedFindings.has(findingKey(f)));
      await Promise.all(
        selected.map((f) =>
          dtApi.updateAnalysis({
            project_uuid: uuid,
            component_uuid: f.component.uuid,
            vulnerability_uuid: f.vulnerability.uuid,
            state: bulkState,
            justification: bulkJustification || undefined,
            details: bulkDetails || undefined,
            suppressed: bulkSuppressed,
          })
        )
      );
    },
    onSuccess: () => {
      toast.success(`Updated ${selectedFindings.size} finding(s)`);
      setSelectedFindings(new Set());
      queryClient.invalidateQueries({ queryKey: ["dt", "project-findings", uuid] });
      queryClient.invalidateQueries({ queryKey: ["dt", "project-metrics", uuid] });
    },
    onError: () => {
      toast.error("Failed to update some findings");
    },
  });

  // -- loading state --
  if (!dtStatus) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // -- components table columns --
  const componentsColumns: DataTableColumn<DtComponentFull>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (r) => (r.group ? `${r.group}/${r.name}` : r.name),
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {r.group ? `${r.group}/${r.name}` : r.name}
          </p>
          {r.isInternal && (
            <Badge variant="secondary" className="text-xs font-normal mt-0.5">
              Internal
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (r) => r.version ?? "",
      sortable: true,
      cell: (r) =>
        r.version ? (
          <code className="text-xs">{r.version}</code>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "license",
      header: "License",
      accessor: (r) =>
        r.resolvedLicense?.licenseId ?? r.resolvedLicense?.name ?? "",
      sortable: true,
      cell: (r) =>
        r.resolvedLicense ? (
          <Badge variant="outline" className="text-xs font-normal">
            {r.resolvedLicense.licenseId ?? r.resolvedLicense.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Unknown</span>
        ),
    },
    {
      id: "purl",
      header: "Package URL",
      accessor: (r) => r.purl ?? "",
      cell: (r) =>
        r.purl ? (
          <code className="text-xs text-muted-foreground truncate block max-w-[300px]">
            {r.purl}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
  ];

  // -- violations table columns --
  const violationsColumns: DataTableColumn<DtPolicyViolation>[] = [
    {
      id: "state",
      header: "State",
      accessor: (r) => r.policyCondition.policy.violationState,
      sortable: true,
      cell: (r) => {
        const state = r.policyCondition.policy.violationState;
        return (
          <Badge
            variant="outline"
            className={`border font-semibold uppercase text-xs ${VIOLATION_STATE_BADGE[state] ?? ""}`}
          >
            {state}
          </Badge>
        );
      },
    },
    {
      id: "policy",
      header: "Policy",
      accessor: (r) => r.policyCondition.policy.name,
      sortable: true,
      cell: (r) => (
        <span className="text-sm font-medium">
          {r.policyCondition.policy.name}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      accessor: (r) => r.type,
      sortable: true,
      cell: (r) => (
        <Badge variant="secondary" className="text-xs font-normal">
          {r.type}
        </Badge>
      ),
    },
    {
      id: "condition",
      header: "Condition",
      accessor: (r) => `${r.policyCondition.subject} ${r.policyCondition.operator}`,
      cell: (r) => (
        <div className="text-xs">
          <span className="text-muted-foreground">
            {r.policyCondition.subject}
          </span>{" "}
          <span className="font-medium">{r.policyCondition.operator}</span>{" "}
          <code className="text-muted-foreground">
            {r.policyCondition.value}
          </code>
        </div>
      ),
    },
    {
      id: "component",
      header: "Component",
      accessor: (r) =>
        r.component.group
          ? `${r.component.group}/${r.component.name}`
          : r.component.name,
      sortable: true,
      cell: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="text-sm truncate">
            {r.component.group
              ? `${r.component.group}/${r.component.name}`
              : r.component.name}
          </p>
          {r.component.version && (
            <p className="text-xs text-muted-foreground">{r.component.version}</p>
          )}
        </div>
      ),
    },
  ];

  const allFilteredSelected =
    filteredFindings.length > 0 &&
    filteredFindings.every((f) => selectedFindings.has(findingKey(f)));

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => router.push("/security/dt-projects")}
        >
          <ArrowLeft className="size-4 mr-1" />
          DT Projects
        </Button>
        <span>/</span>
        <span className="font-medium text-foreground">
          {project?.name ?? uuid?.slice(0, 12)}
        </span>
      </div>

      {/* Project header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project?.name ?? "Loading..."}
          {project?.version && (
            <Badge variant="secondary" className="ml-2 text-sm font-normal align-middle">
              {project.version}
            </Badge>
          )}
        </h1>
        {project?.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {project.description}
          </p>
        )}
        {project?.lastBomImport && (
          <p className="text-xs text-muted-foreground mt-1">
            Last BOM import:{" "}
            {new Date(project.lastBomImport).toLocaleString()}
            {project.lastBomImportFormat && (
              <span className="ml-1">({project.lastBomImportFormat})</span>
            )}
          </p>
        )}
      </div>

      {/* Summary stat cards */}
      {metricsLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : (
        metrics && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              icon={AlertCircle}
              label="Critical"
              value={metrics.critical}
              color={metrics.critical > 0 ? "red" : "green"}
            />
            <StatCard
              icon={AlertTriangle}
              label="High"
              value={metrics.high}
              color={metrics.high > 0 ? "red" : "green"}
            />
            <StatCard
              icon={ShieldAlert}
              label="Medium"
              value={metrics.medium}
              color={metrics.medium > 0 ? "yellow" : "green"}
            />
            <StatCard
              icon={Info}
              label="Low"
              value={metrics.low}
              color="blue"
            />
            <StatCard
              icon={CheckCircle2}
              label="Audited"
              value={`${metrics.findingsAudited}/${metrics.findingsTotal}`}
              color="green"
            />
            <StatCard
              icon={Bug}
              label="Risk Score"
              value={metrics.inheritedRiskScore}
              color={metrics.inheritedRiskScore >= 70 ? "red" : metrics.inheritedRiskScore >= 40 ? "yellow" : "green"}
            />
          </div>
        )
      )}

      {/* Tabbed content */}
      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings">
            <Bug className="size-4 mr-1.5" />
            Findings
            {findings && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {findings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="components">
            <Package className="size-4 mr-1.5" />
            Components
            {components && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {components.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="violations">
            <Scale className="size-4 mr-1.5" />
            Violations
            {violations && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {violations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 className="size-4 mr-1.5" />
            Metrics
          </TabsTrigger>
        </TabsList>

        {/* Findings Tab - Enhanced with triage */}
        <TabsContent value="findings" className="mt-4 space-y-4">
          {/* Toolbar: Filter + Bulk operations */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Filter by analysis state */}
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <Select value={filterState} onValueChange={setFilterState}>
                <SelectTrigger size="sm" className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Filter by state..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All States</SelectItem>
                  {ANALYSIS_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className={`inline-block size-2 rounded-full mr-1.5 ${
                        s === "NOT_SET" ? "bg-gray-400" :
                        s === "IN_TRIAGE" ? "bg-amber-500" :
                        s === "EXPLOITABLE" ? "bg-red-500" :
                        "bg-emerald-500"
                      }`} />
                      {formatAnalysisState(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filterState !== "ALL" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setFilterState("ALL")}
                >
                  <X className="size-3 mr-1" />
                  Clear
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                {filteredFindings.length} finding(s)
              </span>
            </div>

            {/* Bulk selection info */}
            {selectedFindings.size > 0 && (
              <div className="flex items-center gap-2">
                <CheckSquare className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {selectedFindings.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedFindings(new Set())}
                >
                  Deselect all
                </Button>
              </div>
            )}
          </div>

          {/* Bulk update panel */}
          {selectedFindings.size > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Set State</Label>
                    <Select value={bulkState} onValueChange={setBulkState}>
                      <SelectTrigger size="sm" className="w-[160px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYSIS_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {formatAnalysisState(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Justification</Label>
                    <Input
                      value={bulkJustification}
                      onChange={(e) => setBulkJustification(e.target.value)}
                      placeholder="Optional..."
                      className="h-8 text-xs w-[180px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Details</Label>
                    <Input
                      value={bulkDetails}
                      onChange={(e) => setBulkDetails(e.target.value)}
                      placeholder="Optional..."
                      className="h-8 text-xs w-[180px]"
                    />
                  </div>
                  <div className="flex items-center gap-2 h-8">
                    <Checkbox
                      checked={bulkSuppressed}
                      onCheckedChange={(c) => setBulkSuppressed(c === true)}
                    />
                    <span className="text-xs">Suppress</span>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => bulkUpdateMutation.mutate()}
                    disabled={bulkUpdateMutation.isPending || selectedFindings.size === 0}
                  >
                    {bulkUpdateMutation.isPending ? (
                      <>
                        <Loader2 className="size-3 animate-spin mr-1" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckSquare className="size-3 mr-1" />
                        Update {selectedFindings.size} Finding(s)
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Findings table with triage */}
          {findingsLoading ? (
            <div className="space-y-3">
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2.5 w-10" />
                      <th className="px-2 py-2.5 w-8" />
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Severity</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vulnerability</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CVSS</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Component</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Analysis</th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CWE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-2.5">
                            <Skeleton className="h-4 w-full max-w-[120px]" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2.5 w-10" />
                    <th className="px-2 py-2.5 w-8" />
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Severity</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vulnerability</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CVSS</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Component</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Analysis</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CWE</th>
                  </tr>
                </thead>
              </table>
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                {filterState !== "ALL"
                  ? `No findings with state "${formatAnalysisState(filterState)}".`
                  : "No findings for this project."}
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2.5 w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAllFiltered}
                      />
                    </th>
                    <th className="px-2 py-2.5 w-8" />
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Severity</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vulnerability</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CVSS</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Component</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Analysis</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CWE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFindings.map((f) => {
                    const key = findingKey(f);
                    return (
                      <FindingTriageRow
                        key={key}
                        finding={f}
                        projectUuid={uuid!}
                        isSelected={selectedFindings.has(key)}
                        onToggleSelect={() => toggleFinding(key)}
                        isExpanded={expandedFindings.has(key)}
                        onToggleExpand={() => toggleExpanded(key)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Components Tab */}
        <TabsContent value="components" className="mt-4">
          <DataTable
            columns={componentsColumns}
            data={components ?? []}
            loading={componentsLoading}
            emptyMessage="No components found in this project."
            rowKey={(r) => r.uuid}
          />
        </TabsContent>

        {/* Violations Tab */}
        <TabsContent value="violations" className="mt-4">
          <DataTable
            columns={violationsColumns}
            data={violations ?? []}
            loading={violationsLoading}
            emptyMessage="No policy violations for this project."
            rowKey={(r) => r.uuid}
          />
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="mt-4">
          <div className="space-y-6">
            {metricsLoading ? (
              <div className="space-y-6">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              metrics && (
                <>
                  {/* Severity distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Vulnerability Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SeverityBar
                        critical={metrics.critical}
                        high={metrics.high}
                        medium={metrics.medium}
                        low={metrics.low}
                      />
                    </CardContent>
                  </Card>

                  {/* Progress + Risk Gauge side by side */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Audit Progress
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ProgressRow
                          label="Findings Audited"
                          current={metrics.findingsAudited}
                          total={metrics.findingsTotal}
                          color="bg-green-500"
                        />
                        <ProgressRow
                          label="Policy Violations"
                          current={
                            metrics.policyViolationsFail +
                            metrics.policyViolationsWarn
                          }
                          total={metrics.policyViolationsTotal}
                          color="bg-orange-500"
                        />
                        <ProgressRow
                          label="Suppressions"
                          current={metrics.suppressions}
                          total={metrics.findingsTotal}
                          color="bg-slate-500"
                        />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Inherited Risk Score
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex items-center justify-center">
                        <RiskGauge score={metrics.inheritedRiskScore} />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Trend chart */}
                  {trendData.length > 1 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Vulnerability Trend (30 days)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <TrendChart data={trendData} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Detailed metrics grid */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Detailed Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Total Vulnerabilities
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {metrics.vulnerabilities ?? (metrics.critical + metrics.high + metrics.medium + metrics.low + metrics.unassigned)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Findings Total
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {metrics.findingsTotal}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Findings Audited
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {metrics.findingsAudited}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Findings Unaudited
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {metrics.findingsUnaudited}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Suppressions
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {metrics.suppressions}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Policy Violations (Fail)
                          </p>
                          <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {metrics.policyViolationsFail}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Policy Violations (Warn)
                          </p>
                          <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {metrics.policyViolationsWarn}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Policy Violations (Info)
                          </p>
                          <p className="text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {metrics.policyViolationsInfo}
                          </p>
                        </div>
                        {metrics.firstOccurrence && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              First Occurrence
                            </p>
                            <p className="text-sm">
                              {new Date(metrics.firstOccurrence).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        {metrics.lastOccurrence && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Last Occurrence
                            </p>
                            <p className="text-sm">
                              {new Date(metrics.lastOccurrence).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
