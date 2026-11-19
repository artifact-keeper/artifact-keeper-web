"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { McpInstallSheet, McpServerCard } from "@/components/mcp";
import {
  DEFAULT_MCP_FILTERS,
  McpServerFilterBar,
  McpServerGrid,
  effectiveMcpSearch,
  filterMcpServers,
  packageIdIndex,
  packageIdOf,
  type McpGalleryView,
  type McpServerFilters,
} from "@/components/mcp/server-filters";
import { mcpApi } from "@/lib/api/mcp";
import { packagesApi } from "@/lib/api/packages";
import { repositoriesApi } from "@/lib/api/repositories";
import { mcpKeys } from "@/lib/mcp/query-keys";
import type { McpServedEntry } from "@/types/mcp";

/** Repositories and catalog rows per request (the backend's cap). */
const PAGE = 100;

interface CatalogEntry {
  repoKey: string;
  entry: McpServedEntry;
}

/**
 * Cross-repository MCP catalog (Phase 3): the latest servable version of
 * every server in every MCP registry the user can read. Each repository is
 * read through its own registry API, so held versions and private
 * repositories stay out exactly as they do for a client. The first page of
 * each registry is shown; a registry with more links to its own gallery.
 *
 * Served at `/mcp-servers`: `/mcp` itself is the registry API mount the
 * middleware proxies to the backend.
 */
export default function McpCatalogPage() {
  const [filters, setFilters] = useState<McpServerFilters>(DEFAULT_MCP_FILTERS);
  const [repoFilter, setRepoFilter] = useState("all");
  const [view, setView] = useState<McpGalleryView>("grid");
  const [installing, setInstalling] = useState<CatalogEntry | null>(null);
  const search = effectiveMcpSearch(filters.search);

  const repos = useQuery({
    queryKey: mcpKeys.catalog({ repositories: true }),
    queryFn: () => repositoriesApi.list({ format: "mcp", per_page: PAGE }),
  });
  const repoKeys = useMemo(() => (repos.data?.items ?? []).map((r) => r.key), [repos.data]);

  const lists = useQueries({
    queries: repoKeys.map((key) => ({
      queryKey: mcpKeys.servers(key, { version: "latest", search }),
      queryFn: () => mcpApi.listServers(key, { version: "latest", search: search || undefined, limit: PAGE }),
    })),
  });

  const { data: catalog } = useQuery({
    queryKey: mcpKeys.catalog({ packages: true }),
    queryFn: () => packagesApi.list({ format: "mcp", per_page: PAGE }),
    enabled: repoKeys.length > 0,
  });
  const ids = useMemo(() => packageIdIndex(catalog?.items), [catalog]);

  const all: CatalogEntry[] = [];
  const truncated: string[] = [];
  const failed: string[] = [];
  lists.forEach((q, i) => {
    const repoKey = repoKeys[i];
    if (q.isError) failed.push(repoKey);
    if (q.data?.nextCursor) truncated.push(repoKey);
    for (const entry of q.data?.servers ?? []) all.push({ repoKey, entry });
  });
  const inRepo = repoFilter === "all" ? all : all.filter((c) => c.repoKey === repoFilter);
  const kept = new Set(filterMcpServers(inRepo.map((c) => c.entry), filters));
  const shown = inRepo.filter((c) => kept.has(c.entry));
  const loading = repos.isLoading || lists.some((q) => q.isLoading);

  let body: React.ReactNode;
  if (loading) {
    body = (
      <McpServerGrid view={view}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </McpServerGrid>
    );
  } else if (repos.isError) {
    body = <EmptyState icon={AlertTriangle} title="Could not load MCP repositories" />;
  } else if (repoKeys.length === 0) {
    body = (
      <EmptyState
        icon={Plug}
        title="No MCP registries"
        description="Create a repository with the MCP Registry format to publish or curate servers."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/repositories">Go to repositories</Link>
          </Button>
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={Plug}
        title="No servers match"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFilters(DEFAULT_MCP_FILTERS);
              setRepoFilter("all");
            }}
          >
            Clear filters
          </Button>
        }
      />
    );
  } else {
    body = (
      <McpServerGrid view={view}>
        {shown.map(({ repoKey, entry }) => (
          <McpServerCard
            key={`${repoKey}/${entry.server.name}@${entry.server.version}`}
            repoKey={repoKey}
            entry={entry}
            packageId={packageIdOf(ids, repoKey, entry.server.name)}
            onInstall={(e) => setInstalling({ repoKey, entry: e })}
            showRepo
          />
        ))}
      </McpServerGrid>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="MCP Servers" description="Servers from every MCP registry you can read." />
      <McpServerFilterBar
        filters={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
        extra={
          repoKeys.length > 1 && (
            <Select value={repoFilter} onValueChange={setRepoFilter}>
              <SelectTrigger aria-label="Repository" size="sm" className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All repositories</SelectItem>
                {repoKeys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />
      {failed.length > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          Could not read {failed.join(", ")}.
        </p>
      )}
      {body}
      {truncated.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground" aria-label="Registries with more servers">
          {truncated.map((k) => (
            <li key={k}>
              {k} has more servers:{" "}
              <Link href={`/repositories/${encodeURIComponent(k)}?tab=packages`} className="text-primary hover:underline">
                browse {k}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <McpInstallSheet
        open={installing !== null}
        onOpenChange={(o) => {
          if (!o) setInstalling(null);
        }}
        repoKey={installing?.repoKey ?? ""}
        entry={installing?.entry ?? null}
      />
    </div>
  );
}
