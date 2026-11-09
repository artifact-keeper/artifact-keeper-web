"use client";

import { SafeText } from "@/components/common/safe-text";
import { NAME_MAX_LENGTH } from "@/lib/untrusted-text";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, Plug } from "lucide-react";
import { mcpApi } from "@/lib/api/mcp";
import { packagesApi } from "@/lib/api/packages";
import { repositoriesApi } from "@/lib/api/repositories";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { isRemoteMcpRepo, isVirtualMcpRepo, splitServerName } from "@/lib/mcp/format";
import { akSourceMeta, isSafeHttpUrl, officialMeta, secretsOf, sourceKind, sourceKindOf } from "@/lib/mcp/server-json";
import { assessRisk } from "@/lib/mcp/risk";
import { useAuth } from "@/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { McpServerAvatar } from "@/components/mcp/server-avatar";
import { McpTransportBadges } from "@/components/mcp/transport-badges";
import { McpSourceBadge } from "@/components/mcp/source-badge";
import { McpRiskBadges, McpRiskLevelBadge } from "@/components/mcp/risk-badges";
import { McpStatusBadge } from "@/components/mcp/status-badge";
import { McpInstallPanel } from "@/components/mcp/install-panel";
import { McpHeldVersionPanel } from "@/components/mcp/held-version-panel";
import { McpLineageGraph } from "@/components/mcp/lineage-graph";
import { McpSecurityTab } from "@/components/mcp/security-tab";
import { McpToolsTab } from "@/components/mcp/tools-tab";
import type { Package } from "@/types";
import type { McpServedEntry } from "@/types/mcp";
import { McpAdminMenu } from "./mcp-admin-menu";
import {
  ConfigurationSection,
  OverviewSection,
  PackagesSection,
  SafeLink,
  VersionsSection,
  type McpVersionRow,
} from "./mcp-detail-sections";

/**
 * Detail page body for an `mcp` package (artifact-keeper#5253): one server
 * name, a selected version (`?version=`), and tabs (`?tab=`).
 *
 * The package row only carries name/version, so everything else comes from
 * the registry API (what clients see) and the stored metadata document (what
 * AK pinned). A version that exists in the package catalog but is absent
 * from the served list is held or deleted: the page still shows its stored
 * metadata and explains, through the held-version panel, why clients cannot
 * see it.
 */

export const MCP_DETAIL_TABS = ["overview", "install", "packages", "config", "versions", "security", "lineage", "tools"] as const;
type DetailTab = (typeof MCP_DETAIL_TABS)[number];

function isTab(v: string | null): v is DetailTab {
  return !!v && (MCP_DETAIL_TABS as readonly string[]).includes(v);
}

function latestOf(served: McpServedEntry[]): McpServedEntry | undefined {
  return served.find((e) => officialMeta(e)?.isLatest) ?? served[served.length - 1];
}

export function mergeVersionRows(
  served: McpServedEntry[],
  catalog: { version: string; created_at: string }[],
): McpVersionRow[] {
  const rows = new Map<string, McpVersionRow>();
  for (const e of served) {
    const o = officialMeta(e);
    rows.set(e.server.version, {
      version: e.server.version,
      served: true,
      status: o?.status ?? "active",
      isLatest: o?.isLatest,
      published: o?.publishedAt,
    });
  }
  for (const c of catalog) {
    if (!rows.has(c.version)) rows.set(c.version, { version: c.version, served: false, published: c.created_at });
  }
  return [...rows.values()].sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
}

/** `origin` of the generic package row's MCP metadata (`hosted` | `remote` | `mirror`). */
function pkgOrigin(pkg: Package): string | undefined {
  const o = pkg.metadata?.origin;
  return typeof o === "string" ? o : undefined;
}

