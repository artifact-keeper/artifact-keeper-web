"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, Package, ArrowUpRight } from "lucide-react";

import { promotionApi } from "@/lib/api/promotion";
import type { Repository } from "@/types";
import { useIsMobile } from "@/hooks/use-mobile";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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

import { FORMAT_OPTIONS } from "./_lib/constants";
import { StagingListItem } from "./_components/staging-list-item";
import { StagingDetailPanel } from "./_components/staging-detail-panel";

export default function StagingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // filter state
  const [formatFilter, setFormatFilter] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // selection - initialize from URL if present
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("selected");
  });

  // --- query ---
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "staging-repositories",
      formatFilter === "__all__" ? undefined : formatFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      promotionApi.listStagingRepos({
        per_page: pageSize,
        page,
        format: formatFilter === "__all__" ? undefined : formatFilter,
      }),
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (r) =>
        r.key.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [searchQuery, items]);

  // --- handlers ---
  const handleSelect = useCallback(
    (repo: Repository) => {
      if (isMobile) {
        router.push(`/staging/${repo.key}`);
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

  // Auto-select first repo on desktop when none selected
  const autoSelectedKey =
    !isMobile && !selectedKey && filtered.length > 0 && !isLoading
      ? filtered[0].key
      : null;
  const effectiveSelectedKey = selectedKey ?? autoSelectedKey;

  const totalPages = data?.pagination?.total_pages ?? 1;

  // --- render ---
  const masterContent = (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search staging repos..."
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={formatFilter}
            onValueChange={(v) => {
              setFormatFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All formats</SelectItem>
              {FORMAT_OPTIONS.map((o) => (
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
            <p className="text-sm">No staging repositories found.</p>
            <p className="text-xs mt-1">
              Create a staging repository to begin the promotion workflow.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((repo) => (
              <StagingListItem
                key={repo.id}
                repo={repo}
                isSelected={effectiveSelectedKey === repo.key}
                onSelect={handleSelect}
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
          <h1 className="text-2xl font-semibold tracking-tight">Staging</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and promote artifacts from staging to release repositories.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["staging-repositories"],
                  })
                }
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
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
          <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
            {masterContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={70} minSize={55}>
            {effectiveSelectedKey ? (
              <StagingDetailPanel repoKey={effectiveSelectedKey} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ArrowUpRight className="size-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a staging repository</p>
                <p className="text-xs mt-1">
                  Choose a repository to view artifacts and promote to release.
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
