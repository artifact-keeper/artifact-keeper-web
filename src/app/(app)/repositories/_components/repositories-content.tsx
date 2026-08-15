"use client";

import { useState, useCallback, useDeferredValue, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Search, RefreshCw, Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { repositoriesApi, type UpstreamAuthPayload } from "@/lib/api/repositories";
import { searchApi } from "@/lib/api/search";
import { invalidateGroup } from "@/lib/query-keys";
import type { Repository, CreateRepositoryRequest } from "@/types";
import { useAuth } from "@/providers/auth-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRepositories } from "@/hooks/use-repositories";
import { useFormatHandlers, wasmPluginFormats } from "@/hooks/use-format-handlers";
import { repoFormatLabel } from "@/lib/repo-format";
import { useDocumentTitle } from "@/hooks/use-document-title";

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

import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { FORMAT_GROUPS, TYPE_OPTIONS } from "../_lib/constants";
import { RepoListItem } from "./repo-list-item";
import { RepoDetailPanel } from "./repo-detail-panel";
import { RepoDialogs } from "./repo-dialogs";

export function RepositoriesContent() {
  const t = useTranslations("repositories");
  useDocumentTitle(t("title"));
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const isMobile = useIsMobile();

  // filter state
  const [formatFilter, setFormatFilter] = useState("__all__");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  // Defer the search value so the backend list query (`q`) and artifact search
  // don't refetch on every keystroke.
  const deferredSearch = useDeferredValue(searchQuery);

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // selection — initialize from URL if present
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (globalThis.window === undefined) return null;
    return new URL(globalThis.window.location.href).searchParams.get("selected");
  });

  // dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialogRepo, setDialogRepo] = useState<Repository | null>(null);

  // #410: outcome of the most recent upstream-auth save, mirrored into a live
  // region inside the edit dialog so screen-reader users hear success/failure.
  const [upstreamAuthStatus, setUpstreamAuthStatus] = useState<{
    state: "idle" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  // --- query ---
  const { data, isLoading, isFetching, isError, error, refetch } = useRepositories({
    per_page: pageSize,
    page,
    format: formatFilter === "__all__" ? undefined : formatFilter,
    repo_type: typeFilter === "__all__" ? undefined : typeFilter,
    // Server-side name/key search so matches on other pages are found, not just
    // the ones already loaded on the current page (#pagination-search).
    q: deferredSearch || undefined,
  });

  // Installed format handlers — drives the create dialog's custom WASM
  // plugin layouts (#591) and the plugin layout labels in the list (#592).
  const { data: formatHandlers } = useFormatHandlers();
  const pluginFormats = useMemo(() => wasmPluginFormats(formatHandlers), [formatHandlers]);

  // --- mutations ---

  const invalidateAllRepoQueries = () => invalidateGroup(queryClient, "repositories");

  const createMutation = useMutation({
    mutationFn: (d: CreateRepositoryRequest) => repositoriesApi.create(d),
    onSuccess: (_data, variables) => {
      invalidateAllRepoQueries();
      setCreateOpen(false);
      if (variables.repo_type === "staging") {
        toast.success(t("toast.created"), {
          description: t("toast.createdStaging"),
          action: {
            label: t("toast.goToStaging"),
            onClick: () => router.push("/staging"),
          },
        });
      } else {
        toast.success(t("toast.created"));
      }
    },
    onError: mutationErrorToast(t("toast.createFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, data: d }: { key: string; data: Partial<CreateRepositoryRequest> }) =>
      repositoriesApi.update(key, d),
    onSuccess: (updatedRepo, { key: originalKey }) => {
      invalidateAllRepoQueries();
      setEditOpen(false);
      setDialogRepo(null);
      // If the key was renamed, update the selected key and URL
      if (updatedRepo.key !== originalKey && selectedKey === originalKey) {
        setSelectedKey(updatedRepo.key);
        const url = new URL(globalThis.window.location.href);
        url.searchParams.set("selected", updatedRepo.key);
        globalThis.window.history.replaceState(null, "", url.toString());
      }
      toast.success(t("toast.updated"));
    },
    onError: mutationErrorToast(t("toast.updateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => repositoriesApi.delete(key),
    onSuccess: (_, deletedKey) => {
      invalidateAllRepoQueries();
      setDeleteOpen(false);
      setDialogRepo(null);
      if (selectedKey === deletedKey) setSelectedKey(null);
      toast.success(t("toast.deleted"));
    },
    onError: mutationErrorToast(t("toast.deleteFailed")),
  });

  const upstreamAuthMutation = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: UpstreamAuthPayload }) =>
      repositoriesApi.updateUpstreamAuth(key, payload),
    onMutate: () => {
      // Clear any previous outcome so the live region re-announces a repeat
      // result (e.g. two consecutive successes).
      setUpstreamAuthStatus({ state: "idle" });
    },
    onSuccess: () => {
      invalidateAllRepoQueries();
      const message = t("toast.upstreamAuthUpdated");
      toast.success(message);
      setUpstreamAuthStatus({ state: "success", message });
    },
    onError: (err: unknown) => {
      const message = toUserMessage(err, t("toast.upstreamAuthFailed"));
      toast.error(message);
      setUpstreamAuthStatus({ state: "error", message });
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
        const url = new URL(globalThis.window.location.href);
        url.searchParams.set("selected", repo.key);
        globalThis.window.history.replaceState(null, "", url.toString());
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
            placeholder={t("searchPlaceholder")}
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={formatFilter}
            onValueChange={(v) => { setFormatFilter(v); setPage(1); }}
          >
            <SelectTrigger className="h-7 text-xs flex-1" aria-label={t("filterByFormat")}>
              <SelectValue placeholder={t("format")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("allFormats")}</SelectItem>
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
            <SelectTrigger className="h-7 text-xs w-[100px]" aria-label={t("filterByType")}>
              <SelectValue placeholder={t("type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("allTypes")}</SelectItem>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(`typeLabels.${o.value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Repository list */}
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="p-3 space-y-2" role="status" aria-live="polite" aria-busy="true">
            {["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => (
              <div key={id} className="space-y-1.5 px-3 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}
        {/* #478: a failed list request must be visually distinct from a
            genuinely empty install, otherwise a transient backend outage reads
            as "all repositories were deleted". */}
        {!isLoading && isError && filtered.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-12 px-6 text-center text-muted-foreground"
            role="alert"
          >
            <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
            <p className="text-sm font-medium text-foreground">{t("loadFailed")}</p>
            <p className="mt-1 text-xs max-w-sm">
              {toUserMessage(error, t("loadFailedDetail"))}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("retry")}
            </Button>
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="size-8 mb-2 opacity-50" />
            <p className="text-sm">{t("noRepos")}</p>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
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
                formatLabel={repoFormatLabel(repo, formatHandlers)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination — total_pages reflects the (searched) result set, so it
          auto-hides when a filter narrows results to a single page. */}
      {totalPages > 1 && (
        <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("pageOf", { page, totalPages })}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label={t("previousPage")}
            >
              &lt;
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              aria-label={t("nextPage")}
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
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")}
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
                aria-label={t("refreshAria")}
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("refresh")}</TooltipContent>
          </Tooltip>
          {isAuthenticated && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("create")}
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
          orientation="horizontal"
          className="border rounded-lg overflow-hidden"
          style={{ height: "calc(100vh - 10rem)" }}
        >
          <ResizablePanel defaultSize="30%" minSize="20%" maxSize="45%">
            {masterContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="70%" minSize="55%">
            {effectiveSelectedKey ? (
              <RepoDetailPanel repoKey={effectiveSelectedKey} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="size-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">{t("selectRepo")}</p>
                <p className="text-xs mt-1">
                  {t("selectRepoDetail")}
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
          if (!o) {
            setDialogRepo(null);
            setUpstreamAuthStatus({ state: "idle" });
          }
        }}
        editRepo={dialogRepo}
        onEditSubmit={(key, d) => updateMutation.mutate({ key, data: d })}
        editPending={updateMutation.isPending}
        onUpstreamAuthUpdate={(key, payload) => upstreamAuthMutation.mutate({ key, payload })}
        upstreamAuthPending={upstreamAuthMutation.isPending}
        upstreamAuthStatus={upstreamAuthStatus}
        deleteOpen={deleteOpen}
        onDeleteOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDialogRepo(null);
        }}
        deleteRepo={dialogRepo}
        onDeleteConfirm={(key) => deleteMutation.mutate(key)}
        deletePending={deleteMutation.isPending}
        availableRepos={items}
        pluginFormats={pluginFormats}
      />
    </div>
  );
}
