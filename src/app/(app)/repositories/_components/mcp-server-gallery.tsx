"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { McpInstallSheet, McpServerCard } from "@/components/mcp";
import {
  DEFAULT_MCP_FILTERS,
  McpServerFilterBar,
  McpServerGrid,
  effectiveMcpSearch,
  filterMcpServers,
  hasActiveMcpFilters,
  packageIdIndex,
  packageIdOf,
  type McpGalleryView,
  type McpServerFilters,
} from "@/components/mcp/server-filters";
import { mcpApi } from "@/lib/api/mcp";
import { packagesApi } from "@/lib/api/packages";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { useAuth } from "@/providers/auth-provider";
import type { McpServedEntry } from "@/types/mcp";

/** The backend caps a package page at 100 rows. */
const CATALOG_PAGE = 100;

interface McpServerGalleryProps {
  repositoryKey: string;
  /** `local` / `staging` (hosted) or `remote`; picks the empty state. */
  repositoryType?: string;
}

/**
 * Names in the package catalog that the registry serves no version of.
 * Every version of such a server is held (quarantine, scan policy, backing
 * package, age gate) or deleted, so a client cannot see it at all. Only
 * meaningful once every served page is loaded and no search narrows it.
 */
export function heldServerNames(catalog: { name: string }[], served: McpServedEntry[]): string[] {
  const servedNames = new Set(served.map((e) => e.server.name));
  return [...new Set(catalog.map((p) => p.name))].filter((n) => !servedNames.has(n)).sort();
}

function HeldFooter({ names, ids }: { names: string[]; ids: Map<string, string> }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, 5);
  return (
    <div
      role="status"
      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p>
          {names.length} server{names.length === 1 ? " has" : "s have"} no version clients can see.
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {shown.map((n) => {
            const id = ids.get(n);
            return (
              <li key={n} className="font-mono text-xs">
                {id ? (
                  <Link href={`/packages/${encodeURIComponent(id)}`} className="underline">
                    {n}
                  </Link>
                ) : (
                  n
                )}
              </li>
            );
          })}
          {names.length > shown.length && <li className="text-xs">and {names.length - shown.length} more</li>}
        </ul>
      </div>
    </div>
  );
}

/**
 * The Servers tab of an MCP repository: served documents from the
 * repository's own registry API (AK coordinates already rewritten, held
 * versions omitted), as cards with an Install sheet.
 */
export function McpServerGallery({ repositoryKey, repositoryType }: McpServerGalleryProps) {
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;
  // A card without a catalog id links back here with `?server=<name>`.
  const serverParam = useSearchParams()?.get("server") ?? "";
  const [filters, setFilters] = useState<McpServerFilters>({ ...DEFAULT_MCP_FILTERS, search: serverParam });
  // A later `?server=` (the Artifacts tab's "Delete in the MCP registry")
  // narrows the already-mounted gallery to that server too.
  const [seenServerParam, setSeenServerParam] = useState(serverParam);
  if (serverParam !== seenServerParam) {
    setSeenServerParam(serverParam);
    if (serverParam) setFilters((f) => ({ ...f, search: serverParam }));
  }
  const [view, setView] = useState<McpGalleryView>("grid");
  const [installing, setInstalling] = useState<McpServedEntry | null>(null);
  const search = effectiveMcpSearch(filters.search);

  const servers = useInfiniteQuery({
    queryKey: mcpKeys.servers(repositoryKey, { version: "latest", search }),
    queryFn: ({ pageParam }) =>
      mcpApi.listServers(repositoryKey, { version: "latest", search: search || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  // The catalog rows give the package id the detail page is keyed by, and
  // the names whose every version is held.
  const { data: catalog } = useQuery({
    queryKey: [...mcpKeys.all, "catalog-packages", repositoryKey],
    queryFn: () => packagesApi.list({ repository_key: repositoryKey, per_page: CATALOG_PAGE }),
  });

  const loaded = useMemo(() => servers.data?.pages.flatMap((p) => p.servers) ?? [], [servers.data]);
  const shown = useMemo(() => filterMcpServers(loaded, filters), [loaded, filters]);
  const ids = useMemo(() => packageIdIndex(catalog?.items), [catalog]);
  const idsByName = useMemo(
    () => new Map((catalog?.items ?? []).map((p) => [p.name, p.id] as const)),
    [catalog],
  );
  const held = useMemo(() => {
    if (!isAdmin || !catalog || !servers.isSuccess || servers.hasNextPage || search) return [];
    return heldServerNames(catalog.items, loaded);
  }, [isAdmin, catalog, servers.isSuccess, servers.hasNextPage, search, loaded]);

  const filtered = hasActiveMcpFilters(filters);
  const remote = repositoryType === "remote";

  let body: React.ReactNode;
  if (servers.isLoading) {
    body = (
      <McpServerGrid view={view}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </McpServerGrid>
    );
  } else if (servers.isError) {
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load servers"
        description={servers.error instanceof Error ? servers.error.message : undefined}
      />
    );
  } else if (shown.length === 0 && (filtered || loaded.length > 0)) {
    body = (
      <EmptyState
        icon={Plug}
        title="No servers match"
        description="Nothing on the loaded pages matches these filters."
        action={
          <Button
            variant="outline"
            size="sm"
            // With nothing narrowed, the loaded servers are all deprecated:
            // clearing then means showing every status.
            onClick={() => setFilters(filtered ? DEFAULT_MCP_FILTERS : { ...DEFAULT_MCP_FILTERS, status: "all" })}
          >
            Clear filters
          </Button>
        }
      />
    );
  } else if (shown.length === 0 && remote) {
    body = (
      <EmptyState
        icon={Plug}
        title="No servers approved yet"
        description="Servers from the upstream registry appear here once an administrator approves them."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/curation?repo=${encodeURIComponent(repositoryKey)}`}>Open the approval queue</Link>
          </Button>
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={Plug}
        title="Publish your first server.json"
        description="Publish with mcp-publisher or a POST to this registry; the Setup tab has the commands."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/repositories/${encodeURIComponent(repositoryKey)}?tab=setup`}>Open Setup</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <McpServerGrid view={view}>
        {shown.map((e) => (
          <McpServerCard
            key={`${e.server.name}@${e.server.version}`}
            repoKey={repositoryKey}
            entry={e}
            packageId={packageIdOf(ids, repositoryKey, e.server.name)}
            onInstall={setInstalling}
          />
        ))}
      </McpServerGrid>
    );
  }

  return (
    <div className="space-y-4">
      <McpServerFilterBar filters={filters} onChange={setFilters} view={view} onViewChange={setView} />
      {body}
      {servers.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={servers.isFetchingNextPage}
            onClick={() => servers.fetchNextPage()}
          >
            {servers.isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            Load more
          </Button>
        </div>
      )}
      <HeldFooter names={held} ids={idsByName} />
      <McpInstallSheet
        open={installing !== null}
        onOpenChange={(o) => {
          if (!o) setInstalling(null);
        }}
        repoKey={repositoryKey}
        entry={installing}
      />
    </div>
  );
}
