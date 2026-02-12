"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  SearchIcon,
  Download,
  LayoutGrid,
  LayoutList,
  Package as PackageIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ArrowDownToLine,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { packagesApi } from "@/lib/api/packages";
import { repositoriesApi } from "@/lib/api/repositories";
import { getInstallCommand, FORMAT_OPTIONS } from "@/lib/package-utils";
import { formatBytes as formatBytesUtil, formatDate, formatNumber } from "@/lib/utils";
import type {
  Package,
  PackageVersion,
} from "@/types/packages";
import type { Repository } from "@/types";

// ---- Helpers ----

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "--";
  return formatBytesUtil(bytes);
}

type SortBy = "name" | "downloads" | "updated";
type ViewMode = "list" | "grid";

// ---- Package List Item ----

function PackageListItem({
  pkg,
  isSelected,
  onClick,
  viewMode,
}: {
  pkg: Package;
  isSelected: boolean;
  onClick: () => void;
  viewMode: ViewMode;
}) {
  if (viewMode === "grid") {
    return (
      <div
        className={`cursor-pointer rounded-lg border p-4 transition-all ${
          isSelected
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "hover:bg-muted/50"
        }`}
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{pkg.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {pkg.format}
              </Badge>
              {pkg.version && (
                <span className="text-xs text-muted-foreground">
                  v{pkg.version}
                </span>
              )}
            </div>
          </div>
        </div>
        {pkg.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {pkg.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowDownToLine className="size-3" />
            {formatNumber(pkg.download_count)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`cursor-pointer rounded-lg px-3 py-2.5 transition-all ${
        isSelected
          ? "bg-primary/5 border-l-2 border-primary"
          : "hover:bg-muted/50 border-l-2 border-transparent"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm truncate">{pkg.name}</p>
        <Badge variant="secondary" className="text-xs shrink-0">
          {pkg.format}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        {pkg.version && <span>v{pkg.version}</span>}
        <span>{formatNumber(pkg.download_count)} downloads</span>
      </div>
    </div>
  );
}

// ---- Package Detail Panel ----

function PackageDetailPanel({
  pkg,
  versions,
  isLoadingDetail,
}: {
  pkg: Package;
  versions: PackageVersion[];
  isLoadingDetail: boolean;
}) {
  const [copiedInstall, setCopiedInstall] = useState(false);

  const installCmd = getInstallCommand(
    pkg.name,
    pkg.version,
    pkg.format
  );

  const handleCopyInstall = useCallback(() => {
    navigator.clipboard.writeText(installCmd);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  }, [installCmd]);

  const license = (pkg.metadata as Record<string, unknown> | undefined)?.license as string | undefined;
  const author = (pkg.metadata as Record<string, unknown> | undefined)?.author as string | undefined;
  const homepageUrl = (pkg.metadata as Record<string, unknown> | undefined)?.homepage_url as string | undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{pkg.name}</h2>
              <Badge variant="secondary">{pkg.format}</Badge>
            </div>
            {pkg.version && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Latest: v{pkg.version}
              </p>
            )}
            {pkg.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                {pkg.description}
              </p>
            )}
          </div>
          {homepageUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-1.5"
              >
                <ExternalLink className="size-3.5" />
                Homepage
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Content tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="versions">
                Versions{versions.length > 0 ? ` (${versions.length})` : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 overflow-auto px-6 py-4">
            <div className="space-y-6">
              {/* Install command */}
              <div>
                <h3 className="text-sm font-medium mb-2">Install</h3>
                <div className="relative">
                  <pre className="rounded-lg bg-muted p-3 text-xs font-mono overflow-x-auto">
                    {installCmd}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCopyInstall}
                    className="absolute top-2 right-2"
                  >
                    {copiedInstall ? (
                      <Check className="size-3 text-green-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Metadata grid */}
              <div>
                <h3 className="text-sm font-medium mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetadataItem label="Format" value={pkg.format} />
                  <MetadataItem label="Repository" value={pkg.repository_key} />
                  <MetadataItem
                    label="Size"
                    value={formatBytes(pkg.size_bytes)}
                  />
                  <MetadataItem
                    label="Downloads"
                    value={formatNumber(pkg.download_count)}
                  />
                  {license && (
                    <MetadataItem label="License" value={license} />
                  )}
                  {author && (
                    <MetadataItem label="Author" value={author} />
                  )}
                  <MetadataItem
                    label="Created"
                    value={formatDate(pkg.created_at)}
                  />
                  <MetadataItem
                    label="Updated"
                    value={formatDate(pkg.updated_at)}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent
            value="versions"
            className="flex-1 overflow-auto px-6 py-4"
          >
            {isLoadingDetail ? (
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
                        {formatBytes(v.size_bytes)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(v.download_count)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(v.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-xs">
                          <Download className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
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

// ---- Main Packages Page ----

export default function PackagesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[50vh]"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <PackagesContent />
    </Suspense>
  );
}

function PackagesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filters from URL
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [format, setFormat] = useState(searchParams.get("format") || "");
  const [repository, setRepository] = useState(
    searchParams.get("repository") || ""
  );
  const [sortBy, setSortBy] = useState<SortBy>(
    (searchParams.get("sort") as SortBy) || "downloads"
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Selection and pagination
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    searchParams.get("selected") || null
  );
  const [page, setPage] = useState(1);
  const pageSize = 24;

  // Fetch repositories
  const { data: reposData } = useQuery({
    queryKey: ["repositories-for-packages"],
    queryFn: () => repositoriesApi.list({ per_page: 100 }),
  });
  const repositories: Repository[] = reposData?.items ?? [];

  // Fetch packages
  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["packages", search, format, repository, page, pageSize],
    queryFn: () =>
      packagesApi.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        format: format || undefined,
        repository_key: repository || undefined,
      }),
  });

  const packages = packagesData?.items ?? [];
  const totalPages = packagesData?.pagination?.total_pages ?? 0;
  const totalPackages = packagesData?.pagination?.total ?? 0;

  // Selected package
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) || null;

  // Fetch package details
  const { data: packageDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["package-detail", selectedPackageId],
    queryFn: () =>
      selectedPackageId ? packagesApi.get(selectedPackageId) : null,
    enabled: !!selectedPackageId,
  });

  // Fetch versions
  const { data: packageVersions, isLoading: versionsLoading } = useQuery({
    queryKey: ["package-versions", selectedPackageId],
    queryFn: () =>
      selectedPackageId ? packagesApi.getVersions(selectedPackageId) : null,
    enabled: !!selectedPackageId,
  });

  // Update URL with filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (format) params.set("format", format);
    if (repository) params.set("repository", repository);
    if (sortBy !== "downloads") params.set("sort", sortBy);
    if (selectedPackageId) params.set("selected", selectedPackageId);
    router.replace(`/packages?${params.toString()}`, { scroll: false });
  }, [search, format, repository, sortBy, selectedPackageId, router]);

  const handleSelectPackage = useCallback((pkg: Package) => {
    setSelectedPackageId(pkg.id);
  }, []);

  const handleFilterChange = useCallback(() => {
    setPage(1);
    setSelectedPackageId(null);
  }, []);

  // Sort packages client-side
  const sortedPackages = [...packages].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "downloads":
        return b.download_count - a.download_count;
      case "updated":
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      default:
        return 0;
    }
  });

  const detailPkg = packageDetail ?? selectedPackage;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row">
      {/* Left Panel */}
      <div
        className={`flex flex-col border-r ${
          selectedPackageId ? "w-full md:w-[350px]" : "w-full"
        } shrink-0`}
      >
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Packages</h1>
            {!packagesLoading && (
              <span className="text-xs text-muted-foreground">
                {totalPackages} total
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search packages..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleFilterChange();
              }}
              className="pl-8"
            />
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={format || "__all__"}
              onValueChange={(val) => {
                setFormat(val === "__all__" ? "" : val);
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-[120px]" size="sm">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All formats</SelectItem>
                {FORMAT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={repository || "__all__"}
              onValueChange={(val) => {
                setRepository(val === "__all__" ? "" : val);
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-[130px]" size="sm">
                <SelectValue placeholder="Repository" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All repos</SelectItem>
                {repositories.map((r) => (
                  <SelectItem key={r.id} value={r.key}>
                    {r.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(val) => setSortBy(val as SortBy)}
            >
              <SelectTrigger className="w-[120px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downloads">Downloads</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center rounded-md border ml-auto">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("list")}
                className="rounded-r-none"
              >
                <LayoutList className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("grid")}
                className="rounded-l-none"
              >
                <LayoutGrid className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Package list */}
        <ScrollArea className="flex-1">
          <div className={`p-2 ${viewMode === "grid" ? "grid grid-cols-1 gap-2" : "space-y-0.5"}`}>
            {packagesLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!packagesLoading && sortedPackages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <PackageIcon className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No packages found
                </p>
              </div>
            )}

            {!packagesLoading &&
              sortedPackages.map((pkg) => (
                <PackageListItem
                  key={pkg.id}
                  pkg={pkg}
                  isSelected={selectedPackageId === pkg.id}
                  onClick={() => handleSelectPackage(pkg)}
                  viewMode={viewMode}
                />
              ))}
          </div>
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t">
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - only show when there are packages to select */}
      {(selectedPackageId || sortedPackages.length > 0) && (
      <div className="flex-1 min-w-0 hidden md:flex">
        {!selectedPackageId ? (
          <div className="flex flex-col items-center justify-center w-full text-center">
            <PackageIcon className="size-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Select a package to view details
            </p>
          </div>
        ) : detailPkg ? (
          <div className="w-full overflow-hidden">
            <PackageDetailPanel
              pkg={detailPkg}
              versions={packageVersions ?? []}
              isLoadingDetail={detailLoading || versionsLoading}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      )}

      {/* Mobile detail view */}
      {selectedPackageId && detailPkg && (
        <div className="md:hidden fixed inset-0 z-50 bg-background">
          <div className="flex items-center gap-2 p-3 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPackageId(null)}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          </div>
          <div className="h-[calc(100vh-3rem)] overflow-auto">
            <PackageDetailPanel
              pkg={detailPkg}
              versions={packageVersions ?? []}
              isLoadingDetail={detailLoading || versionsLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