export function McpServerDetail({ pkg }: { pkg: Package }) {
  const repoKey = pkg.repository_key;
  const name = pkg.name;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const rawTab = searchParams.get("tab");
  const tab: DetailTab = isTab(rawTab) ? rawTab : "overview";

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const versionsQ = useQuery({
    queryKey: mcpKeys.versions(repoKey, name),
    queryFn: () => mcpApi.listVersions(repoKey, name),
  });
  // Same key as the generic page, so the catalog rows come from its cache.
  const catalogQ = useQuery({
    queryKey: ["package-versions", pkg.id],
    queryFn: () => packagesApi.getVersions(pkg.id),
  });
  const served = useMemo(() => versionsQ.data ?? [], [versionsQ.data]);

  const version = searchParams.get("version") ?? latestOf(served)?.server.version ?? pkg.version;
  const servedEntry = served.find((e) => e.server.version === version);

  const readQ = useQuery({
    queryKey: mcpKeys.version(repoKey, name, version),
    queryFn: () => mcpApi.getVersion(repoKey, name, version),
    enabled: versionsQ.isSuccess && !servedEntry && !!version,
  });
  const entry = servedEntry ?? (readQ.data?.kind === "served" ? readQ.data.entry : undefined);
  // Listings serve a bundle's plain URL; only the exact read of a signed-in
  // caller carries the single-use download ticket a private registry needs.
  const hasBundle = !!servedEntry?.server.packages?.some((p) => p.registryType === "mcpb");
  const exactQ = useQuery({
    queryKey: [...mcpKeys.version(repoKey, name, version), "exact"],
    queryFn: () => mcpApi.getVersion(repoKey, name, version),
    enabled: hasBundle,
    staleTime: 0,
  });
  const bundleUrls = useMemo(() => {
    const exact = exactQ.data?.kind === "served" ? exactQ.data.entry : readQ.data?.kind === "served" ? readQ.data.entry : undefined;
    const out: Record<number, string> = {};
    (exact?.server.packages ?? []).forEach((p, i) => {
      if (p.registryType === "mcpb") out[i] = p.identifier;
    });
    return out;
  }, [exactQ.data, readQ.data]);
  const artifactId = entry ? akSourceMeta(entry)?.artifactId : undefined;

  const storedQ = useQuery({
    queryKey: mcpKeys.stored(repoKey, name, version),
    queryFn: () => mcpApi.getStoredMetadata(repoKey, name, version, artifactId),
    enabled: versionsQ.isSuccess && !!version,
  });
  const healthQ = useQuery({
    queryKey: mcpKeys.health(repoKey, name, version),
    queryFn: () => mcpApi.health(repoKey, name, version),
    enabled: !!version,
  });
  const capsQ = useQuery({
    queryKey: mcpKeys.capabilities(repoKey, name, version),
    queryFn: () => mcpApi.capabilities(repoKey, name, version),
    enabled: !!version,
  });
  const repoQ = useQuery({
    queryKey: ["repository", repoKey],
    queryFn: () => repositoriesApi.get(repoKey),
  });
  // Repository administration (admin edit, probes, catalog decisions): an
  // instance administrator, or the repository `admin` action, which the
  // single-repository response reports as `mcp_caller_is_repo_admin`.
  const isRepoAdmin = isAdmin || repoQ.data?.mcp_caller_is_repo_admin === true;
  // A Remote or Virtual registry refuses every version write with
  // `405 mcp_read_only`. Until the repository type is known the write items
  // stay hidden; if it cannot be read they are offered and the backend decides.
  const readOnlyRepo = repoQ.data
    ? isRemoteMcpRepo(repoQ.data) || isVirtualMcpRepo(repoQ.data)
    : repoQ.isPending;

  const stored = storedQ.data?.metadata;
  const server = entry?.server ?? stored?.server;
  const official = entry ? officialMeta(entry) : stored?.registry;
  const status = official?.status;
  // A held version has no served entry: the package row's MCP metadata
  // (`origin`) still says where it comes from, though not whether it is
  // verified.
  const sourceMeta = entry ? akSourceMeta(entry) : undefined;
  const source = entry ? sourceKind(entry) : pkgOrigin(pkg) ? sourceKindOf(pkgOrigin(pkg), false) : undefined;
  const policy = (entry ? akSourceMeta(entry)?.packagePolicy : undefined) ?? stored?.policy?.package;
  const pins = stored?.packages;
  const notServed = versionsQ.isSuccess && !servedEntry && readQ.data !== undefined && readQ.data.kind !== "served";

  const rows = useMemo(() => mergeVersionRows(served, catalogQ.data ?? []), [served, catalogQ.data]);

  if (versionsQ.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading server" />
      </div>
    );
  }

  const { namespace, shortName } = splitServerName(name);
  const risk = server
    ? assessRisk({ server, status, source, policy, pins, health: healthQ.data, capabilities: capsQ.data })
    : null;
  const secrets = server ? secretsOf(server) : [];
  const isLatest = !!(entry && officialMeta(entry)?.isLatest);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/repositories">Repositories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/repositories/${encodeURIComponent(repoKey)}`}>{repoKey}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start gap-4">
        <McpServerAvatar name={name} className="size-12" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-xl break-all">
            {namespace && <span className="text-muted-foreground">{namespace} / </span>}
            <span className="font-semibold">{shortName}</span>
          </h1>
          {server?.title && <SafeText as="p" max={NAME_MAX_LENGTH} className="text-sm font-medium" value={server.title} />}
          {server?.description && <SafeText as="p" className="text-sm text-muted-foreground" value={server.description} />}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <McpStatusBadge status={notServed ? "held" : (status ?? "active")} />
            {source && (
              <McpSourceBadge
                kind={source}
                upstreamUrl={sourceMeta?.upstreamUrl}
                virtualRepository={sourceMeta?.virtualRepository}
                memberRepository={sourceMeta?.repository}
              />
            )}
            <span className="font-mono text-xs">
              v{version}
              {isLatest ? " (latest)" : ""}
            </span>
            {server && <McpTransportBadges server={server} />}
            {server?.repository?.url && isSafeHttpUrl(server.repository.url) && (
              <SafeLink url={server.repository.url}>repository</SafeLink>
            )}
          </div>
          {risk && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Risk</span>
              <McpRiskLevelBadge level={risk.level} score={risk.score} />
              <McpRiskBadges signals={risk.signals} max={4} />
              {secrets.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  {secrets.length} secret{secrets.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry && <Button onClick={() => setParam("tab", "install")}>Install / Connect</Button>}
          {/* Status changes and the soft delete need only repository write,
              which the UI cannot see: any signed-in caller gets them on a
              hosted repository and the backend's 403 is shown. Remote and
              Virtual repositories take no writes. Admin-only items gate inside. */}
          {!!user && (
            <McpAdminMenu
              repoKey={repoKey}
              name={name}
              version={version}
              status={status}
              isRemote={!!repoQ.data && isRemoteMcpRepo(repoQ.data)}
              readOnly={readOnlyRepo}
              probeAvailable={!!capsQ.data && (capsQ.data.introspection.probeEnabled || capsQ.data.introspection.sandboxEnabled)}
              isRepoAdmin={isRepoAdmin}
            />
          )}
        </div>
      </header>

      {notServed && readQ.data && <McpHeldVersionPanel repoKey={repoKey} name={name} version={version} read={readQ.data} />}

      {!server ? (
        storedQ.isLoading || readQ.isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-label="Loading version" />
        ) : (
          <EmptyState icon={Plug} title="No metadata readable for this version" description="Pick another version below." />
        )
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="install">Install</TabsTrigger>
          <TabsTrigger value="packages">Packages &amp; Remotes</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="versions">Versions ({rows.length})</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
          <TabsTrigger value="tools">
            Tools
            <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
              beta
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="pt-4">
          <VersionsSection
            rows={rows}
            selected={version}
            heldSelected={readQ.data?.kind === "held"}
            onSelect={(v) => setParam("version", v)}
          />
        </TabsContent>

        {server && (
          <>
            <TabsContent value="overview" className="pt-4">
              <OverviewSection server={server} official={official} source={source} pins={pins} repoKey={repoKey} raw={entry ?? server} />
            </TabsContent>
            <TabsContent value="install" className="pt-4">
              {entry ? (
                <McpInstallPanel repoKey={repoKey} entry={entry} versions={served} onVersionChange={(v) => setParam("version", v)} />
              ) : (
                <p className="text-sm text-muted-foreground">This version is not served, so clients cannot install it.</p>
              )}
            </TabsContent>
            <TabsContent value="packages" className="pt-4">
              <PackagesSection server={server} pins={pins} policy={policy} bundles={stored?.bundles} bundleUrls={bundleUrls} />
            </TabsContent>
            <TabsContent value="config" className="pt-4">
              <ConfigurationSection server={server} />
            </TabsContent>
            <TabsContent value="security" className="pt-4">
              <McpSecurityTab
                repoKey={repoKey}
                name={name}
                version={version}
                server={server}
                pins={pins}
                policy={policy}
                status={status}
                source={source}
              />
            </TabsContent>
            <TabsContent value="lineage" className="pt-4">
              <McpLineageGraph server={server} pins={pins} health={healthQ.data} repoKey={repoKey} policy={policy} />
            </TabsContent>
            <TabsContent value="tools" className="pt-4">
              <McpToolsTab repoKey={repoKey} name={name} version={version} canProbe={isRepoAdmin} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
