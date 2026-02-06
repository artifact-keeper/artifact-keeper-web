"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Download,
  RefreshCw,
  Package,
  Scale,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import sbomApi from "@/lib/api/sbom";
import type { SbomComponent, SbomFormat, CveHistoryEntry } from "@/types/sbom";
import type { Artifact } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { CopyButton } from "@/components/common/copy-button";

interface SbomTabContentProps {
  artifact: Artifact;
}

export function SbomTabContent({ artifact }: SbomTabContentProps) {
  const queryClient = useQueryClient();
  const [selectedFormat, setSelectedFormat] = useState<SbomFormat>("cyclonedx");
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [componentsPage, setComponentsPage] = useState(1);

  // Fetch existing SBOMs for artifact
  const { data: sboms, isLoading: sbomsLoading } = useQuery({
    queryKey: ["sboms", artifact.id],
    queryFn: () => sbomApi.list({ artifact_id: artifact.id }),
  });

  // Current SBOM based on selected format
  const currentSbom = sboms?.find((s) =>
    s.format.toLowerCase() === selectedFormat.toLowerCase()
  );

  // Fetch full SBOM with content when we have one
  const { data: sbomContent, isLoading: contentLoading } = useQuery({
    queryKey: ["sbom-content", currentSbom?.id],
    queryFn: () => sbomApi.get(currentSbom!.id),
    enabled: !!currentSbom?.id,
  });

  // Fetch components
  const { data: components, isLoading: componentsLoading } = useQuery({
    queryKey: ["sbom-components", currentSbom?.id],
    queryFn: () => sbomApi.getComponents(currentSbom!.id),
    enabled: !!currentSbom?.id,
  });

  // Fetch CVE history
  const { data: cveHistory, isLoading: cveLoading } = useQuery({
    queryKey: ["cve-history", artifact.id],
    queryFn: () => sbomApi.getCveHistory(artifact.id),
  });

  // Generate SBOM mutation
  const generateMutation = useMutation({
    mutationFn: (format: SbomFormat) =>
      sbomApi.generate({
        artifact_id: artifact.id,
        format,
        force_regenerate: !!currentSbom,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sboms", artifact.id] });
      toast.success("SBOM generated successfully");
    },
    onError: (err: Error) => {
      toast.error(`Failed to generate SBOM: ${err.message}`);
    },
  });

  // Download SBOM as JSON
  const handleDownload = () => {
    if (!sbomContent?.content) return;

    const blob = new Blob([JSON.stringify(sbomContent.content, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.name}-sbom-${selectedFormat}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Component columns
  const componentColumns: DataTableColumn<SbomComponent>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (c) => c.name,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Package className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{c.name}</span>
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (c) => c.version ?? "",
      cell: (c) =>
        c.version ? (
          <Badge variant="outline" className="text-xs font-mono">
            {c.version}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: "licenses",
      header: "Licenses",
      accessor: (c) => c.licenses?.join(", ") ?? "",
      cell: (c) =>
        c.licenses?.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {c.licenses.slice(0, 2).map((lic) => (
              <Badge key={lic} variant="secondary" className="text-xs">
                <Scale className="size-3 mr-1" />
                {lic}
              </Badge>
            ))}
            {c.licenses.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{c.licenses.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Unknown</span>
        ),
    },
    {
      id: "purl",
      header: "Package URL",
      accessor: (c) => c.purl ?? "",
      cell: (c) =>
        c.purl ? (
          <div className="flex items-center gap-1 max-w-[200px]">
            <code className="text-xs text-muted-foreground truncate">
              {c.purl}
            </code>
            <CopyButton value={c.purl} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
  ];

  if (sbomsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with format selector and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Software Bill of Materials</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedFormat}
            onValueChange={(v) => setSelectedFormat(v as SbomFormat)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cyclonedx">CycloneDX</SelectItem>
              <SelectItem value="spdx">SPDX</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate(selectedFormat)}
            disabled={generateMutation.isPending}
          >
            <RefreshCw
              className={`size-4 ${generateMutation.isPending ? "animate-spin" : ""}`}
            />
            {currentSbom ? "Regenerate" : "Generate"}
          </Button>
          {currentSbom && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="size-4" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* SBOM Summary */}
      {currentSbom ? (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Format"
              value={currentSbom.format.toUpperCase()}
              subvalue={`v${currentSbom.format_version}`}
            />
            <StatCard
              label="Components"
              value={currentSbom.component_count.toString()}
            />
            <StatCard
              label="Dependencies"
              value={currentSbom.dependency_count.toString()}
            />
            <StatCard
              label="Licenses"
              value={currentSbom.license_count.toString()}
            />
          </div>

          {/* License summary */}
          {currentSbom.licenses?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Detected Licenses
              </p>
              <div className="flex flex-wrap gap-1">
                {currentSbom.licenses.map((lic) => (
                  <Badge key={lic} variant="secondary" className="text-xs">
                    {lic}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Components table */}
          {(components?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Components ({components?.length ?? 0})
              </p>
              <DataTable
                columns={componentColumns}
                data={components ?? []}
                page={componentsPage}
                pageSize={10}
                total={components?.length}
                onPageChange={setComponentsPage}
                loading={componentsLoading}
                emptyMessage="No components found"
                rowKey={(c) => c.id}
              />
            </div>
          )}

          {/* CVE History */}
          {!cveLoading && (cveHistory?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                CVE History ({cveHistory?.length ?? 0})
              </p>
              <div className="rounded-lg border divide-y">
                {cveHistory?.slice(0, 5).map((cve) => (
                  <CveHistoryRow key={cve.id} cve={cve} />
                ))}
                {(cveHistory?.length ?? 0) > 5 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                    +{cveHistory!.length - 5} more CVEs
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Raw JSON viewer */}
          {sbomContent?.content && (
            <Collapsible open={jsonExpanded} onOpenChange={setJsonExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-0">
                  {jsonExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    View Raw JSON
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 rounded-md bg-muted p-4 text-xs overflow-auto max-h-64 font-mono">
                  {contentLoading
                    ? "Loading..."
                    : JSON.stringify(sbomContent.content, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Generation info */}
          <p className="text-xs text-muted-foreground">
            Generated {new Date(currentSbom.generated_at).toLocaleString()}
            {currentSbom.generator && ` by ${currentSbom.generator}`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="size-12 text-muted-foreground/50 mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            No SBOM generated for this artifact yet.
          </p>
          <Button
            onClick={() => generateMutation.mutate(selectedFormat)}
            disabled={generateMutation.isPending}
          >
            <FileText className="size-4" />
            Generate {selectedFormat.toUpperCase()} SBOM
          </Button>
        </div>
      )}
    </div>
  );
}

// Helper component for stat cards
function StatCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {subvalue && (
        <p className="text-xs text-muted-foreground">{subvalue}</p>
      )}
    </div>
  );
}

// Helper component for CVE history rows
function CveHistoryRow({ cve }: { cve: CveHistoryEntry }) {
  const severityColors: Record<string, string> = {
    critical: "text-red-600 bg-red-100 dark:bg-red-950/40",
    high: "text-orange-600 bg-orange-100 dark:bg-orange-950/40",
    medium: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/40",
    low: "text-blue-600 bg-blue-100 dark:bg-blue-950/40",
  };

  const statusIcons: Record<string, typeof ShieldAlert> = {
    open: ShieldAlert,
    fixed: ShieldCheck,
    acknowledged: AlertTriangle,
  };

  const StatusIcon = statusIcons[cve.status] ?? ShieldAlert;
  const severityClass = severityColors[cve.severity?.toLowerCase() ?? ""] ?? "";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusIcon
        className={`size-4 ${
          cve.status === "fixed"
            ? "text-green-500"
            : cve.status === "acknowledged"
              ? "text-yellow-500"
              : "text-red-500"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{cve.cve_id}</span>
          {cve.severity && (
            <Badge
              variant="outline"
              className={`text-xs uppercase ${severityClass}`}
            >
              {cve.severity}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-xs capitalize"
          >
            {cve.status}
          </Badge>
        </div>
        {cve.affected_component && (
          <p className="text-xs text-muted-foreground truncate">
            {cve.affected_component}
            {cve.affected_version && ` @ ${cve.affected_version}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3" />
        {new Date(cve.first_detected_at).toLocaleDateString()}
      </div>
    </div>
  );
}
