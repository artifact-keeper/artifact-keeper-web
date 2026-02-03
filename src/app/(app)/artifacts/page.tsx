"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import { artifactsApi } from "@/lib/api/artifacts";
import { formatBytes } from "@/lib/utils";
import type { Artifact, PaginatedResponse } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- page --

export default function ArtifactsPage() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string>("__all__");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Fetch all repos for the filter dropdown
  const { data: reposData } = useQuery({
    queryKey: ["repositories-list"],
    queryFn: () => repositoriesApi.list({ per_page: 200 }),
  });

  const repos = reposData?.items ?? [];

  // Build a lookup map for repo format
  const repoFormatMap = new Map<string, string>();
  repos.forEach((r) => repoFormatMap.set(r.key, r.format));

  // Fetch artifacts -- if a repo is selected, scope to that repo; otherwise fetch from all
  // The API requires a repoKey, so we fetch per-repo or iterate
  // For simplicity, we use the selected repo or default to the first available
  const activeRepoKey = selectedRepo !== "__all__" ? selectedRepo : undefined;

  const { data: artifactsData, isLoading } = useQuery({
    queryKey: ["global-artifacts", activeRepoKey, searchQuery, page, pageSize],
    queryFn: async (): Promise<PaginatedResponse<Artifact>> => {
      if (activeRepoKey) {
        return artifactsApi.list(activeRepoKey, {
          q: searchQuery || undefined,
          per_page: pageSize,
          page,
        });
      }
      // When "all repos" is selected, fetch from each repo and merge
      // In a real app the backend would have a global endpoint; for now
      // we aggregate client-side from available repos (capped to first 10 repos for perf)
      const repoKeys = repos.slice(0, 10).map((r) => r.key);
      if (repoKeys.length === 0) {
        return { items: [], pagination: { page: 1, per_page: pageSize, total: 0, total_pages: 0 } };
      }
      const results = await Promise.all(
        repoKeys.map((key) =>
          artifactsApi.list(key, {
            q: searchQuery || undefined,
            per_page: 50,
            page: 1,
          })
        )
      );
      const allItems = results.flatMap((r) => r.items);
      // Sort by created_at descending
      allItems.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const total = allItems.length;
      const start = (page - 1) * pageSize;
      const paged = allItems.slice(start, start + pageSize);
      return {
        items: paged,
        pagination: {
          page,
          per_page: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize),
        },
      };
    },
    enabled: repos.length > 0 || activeRepoKey !== undefined,
  });

  const columns: DataTableColumn<Artifact>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (a) => a.name,
      sortable: true,
      cell: (a) => (
        <span className="text-sm font-medium">{a.name}</span>
      ),
    },
    {
      id: "path",
      header: "Path",
      accessor: (a) => a.path,
      cell: (a) => (
        <code className="text-xs text-muted-foreground max-w-[180px] truncate block">
          {a.path}
        </code>
      ),
    },
    {
      id: "repository",
      header: "Repository",
      accessor: (a) => a.repository_key,
      sortable: true,
      cell: (a) => (
        <button
          className="text-sm text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/repositories/${a.repository_key}`);
          }}
        >
          {a.repository_key}
        </button>
      ),
    },
    {
      id: "format",
      header: "Format",
      accessor: (a) => repoFormatMap.get(a.repository_key) ?? "",
      cell: (a) => {
        const fmt = repoFormatMap.get(a.repository_key);
        return fmt ? (
          <Badge variant="secondary" className="text-xs font-normal">
            {fmt.toUpperCase()}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "size",
      header: "Size",
      accessor: (a) => a.size_bytes,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(a.size_bytes)}
        </span>
      ),
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (a) => a.download_count,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {a.download_count.toLocaleString()}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      accessor: (a) => a.created_at,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Artifacts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and search artifacts across all repositories.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedRepo}
          onValueChange={(v) => {
            setSelectedRepo(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Repository" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All repositories</SelectItem>
            {repos.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search artifacts..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {(selectedRepo !== "__all__" || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRepo("__all__");
              setSearchQuery("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={artifactsData?.items ?? []}
        total={artifactsData?.pagination?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        loading={isLoading}
        emptyMessage="No artifacts found."
        rowKey={(a) => a.id}
        onRowClick={(a) => router.push(`/repositories/${a.repository_key}`)}
      />
    </div>
  );
}
