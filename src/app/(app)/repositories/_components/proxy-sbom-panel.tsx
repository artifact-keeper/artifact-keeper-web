"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Package,
  Scale,
} from "lucide-react";

import { proxySbomApi } from "@/lib/api/proxy-sbom";
import { classifyProxyScanError } from "@/lib/proxy-scan";
import {
  PROXY_SBOM_FORMAT_UNSUPPORTED_COPY,
  PROXY_SBOM_GENERATION_NOTE,
  PROXY_SBOM_INVENTORY_CAVEAT,
  PROXY_SBOM_NOT_RECORDED_COPY,
  formatHasProxySbom,
  formatSbomDocument,
  parseProxySbom,
  sbomLicenseSummary,
} from "@/lib/proxy-sbom";
import type { ProxySbomComponent, ProxySbomFormat } from "@/types/proxy-sbom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

import { ProxyScanAccessNotice } from "./proxy-scan-panel";

/**
 * SBOM viewer for proxy-cached artifacts.
 *
 * Until now the SBOM tab could only tell a user that SBOMs are unavailable for
 * proxy content. They are not: every inline proxy scan catalogs the archive
 * while it runs, and this renders that inventory.
 *
 * The rule that shapes the states below: **an empty inventory is not an empty
 * SBOM.** A zero-row component table would assert the artifact has no
 * dependencies, which nothing in the data supports. Missing, unparseable and
 * empty documents all render as "no SBOM recorded", never as a table.
 */

const PAGE_SIZE = 20;

function componentColumns(): DataTableColumn<ProxySbomComponent>[] {
  return [
    {
      id: "name",
      header: "Component",
      accessor: (c) => c.name,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Package className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium break-all">{c.name}</span>
        </div>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (c) => c.version ?? "",
      sortable: true,
      cell: (c) =>
        c.version ? (
          <Badge variant="outline" className="text-xs font-mono">
            {c.version}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "license",
      header: "License",
      accessor: (c) => c.license ?? "",
      sortable: true,
      cell: (c) =>
        c.license ? (
          <Badge variant="secondary" className="text-xs">
            <Scale className="size-3 mr-1" />
            {c.license}
          </Badge>
        ) : (
          // The document asserted nothing. "Unknown" is the honest label; an
          // empty cell would read as "no license restrictions".
          <span className="text-xs text-muted-foreground">Unknown</span>
        ),
    },
    {
      id: "purl",
      header: "Package URL",
      accessor: (c) => c.purl ?? "",
      cell: (c) =>
        c.purl ? (
          <div className="flex items-center gap-1 max-w-[260px]">
            <code className="text-xs text-muted-foreground truncate" title={c.purl}>
              {c.purl}
            </code>
            <CopyButton value={c.purl} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];
}

/** Explicit "nothing recorded" state. Never a zero-row table. */
export function ProxySbomEmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center"
      data-testid="proxy-sbom-empty"
    >
      <FileText className="size-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
    </div>
  );
}

export function ProxySbomPanel({
  repositoryKey,
  path,
  artifactName,
  repositoryFormat,
}: {
  repositoryKey: string;
  /** Cache path within the repository. Lookup is by path, never by digest. */
  path: string;
  /** Used to name the downloaded file. */
  artifactName: string;
  /**
   * Repository format. Only PyPI, npm and Docker/OCI proxies run an inline
   * scan, so other formats are told that plainly rather than being sent to an
   * endpoint that has nothing to return.
   */
  repositoryFormat?: string | null;
}) {
  const [format, setFormat] = useState<ProxySbomFormat>("cyclonedx");
  const [page, setPage] = useState(1);
  const [rawExpanded, setRawExpanded] = useState(false);

  const supported = formatHasProxySbom(repositoryFormat);

  const { data, isLoading, error } = useQuery({
    queryKey: ["proxy-sbom", repositoryKey, path, format],
    queryFn: () => proxySbomApi.get(repositoryKey, path, format),
    enabled: supported,
    // A 401 must surface as the sign-in state immediately rather than being
    // retried behind a spinner.
    retry: false,
  });

  const inventory = parseProxySbom(data);
  const rawDocument = formatSbomDocument(data);

  const handleDownload = () => {
    if (!rawDocument) return;
    const blob = new Blob([rawDocument], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifactName}-proxy-sbom-${format}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const failure = error != null ? classifyProxyScanError(error) : null;
  const licenses =
    inventory.kind === "present" ? sbomLicenseSummary(inventory.components) : [];

  return (
    <div className="space-y-4" data-testid="proxy-sbom-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Proxy Cache SBOM</h3>
          {inventory.kind === "present" && (
            <Badge variant="secondary" className="text-xs">
              {inventory.components.length} component
              {inventory.components.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {supported && (
          <div className="flex items-center gap-2">
            <Select
              value={format}
              onValueChange={(v) => {
                setFormat(v as ProxySbomFormat);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="SBOM format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cyclonedx">CycloneDX</SelectItem>
                <SelectItem value="spdx">SPDX</SelectItem>
              </SelectContent>
            </Select>
            {inventory.kind === "present" && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="size-4" />
                Download
              </Button>
            )}
          </div>
        )}
      </div>

      {/* What this document is. Stated before the table, because the table
          would otherwise read as a resolved dependency graph. */}
      <p className="text-xs text-muted-foreground">
        {PROXY_SBOM_INVENTORY_CAVEAT}
      </p>

      {!supported ? (
        <ProxySbomEmptyState message={PROXY_SBOM_FORMAT_UNSUPPORTED_COPY} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : failure === "unauthenticated" || failure === "forbidden" ? (
        // Same rule as the verdict panel: never implied-empty for the audience
        // the endpoint refuses.
        <ProxyScanAccessNotice failure={failure} />
      ) : failure === "error" ? (
        <ProxyScanAccessNotice failure="error" />
      ) : inventory.kind === "absent" ? (
        // Covers a 404, an empty document, and an unparseable one. All three
        // mean "we have no inventory to show", which is not the same claim as
        // "this artifact has no dependencies".
        <ProxySbomEmptyState message={PROXY_SBOM_NOT_RECORDED_COPY} />
      ) : (
        <div className="space-y-4">
          {licenses.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Declared licenses ({licenses.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {licenses.map((license) => (
                  <Badge key={license} variant="secondary" className="text-xs">
                    {license}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <DataTable
            columns={componentColumns()}
            data={inventory.components}
            page={page}
            pageSize={PAGE_SIZE}
            total={inventory.components.length}
            onPageChange={setPage}
            emptyMessage="No components cataloged"
            rowKey={(c) => `${c.name}@${c.version ?? ""}|${c.purl ?? ""}`}
          />

          <Collapsible open={rawExpanded} onOpenChange={setRawExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-0">
                {rawExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  View raw {inventory.format === "spdx" ? "SPDX" : "CycloneDX"}{" "}
                  document
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex justify-end">
                <CopyButton value={rawDocument} label="Copy document" />
              </div>
              <pre
                className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-4 font-mono text-xs"
                data-testid="proxy-sbom-raw"
              >
                {rawDocument}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {PROXY_SBOM_GENERATION_NOTE}
      </p>
    </div>
  );
}
