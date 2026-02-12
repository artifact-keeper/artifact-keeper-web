"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search as SearchIcon,
  Download,
  LayoutGrid,
  LayoutList,
  Plus,
  Trash2,
  Loader2,
  Hash,
  Package,
  Tag,
  FileSearch,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { searchApi, type SearchResult } from "@/lib/api/search";
import { artifactsApi } from "@/lib/api/artifacts";
import { repositoriesApi } from "@/lib/api/repositories";
import { formatBytes as formatBytesUtil, formatDate } from "@/lib/utils";

// ---- Types ----

type SearchTab = "package" | "property" | "gavc" | "checksum";
type ViewMode = "list" | "grid";
type SortField = "name" | "created_at" | "size_bytes";

interface PropertyFilter {
  key: string;
  value: string;
}

interface PackageSearchValues {
  name: string;
  version: string;
  repository: string;
  format: string;
}

interface GavcSearchValues {
  groupId: string;
  artifactId: string;
  version: string;
  classifier: string;
}

interface ChecksumSearchValues {
  value: string;
  type: "sha256" | "sha1" | "md5";
}

// ---- Helpers ----

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "--";
  return formatBytesUtil(bytes);
}

const FORMAT_OPTIONS = [
  "maven",
  "npm",
  "pypi",
  "docker",
  "helm",
  "cargo",
  "nuget",
  "go",
  "rubygems",
  "debian",
  "rpm",
  "protobuf",
  "generic",
] as const;

