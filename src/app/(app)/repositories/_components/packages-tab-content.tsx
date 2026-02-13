"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Package as PackageIcon,
  ArrowLeft,
  Loader2,
  Tag,
  ArrowDownToLine,
} from "lucide-react";

import { packagesApi } from "@/lib/api/packages";
import { getInstallCommand } from "@/lib/package-utils";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";
import type { Package, PackageVersion } from "@/types/packages";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { CopyButton } from "@/components/common/copy-button";

interface PackagesTabContentProps {
  repositoryKey: string;
  repositoryFormat: string;
}

export function PackagesTabContent({
  repositoryKey,
  repositoryFormat,
}: PackagesTabContentProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Fetch packages for this repository
  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["repo-packages", repositoryKey, search, page, pageSize],
    queryFn: () =>
      packagesApi.list({
        repository_key: repositoryKey,
        search: search || undefined,
        page,
        per_page: pageSize,
      }),
  });

  const packages = packagesData?.items ?? [];

  // Fetch selected package detail
  const { data: packageDetail } = useQuery({
    queryKey: ["package-detail", selectedPackageId],
    queryFn: () => packagesApi.get(selectedPackageId!),
    enabled: !!selectedPackageId,
  });

  // Fetch versions for selected package
  const { data: packageVersions, isLoading: versionsLoading } = useQuery({
    queryKey: ["package-versions", selectedPackageId],
    queryFn: () => packagesApi.getVersions(selectedPackageId!),
    enabled: !!selectedPackageId,
  });

  const selectedPkg = packageDetail ?? packages.find((p) => p.id === selectedPackageId) ?? null;

  const handleSelectPackage = useCallback((pkg: Package) => {
    setSelectedPackageId(pkg.id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPackageId(null);
  }, []);

  // --- Detail view ---
  if (selectedPackageId && selectedPkg) {
    return (
      <PackageDetailView
        pkg={selectedPkg}
        versions={packageVersions ?? []}
        versionsLoading={versionsLoading}
        repositoryFormat={repositoryFormat}
        onBack={handleBack}
      />
    );
  }

  // --- List view ---
  const columns: DataTableColumn<Package>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <button
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectPackage(p);
          }}
        >
          <PackageIcon className="size-4 text-muted-foreground" />
          {p.name}
        </button>
      ),
    },
    {
      id: "version",
      header: "Latest Version",
      accessor: (p) => p.version ?? "",
      cell: (p) =>
        p.version ? (
          <Badge variant="outline" className="text-xs font-normal font-mono">
            {p.version}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (p) => p.download_count,
      sortable: true,
      cell: (p) => (
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <ArrowDownToLine className="size-3" />
          {formatNumber(p.download_count)}
        </span>
      ),
    },
    {
      id: "size",
      header: "Size",
      accessor: (p) => p.size_bytes,
      sortable: true,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.size_bytes ? formatBytes(p.size_bytes) : "-"}
        </span>
      ),
    },
    {
      id: "updated",
      header: "Updated",
      accessor: (p) => p.updated_at,
      sortable: true,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(p.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search packages..."
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={packages}
        total={packagesData?.pagination?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        loading={packagesLoading}
        emptyMessage="No packages in this repository yet."
        rowKey={(p) => p.id}
        onRowClick={handleSelectPackage}
      />
    </div>
  );
}

// --- Package Detail View (drill-down) ---

function PackageDetailView({
  pkg,
  versions,
  versionsLoading,
  repositoryFormat,
  onBack,
}: {
  pkg: Package;
  versions: PackageVersion[];
  versionsLoading: boolean;
  repositoryFormat: string;
  onBack: () => void;
}) {
  const installCmd = getInstallCommand(pkg.name, pkg.version, repositoryFormat);
  const license = (pkg.metadata as Record<string, unknown> | undefined)?.license as string | undefined;
  const author = (pkg.metadata as Record<string, unknown> | undefined)?.author as string | undefined;

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold truncate">{pkg.name}</h3>
            <Badge variant="secondary" className="text-xs">
              {repositoryFormat.toUpperCase()}
            </Badge>
          </div>
          {pkg.version && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Latest: v{pkg.version}
            </p>
          )}
        </div>
      </div>

      {pkg.description && (
        <p className="text-sm text-muted-foreground">{pkg.description}</p>
      )}

      {/* Sub-tabs: Overview + Versions */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">
            Versions{versions.length > 0 ? ` (${versions.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* Install command */}
          <div>
            <h4 className="text-sm font-medium mb-2">Install</h4>
            <div className="relative">
              <pre className="rounded-lg bg-muted p-3 text-xs font-mono overflow-x-auto pr-10">
                {installCmd}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton value={installCmd} />
              </div>
            </div>
          </div>

          {/* Metadata grid */}
          <div>
            <h4 className="text-sm font-medium mb-2">Details</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetadataItem label="Format" value={repositoryFormat} />
              <MetadataItem label="Repository" value={pkg.repository_key} />
              <MetadataItem
                label="Size"
                value={pkg.size_bytes ? formatBytes(pkg.size_bytes) : "--"}
              />
              <MetadataItem
                label="Downloads"
                value={formatNumber(pkg.download_count)}
              />
              {license && <MetadataItem label="License" value={license} />}
              {author && <MetadataItem label="Author" value={author} />}
              <MetadataItem label="Created" value={formatDate(pkg.created_at)} />
              <MetadataItem label="Updated" value={formatDate(pkg.updated_at)} />
            </div>
          </div>
        </TabsContent>

        {/* Versions */}
        <TabsContent value="versions" className="mt-4">
          {versionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Tag className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No version information available
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.version}>
                    <TableCell>
                      <span className="font-medium font-mono text-xs">
                        {v.version}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {v.size_bytes ? formatBytes(v.size_bytes) : "--"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatNumber(v.download_count)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(v.created_at)}
                    </TableCell>
                    <TableCell>
                      <CopyButton
                        value={getInstallCommand(pkg.name, v.version, repositoryFormat)}
                        label="Copy install command"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}
