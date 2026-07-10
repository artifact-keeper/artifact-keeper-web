"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  Crosshair,
  Database,
  Download,
  Globe,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Users,
} from "lucide-react";

import {
  blastRadiusApi,
  isValidVulnId,
  normalizeVulnId,
  BLAST_RADIUS_DEFAULT_PER_PAGE,
  type AffectedRepo,
  type BlastRadiusDownloader,
} from "@/lib/api/blast-radius";
import { isValidUuid } from "@/lib/api/audit";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const BLAST_RADIUS_QUERY_KEY = ["admin-blast-radius"] as const;

type TargetKind = "cve" | "artifact";

interface Target {
  kind: TargetKind;
  value: string;
}

function truncateId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 13)}…` : id;
}

/**
 * Badge classifying how widely a repository holding an affected artifact is
 * reachable. `public` is the loud one: the artifact is anonymous-readable,
 * so everyone — not just the recorded downloaders — is exposed.
 */
export function AccessScopeBadge({ scope }: { scope: string }) {
  if (scope === "public") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-100 font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
      >
        <AlertTriangle className="mr-1 size-3" />
        Public — everyone exposed
      </Badge>
    );
  }
  if (scope === "restricted_acl") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      >
        <Lock className="mr-1 size-3" />
        Restricted (explicit ACL)
      </Badge>
    );
  }
  if (scope === "restricted_roles") {
    return (
      <Badge variant="secondary">
        <Lock className="mr-1 size-3" />
        Restricted (roles)
      </Badge>
    );
  }
  // A scope this UI doesn't know yet degrades to a neutral badge.
  return <Badge variant="secondary">{scope}</Badge>;
}

/** Compact preview of a downloader's IP sample: first few, then "+n more". */
export function ipPreview(ips: string[], distinctCount: number): string {
  if (ips.length === 0) return "—";
  const shown = ips.slice(0, 3);
  const more = Math.max(distinctCount, ips.length) - shown.length;
  return more > 0 ? `${shown.join(", ")} +${more} more` : shown.join(", ");
}

export default function BlastRadiusPage() {
  // useSearchParams requires a Suspense boundary during prerendering.
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BlastRadiusContent />
    </Suspense>
  );
}

function BlastRadiusContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Deep links from a finding carry ?cve= (or ?artifact=) so the report runs
  // immediately; a malformed param just prefills the input for correction.
  const initialCve = searchParams.get("cve")?.trim() ?? "";
  const initialArtifact = searchParams.get("artifact")?.trim() ?? "";

  const [mode, setMode] = useState<TargetKind>(
    initialArtifact && !initialCve ? "artifact" : "cve"
  );
  const [draft, setDraft] = useState(initialCve || initialArtifact);
  const [inputError, setInputError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Target | null>(() => {
    if (initialCve && isValidVulnId(initialCve)) {
      return { kind: "cve", value: normalizeVulnId(initialCve) };
    }
    if (initialArtifact && isValidUuid(initialArtifact)) {
      return { kind: "artifact", value: initialArtifact };
    }
    return null;
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(BLAST_RADIUS_DEFAULT_PER_PAGE);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: [...BLAST_RADIUS_QUERY_KEY, applied, page, pageSize],
    queryFn: () =>
      applied!.kind === "cve"
        ? blastRadiusApi.forCve(applied!.value, { page, per_page: pageSize })
        : blastRadiusApi.forArtifact(applied!.value, {
            page,
            per_page: pageSize,
          }),
    enabled: !!user?.is_admin && applied != null,
    retry: false,
    placeholderData: (prev) => prev,
  });

  function analyze() {
    const value = draft.trim();
    if (mode === "cve") {
      if (!isValidVulnId(value)) {
        setInputError(
          "Enter a CVE id like CVE-2021-44228 (GHSA ids are accepted too)"
        );
        return;
      }
      setInputError(null);
      setApplied({ kind: "cve", value: normalizeVulnId(value) });
    } else {
      if (!isValidUuid(value)) {
        setInputError("Artifact ID must be a UUID");
        return;
      }
      setInputError(null);
      setApplied({ kind: "artifact", value });
    }
    setPage(1);
  }

  function switchMode(next: TargetKind) {
    setMode(next);
    setInputError(null);
  }

  const repoColumns: DataTableColumn<AffectedRepo>[] = [
    {
      id: "repository",
      header: "Repository",
      accessor: (r) => r.repository_key,
      cell: (r) => (
        <span className="font-medium" title={r.repository_id}>
          {r.repository_key}
        </span>
      ),
      sortable: true,
    },
    {
      id: "visibility",
      header: "Visibility",
      accessor: (r) => (r.is_public ? "public" : "private"),
      cell: (r) =>
        r.is_public ? (
          <Badge variant="outline">
            <Globe className="mr-1 size-3" />
            public
          </Badge>
        ) : (
          <Badge variant="outline">
            <Lock className="mr-1 size-3" />
            private
          </Badge>
        ),
      sortable: true,
    },
    {
      id: "access_scope",
      header: "Access scope",
      accessor: (r) => (r.access_scope === "public" ? 0 : 1),
      cell: (r) => <AccessScopeBadge scope={r.access_scope} />,
      sortable: true,
    },
  ];

  const downloaderColumns: DataTableColumn<BlastRadiusDownloader>[] = [
    {
      id: "user",
      header: "User",
      accessor: (d) => d.username ?? "",
      cell: (d) => {
        if (!d.user_id) {
          return <span className="text-muted-foreground">anonymous</span>;
        }
        return d.username ? (
          <span title={d.user_id}>{d.username}</span>
        ) : (
          <span className="font-mono text-xs" title={d.user_id}>
            {truncateId(d.user_id)}
          </span>
        );
      },
      sortable: true,
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (d) => d.download_count,
      cell: (d) => <span className="tabular-nums">{d.download_count}</span>,
      sortable: true,
    },
    {
      id: "ips",
      header: "IPs",
      accessor: (d) => d.distinct_ip_count,
      className: "max-w-[280px]",
      cell: (d) => (
        <span
          className="block truncate font-mono text-xs"
          title={d.ip_addresses.join(", ") || undefined}
        >
          {ipPreview(d.ip_addresses, d.distinct_ip_count)}
        </span>
      ),
      sortable: true,
    },
    {
      id: "first_download",
      header: "First download",
      accessor: (d) => d.first_download,
      cell: (d) => (
        <span className="whitespace-nowrap text-sm" title={d.first_download}>
          {new Date(d.first_download).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
    {
      id: "last_download",
      header: "Last download",
      accessor: (d) => d.last_download,
      cell: (d) => (
        <span className="whitespace-nowrap text-sm" title={d.last_download}>
          {new Date(d.last_download).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
  ];

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Blast Radius" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view CVE blast-radius reports.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blast Radius"
        description="Who is exposed to a vulnerability — the users and network locations that downloaded an affected artifact, and how widely each affected repository is reachable."
        actions={
          <div className="flex items-center gap-2">
            <Crosshair className="size-5 text-muted-foreground" />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Refresh blast radius"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: BLAST_RADIUS_QUERY_KEY,
                })
              }
            >
              <RefreshCw
                className={`size-4 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        }
      />

      {/* Target selector */}
      <div className="space-y-2">
        <Tabs value={mode} onValueChange={(v) => switchMode(v as TargetKind)}>
          <TabsList>
            <TabsTrigger value="cve">By CVE</TabsTrigger>
            <TabsTrigger value="artifact">By Artifact</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="blast-radius-target">
              {mode === "cve" ? "CVE / advisory ID" : "Artifact ID"}
            </Label>
            <Input
              id="blast-radius-target"
              className="w-[320px] font-mono"
              placeholder={
                mode === "cve" ? "e.g. CVE-2021-44228" : "UUID of the artifact"
              }
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (inputError) setInputError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              aria-invalid={inputError != null}
              aria-describedby="blast-radius-input-error"
            />
          </div>
          <Button onClick={analyze}>Analyze</Button>
        </div>
        {/* Persistent live region so the validation error is announced and
            stays associated with the target input. */}
        <p
          id="blast-radius-input-error"
          role="alert"
          className="min-h-[1rem] text-sm text-destructive"
        >
          {inputError}
        </p>
      </div>

      {applied == null ? (
        <Alert>
          <AlertTitle>Pick a target</AlertTitle>
          <AlertDescription>
            Enter a CVE id (or switch to artifact mode and enter an artifact
            id) to see who downloaded the affected artifacts and which
            repositories expose them. You can also open this page from a scan
            finding&apos;s advisory link.
          </AlertDescription>
        </Alert>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Blast radius unavailable</AlertTitle>
          <AlertDescription>
            Unable to load the blast-radius report. This server may not
            support the blast-radius endpoints yet, or the request failed.
          </AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="flex h-[30vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Report scope + anonymous flag */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Report for</span>
            <Badge variant="outline" className="font-mono">
              {data.target.value}
            </Badge>
            {data.summary.anonymous_download_present && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              >
                <AlertTriangle className="mr-1 size-3" />
                Anonymous downloads present
              </Badge>
            )}
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={Bug}
              label="Affected artifacts"
              value={data.summary.affected_artifact_count}
              color={
                data.summary.affected_artifact_count > 0 ? "red" : "green"
              }
            />
            <StatCard
              icon={Database}
              label="Affected repos"
              value={data.summary.affected_repo_count}
              color={data.summary.affected_repo_count > 0 ? "yellow" : "green"}
            />
            <StatCard
              icon={Users}
              label="Downloaders"
              value={data.summary.downloader_user_count}
              description={
                data.summary.anonymous_download_present
                  ? "+ anonymous"
                  : undefined
              }
              color={
                data.summary.downloader_user_count > 0 ||
                data.summary.anonymous_download_present
                  ? "yellow"
                  : "green"
              }
            />
            <StatCard
              icon={Network}
              label="Distinct IPs"
              value={data.summary.distinct_ip_count}
              color="blue"
            />
            <StatCard
              icon={Download}
              label="Total downloads"
              value={data.summary.total_download_count}
              color={data.summary.total_download_count > 0 ? "yellow" : "green"}
            />
          </div>

          {/* Affected repositories */}
          <section className="space-y-2" aria-label="Affected repositories">
            <h2 className="text-lg font-semibold tracking-tight">
              Affected repositories
            </h2>
            <DataTable
              columns={repoColumns}
              data={data.affected_repos}
              loading={false}
              emptyMessage="No repositories hold an affected artifact."
              rowKey={(r) => r.repository_id}
            />
          </section>

          {/* Downloaders */}
          <section className="space-y-2" aria-label="Downloaders">
            <h2 className="text-lg font-semibold tracking-tight">
              Downloaders
            </h2>
            <DataTable
              columns={downloaderColumns}
              data={data.downloaders}
              total={data.total_downloaders}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              pageSizeOptions={[20, 50, 100]}
              loading={false}
              emptyMessage="No downloads of affected artifacts recorded."
              rowKey={(d) => d.user_id ?? "anonymous"}
            />
          </section>
        </>
      )}
    </div>
  );
}
