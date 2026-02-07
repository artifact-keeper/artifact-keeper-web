"use client";

import { useState, useCallback, useDeferredValue, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, RefreshCw, Package } from "lucide-react";
import { toast } from "sonner";
import { AxiosError } from "axios";

import { repositoriesApi } from "@/lib/api/repositories";
import { searchApi } from "@/lib/api/search";
import type { Repository, CreateRepositoryRequest } from "@/types";
import { useAuth } from "@/providers/auth-provider";
import { useIsMobile } from "@/hooks/use-mobile";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { FORMAT_GROUPS, TYPE_OPTIONS } from "./_lib/constants";
import { RepoListItem } from "./_components/repo-list-item";
import { RepoDetailPanel } from "./_components/repo-detail-panel";
import { RepoDialogs } from "./_components/repo-dialogs";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError && err.response?.data?.error) {
    return err.response.data.error;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

export default function RepositoriesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const isMobile = useIsMobile();

  // filter state
  const [formatFilter, setFormatFilter] = useState("__all__");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // selection — initialize from URL if present
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("selected");
  });

  // dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialogRepo, setDialogRepo] = useState<Repository | null>(null);

  // --- query ---
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "repositories",
      formatFilter === "__all__" ? undefined : formatFilter,
      typeFilter === "__all__" ? undefined : typeFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      repositoriesApi.list({
        per_page: pageSize,
        page,
        format: formatFilter === "__all__" ? undefined : formatFilter,
        repo_type: typeFilter === "__all__" ? undefined : typeFilter,
      }),
  });

  // --- mutations ---
  const createMutation = useMutation({
    mutationFn: (d: CreateRepositoryRequest) => repositoriesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setCreateOpen(false);
      toast.success("Repository created");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Failed to create repository"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, data: d }: { key: string; data: Partial<CreateRepositoryRequest> }) =>
      repositoriesApi.update(key, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setEditOpen(false);
      setDialogRepo(null);
      toast.success("Repository updated");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Failed to update repository"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => repositoriesApi.delete(key),
    onSuccess: (_, deletedKey) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setDeleteOpen(false);
      setDialogRepo(null);
      if (selectedKey === deletedKey) setSelectedKey(null);
      toast.success("Repository deleted");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Failed to delete repository"));
    },
  });

  // --- handlers ---
  const handleSelect = useCallback(
    (repo: Repository) => {
      if (isMobile) {
        router.push(`/repositories/${repo.key}`);
      } else {
        setSelectedKey(repo.key);
        // Sync to URL without navigation
        const url = new URL(window.location.href);
        url.searchParams.set("selected", repo.key);
        window.history.replaceState(null, "", url.toString());
      }
    },
    [isMobile, router]
  );

  const handleEdit = useCallback((repo: Repository) => {
    setDialogRepo(repo);
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((repo: Repository) => {
    setDialogRepo(repo);
    setDeleteOpen(true);
  }, []);

  // Debounce the search query for artifact search API calls
  const deferredSearch = useDeferredValue(searchQuery);

  // Search artifacts via backend when query is non-empty
  const { data: artifactSearchResults } = useQuery({
    queryKey: ["repo-artifact-search", deferredSearch],
    queryFn: () => searchApi.quickSearch({ query: deferredSearch, limit: 50 }),
    enabled: deferredSearch.length >= 2,
    staleTime: 30_000,
  });

  // Build a map of repo keys -> artifact match count from search results
  const artifactMatchMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!artifactSearchResults) return map;
    for (const result of artifactSearchResults) {
      if (result.repository_key) {
        map.set(result.repository_key, (map.get(result.repository_key) ?? 0) + 1);
      }
    }
    return map;
  }, [artifactSearchResults]);

  // Fetch full repo data for artifact-matched repos not on the current page
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const currentPageKeys = useMemo(() => new Set(items.map((r) => r.key)), [items]);
  const missingRepoKeys = useMemo(() => {
    if (!searchQuery) return [];
    return [...artifactMatchMap.keys()].filter((key) => !currentPageKeys.has(key));
  }, [searchQuery, artifactMatchMap, currentPageKeys]);

  const { data: extraRepos } = useQuery({
    queryKey: ["repo-artifact-extras", missingRepoKeys],
    queryFn: () => Promise.all(missingRepoKeys.map((key) => repositoriesApi.get(key))),
    enabled: missingRepoKeys.length > 0,
    staleTime: 30_000,
  });

  // Filter and sort: artifact-matched repos first, then name-matched repos
  const filtered = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();

    // Repos from current page that match by name/key or artifact
    const nameMatched = items.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
    const artifactOnlyMatched = items.filter(
      (r) =>
        artifactMatchMap.has(r.key) &&
        !r.key.toLowerCase().includes(q) &&
        !r.name.toLowerCase().includes(q)
    );

    // Extra repos fetched from other pages (only artifact-matched)
    const extras = extraRepos ?? [];

    // Artifact-matched repos first, then name-matched
    return [...artifactOnlyMatched, ...extras, ...nameMatched];
  }, [searchQuery, items, artifactMatchMap, extraRepos]);

  // Auto-select first repo on desktop when none selected
  const autoSelectedKey = !isMobile && !selectedKey && filtered.length > 0 && !isLoading
    ? filtered[0].key
    : null;
  const effectiveSelectedKey = selectedKey ?? autoSelectedKey;

  const isAdmin = isAuthenticated && user?.is_admin;
  const totalPages = data?.pagination?.total_pages ?? 1;

  // --- render ---
  const masterContent = (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={formatFilter}
            onValueChange={(v) => { setFormatFilter(v); setPage(1); }}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All formats</SelectItem>
              {FORMAT_GROUPS.map(([group, options]) => (
                <SelectGroup key={group}>
                  <span className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group}
                  </span>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => { setTypeFilter(v); setPage(1); }}
          >
            <SelectTrigger className="h-7 text-xs w-[100px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Repository list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1.5 px-3 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="size-8 mb-2 opacity-50" />
            <p className="text-sm">No repositories found.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((repo) => (
              <RepoListItem
                key={repo.id}
                repo={repo}
                isSelected={effectiveSelectedKey === repo.key}
                onSelect={handleSelect}
                onEdit={isAdmin ? handleEdit : undefined}
                onDelete={isAdmin ? handleDelete : undefined}
                artifactMatchCount={searchQuery ? artifactMatchMap.get(repo.key) : undefined}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              &lt;
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              &gt;
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage artifact repositories across all formats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["repositories"] })
                }
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          {isAuthenticated && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Repository
            </Button>
          )}
        </div>
      </div>

      {/* Master-detail layout */}
      {isMobile ? (
        // Mobile: just the list, clicking navigates to detail page
        <div className="border rounded-lg overflow-hidden">{masterContent}</div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="repo-browser"
          className="border rounded-lg overflow-hidden"
          style={{ height: "calc(100vh - 10rem)" }}
        >
          <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
            {masterContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={70} minSize={55}>
            {effectiveSelectedKey ? (
              <RepoDetailPanel repoKey={effectiveSelectedKey} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="size-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a repository</p>
                <p className="text-xs mt-1">
                  Choose a repository from the list to view its contents.
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {/* Dialogs */}
      <RepoDialogs
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        onCreateSubmit={(d) => createMutation.mutate(d)}
        createPending={createMutation.isPending}
        editOpen={editOpen}
        onEditOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setDialogRepo(null);
        }}
        editRepo={dialogRepo}
        onEditSubmit={(key, d) => updateMutation.mutate({ key, data: d })}
        editPending={updateMutation.isPending}
        deleteOpen={deleteOpen}
        onDeleteOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDialogRepo(null);
        }}
        deleteRepo={dialogRepo}
        onDeleteConfirm={(key) => deleteMutation.mutate(key)}
        deletePending={deleteMutation.isPending}
        availableRepos={items}
      />
    </div>
  );
}