// ---- Main Page ----

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[50vh]"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL state
  const urlQuery = searchParams.get("q") || "";
  const urlTab = (searchParams.get("tab") as SearchTab) || "package";

  // Local state
  const [activeTab, setActiveTab] = useState<SearchTab>(urlTab);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Per-tab form state
  const [packageValues, setPackageValues] = useState<PackageSearchValues>({
    name: urlQuery,
    version: "",
    repository: "",
    format: "",
  });
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilter[]>([
    { key: "", value: "" },
  ]);
  const [gavcValues, setGavcValues] = useState<GavcSearchValues>({
    groupId: "",
    artifactId: "",
    version: "",
    classifier: "",
  });
  const [checksumValues, setChecksumValues] = useState<ChecksumSearchValues>({
    value: "",
    type: "sha256",
  });

  // Track if search has been triggered
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchKey, setSearchKey] = useState(0);

  // Fetch repositories for select dropdown
  const { data: reposData } = useQuery({
    queryKey: ["repositories-list"],
    queryFn: () => repositoriesApi.list({ per_page: 100 }),
  });

  const repositories = reposData?.items ?? [];

  // Build search params based on active tab
  const buildSearchParams = useCallback(() => {
    switch (activeTab) {
      case "package":
        return {
          query: packageValues.name || undefined,
          version: packageValues.version || undefined,
          repository_key: packageValues.repository || undefined,
          format: packageValues.format || undefined,
          page,
          per_page: pageSize,
          sort_by: sortField,
        };
      case "property": {
        const queryParts = propertyFilters
          .filter((f) => f.key && f.value)
          .map((f) => `${f.key}:${f.value}`);
        return {
          query: queryParts.length > 0 ? queryParts.join(" ") : undefined,
          page,
          per_page: pageSize,
          sort_by: sortField,
        };
      }
      case "gavc":
        return {
          path: gavcValues.groupId || undefined,
          name: gavcValues.artifactId || undefined,
          version: gavcValues.version || undefined,
          page,
          per_page: pageSize,
          sort_by: sortField,
        };
      case "checksum":
        return null; // Checksum handled separately
    }
  }, [
    activeTab,
    packageValues,
    propertyFilters,
    gavcValues,
    page,
    pageSize,
    sortField,
  ]);

  // Main search query
  const {
    data: searchResults,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["advanced-search", searchKey, activeTab, page, sortField],
    queryFn: async () => {
      if (activeTab === "checksum") {
        if (!checksumValues.value) return null;
        const artifacts = await searchApi.checksumSearch({
          checksum: checksumValues.value,
          algorithm: checksumValues.type,
        });
        return {
          items: artifacts.map((a) => ({
            id: a.id,
            type: "artifact" as const,
            name: a.name,
            path: a.path,
            repository_key: a.repository_key,
            format: a.content_type,
            version: a.version,
            size_bytes: a.size_bytes,
            created_at: a.created_at,
          })),
          pagination: {
            page: 1,
            per_page: artifacts.length,
            total: artifacts.length,
            total_pages: 1,
          },
        };
      }

      const params = buildSearchParams();
      if (!params) return null;

      return searchApi.advancedSearch(params);
    },
    enabled: searchTriggered,
  });

  const totalResults = searchResults?.pagination?.total ?? 0;
  const totalPages = searchResults?.pagination?.total_pages ?? 0;

  // Update URL
  const updateUrl = useCallback(
    (tab: SearchTab) => {
      const params = new URLSearchParams();
      params.set("tab", tab);
      if (tab === "package" && packageValues.name) {
        params.set("q", packageValues.name);
      }
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router, packageValues.name]
  );

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearchTriggered(true);
    setSearchKey((k) => k + 1);
    updateUrl(activeTab);
  }, [activeTab, updateUrl]);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab as SearchTab);
      setSearchTriggered(false);
    },
    []
  );

  const handleDownload = useCallback((result: SearchResult) => {
    if (result.path && result.repository_key) {
      const url = artifactsApi.getDownloadUrl(result.repository_key, result.path);
      window.open(url, "_blank");
    }
  }, []);

  // Property filter helpers
  const addPropertyFilter = useCallback(() => {
    setPropertyFilters((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const removePropertyFilter = useCallback((index: number) => {
    setPropertyFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updatePropertyFilter = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      setPropertyFilters((prev) =>
        prev.map((f, i) => (i === index ? { ...f, [field]: val } : f))
      );
    },
    []
  );

  const loading = isLoading || isFetching;

  // Sort the results client-side as a fallback
  const sortedResults = useMemo(() => {
    const items: SearchResult[] = (searchResults?.items ?? []) as SearchResult[];
    const copy = [...items];
    copy.sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name);
      if (sortField === "size_bytes")
        return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return copy;
  }, [searchResults?.items, sortField]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Advanced Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all repositories, packages, and artifacts
        </p>
      </div>

      <Card className="py-0">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-6">
              <TabsTrigger value="package" className="gap-1.5">
                <Package className="size-3.5" />
                Package
              </TabsTrigger>
              <TabsTrigger value="property" className="gap-1.5">
                <Tag className="size-3.5" />
                Property
              </TabsTrigger>
              <TabsTrigger value="gavc" className="gap-1.5">
                <FileSearch className="size-3.5" />
                GAVC
              </TabsTrigger>
              <TabsTrigger value="checksum" className="gap-1.5">
                <Hash className="size-3.5" />
                Checksum
              </TabsTrigger>
            </TabsList>

            {/* Package Search Tab */}
            <TabsContent value="package">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Package Name</label>
                  <Input
                    placeholder="e.g., react, lodash"
                    value={packageValues.name}
                    onChange={(e) =>
                      setPackageValues((v) => ({ ...v, name: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Version</label>
                  <Input
                    placeholder="e.g., 1.0.0, ^2.0"
                    value={packageValues.version}
                    onChange={(e) =>
                      setPackageValues((v) => ({
                        ...v,
                        version: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Repository</label>
                  <Select
                    value={packageValues.repository}
                    onValueChange={(val) =>
                      setPackageValues((v) => ({
                        ...v,
                        repository: val === "__all__" ? "" : val,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All repositories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All repositories</SelectItem>
                      {repositories.map((r) => (
                        <SelectItem key={r.id} value={r.key}>
                          {r.name} ({r.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Format</label>
                  <Select
                    value={packageValues.format}
                    onValueChange={(val) =>
                      setPackageValues((v) => ({
                        ...v,
                        format: val === "__all__" ? "" : val,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All formats" />
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
                </div>
              </div>
            </TabsContent>

            {/* Property Search Tab */}
            <TabsContent value="property">
              <div className="space-y-3">
                {propertyFilters.map((filter, index) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-sm font-medium">
                        Property Key
                      </label>
                      <Input
                        placeholder="e.g., build.number"
                        value={filter.key}
                        onChange={(e) =>
                          updatePropertyFilter(index, "key", e.target.value)
                        }
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-sm font-medium">
                        Property Value
                      </label>
                      <Input
                        placeholder="e.g., 42"
                        value={filter.value}
                        onChange={(e) =>
                          updatePropertyFilter(index, "value", e.target.value)
                        }
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                    </div>
                    {propertyFilters.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePropertyFilter(index)}
                        className="shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPropertyFilter}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Add filter
                </Button>
              </div>
            </TabsContent>

            {/* GAVC Search Tab */}
            <TabsContent value="gavc">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Group ID</label>
                  <Input
                    placeholder="e.g., org.apache.maven"
                    value={gavcValues.groupId}
                    onChange={(e) =>
                      setGavcValues((v) => ({
                        ...v,
                        groupId: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Artifact ID</label>
                  <Input
                    placeholder="e.g., maven-core"
                    value={gavcValues.artifactId}
                    onChange={(e) =>
                      setGavcValues((v) => ({
                        ...v,
                        artifactId: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Version</label>
                  <Input
                    placeholder="e.g., 3.9.0"
                    value={gavcValues.version}
                    onChange={(e) =>
                      setGavcValues((v) => ({
                        ...v,
                        version: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Classifier</label>
                  <Input
                    placeholder="e.g., sources, javadoc"
                    value={gavcValues.classifier}
                    onChange={(e) =>
                      setGavcValues((v) => ({
                        ...v,
                        classifier: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Checksum Search Tab */}
            <TabsContent value="checksum">
              <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Checksum Value</label>
                  <Input
                    placeholder="Enter SHA-256, SHA-1, or MD5 checksum"
                    value={checksumValues.value}
                    onChange={(e) =>
                      setChecksumValues((v) => ({
                        ...v,
                        value: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Algorithm</label>
                  <Select
                    value={checksumValues.type}
                    onValueChange={(val) =>
                      setChecksumValues((v) => ({
                        ...v,
                        type: val as "sha256" | "sha1" | "md5",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sha256">SHA-256</SelectItem>
                      <SelectItem value="sha1">SHA-1</SelectItem>
                      <SelectItem value="md5">MD5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Search button */}
            <div className="mt-6 flex items-center gap-3">
              <Button onClick={handleSearch} disabled={loading} className="gap-2">
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <SearchIcon className="size-4" />
                )}
                Search
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Results */}
      {searchTriggered && (
        <Card className="py-0">
          <CardContent className="p-6">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Results</h2>
                {!loading && (
                  <span className="text-sm text-muted-foreground">
                    {totalResults} {totalResults === 1 ? "result" : "results"} found
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={sortField}
                  onValueChange={(val) => {
                    setSortField(val as SortField);
                    setSearchKey((k) => k + 1);
                  }}
                >
                  <SelectTrigger className="w-36" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Date</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="size_bytes">Size</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center rounded-md border">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-r-none"
                  >
                    <LayoutList className="size-4" />
                  </Button>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-l-none"
                  >
                    <LayoutGrid className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {!loading && sortedResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <SearchIcon className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No results found. Try adjusting your search criteria.
                </p>
              </div>
            )}

            {/* List view */}
            {!loading && sortedResults.length > 0 && viewMode === "list" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedResults.map((result) => (
                    <TableRow
                      key={result.id}
                      className="cursor-pointer"
                      onClick={() => {
                        if (result.repository_key && result.path) {
                          router.push(
                            `/repositories/${result.repository_key}?path=${encodeURIComponent(result.path)}`
                          );
                        }
                      }}
                    >
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {result.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {result.version || "--"}
                      </TableCell>
                      <TableCell>
                        {result.format && (
                          <Badge variant="secondary">{result.format}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {result.repository_key}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatBytes(result.size_bytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(result.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(result);
                          }}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Grid view */}
            {!loading && sortedResults.length > 0 && viewMode === "grid" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sortedResults.map((result) => (
                  <div
                    key={result.id}
                    className="group cursor-pointer rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    onClick={() => {
                      if (result.repository_key && result.path) {
                        router.push(
                          `/repositories/${result.repository_key}?path=${encodeURIComponent(result.path)}`
                        );
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">
                          {result.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {result.repository_key}
                          {result.path ? `/${result.path}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(result);
                        }}
                      >
                        <Download className="size-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      {result.format && (
                        <Badge variant="secondary" className="text-xs">
                          {result.format}
                        </Badge>
                      )}
                      {result.version && (
                        <span className="text-xs text-muted-foreground">
                          v{result.version}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatBytes(result.size_bytes)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage((p) => p - 1);
                      setSearchKey((k) => k + 1);
                    }}
                    className="gap-1"
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setPage((p) => p + 1);
                      setSearchKey((k) => k + 1);
                    }}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
