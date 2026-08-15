"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  ShieldAlert,
  Users,
} from "lucide-react";

import {
  blastRadiusApi,
  accessibleUsersApi,
  isValidVulnId,
  normalizeVulnId,
  BLAST_RADIUS_DEFAULT_PER_PAGE,
  type AffectedRepo,
  type BlastRadiusDownloader,
  type AccessibleUser,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const BLAST_RADIUS_QUERY_KEY = ["admin-blast-radius"] as const;
export const ACCESSIBLE_USERS_QUERY_KEY = ["admin-accessible-users"] as const;

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
  const t = useTranslations("adminBlastRadius");
  if (scope === "public") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-100 font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
      >
        <AlertTriangle className="mr-1 size-3" />
        {t("publicExposed")}
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
        {t("restrictedAcl")}
      </Badge>
    );
  }
  if (scope === "restricted_roles") {
    return (
      <Badge variant="secondary">
        <Lock className="mr-1 size-3" />
        {t("restrictedRoles")}
      </Badge>
    );
  }
  // A scope this UI doesn't know yet degrades to a neutral badge.
  return <Badge variant="secondary">{scope}</Badge>;
}

/**
 * Badge for the coarse breadth of latent access (1.6.0, #2386). `everyone` is
 * the loud one — a public repo where every principal (and anonymous clients)
 * can reach the artifact, so per-user enumeration is not applicable.
 */
export function ExposureBadge({ exposure }: { exposure: string }) {
  const t = useTranslations("adminBlastRadius");
  if (exposure === "everyone") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-100 font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
      >
        <Globe className="mr-1 size-3" />
        {t("everyonePublic")}
      </Badge>
    );
  }
  if (exposure === "effectively-everyone") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      >
        <AlertTriangle className="mr-1 size-3" />
        {t("effectivelyEveryone")}
      </Badge>
    );
  }
  if (exposure === "enumerable") {
    return (
      <Badge variant="secondary">
        <Users className="mr-1 size-3" />
        {t("enumerableSet")}
      </Badge>
    );
  }
  // A future exposure classification degrades to a neutral badge.
  return <Badge variant="secondary">{exposure}</Badge>;
}

/**
 * Badge describing how a principal is granted access: `admin` (global),
 * `permission` (direct or group grant), or `role` (role assignment).
 */
export function ViaBadge({ via }: { via: string }) {
  const t = useTranslations("adminBlastRadius");
  const label =
    via === "admin"
      ? t("admin")
      : via === "permission"
        ? t("permissionGrant")
        : via === "role"
          ? t("roleAssignment")
          : via;
  return <Badge variant="secondary">{label}</Badge>;
}

/** Compact preview of a downloader's IP sample: first few, then "+n more". */
export function ipPreview(
  ips: string[],
  distinctCount: number,
  tr: (key: string, values?: Record<string, string | number>) => string = (
    _key,
    values
  ) => {
    const n = typeof values?.count === "number" ? values.count : 0;
    return `+${n} more`;
  }
): string {
  if (ips.length === 0) return "—";
  const shown = ips.slice(0, 3);
  const more = Math.max(distinctCount, ips.length) - shown.length;
  return more > 0
    ? `${shown.join(", ")} ${tr("ipMore", { count: more })}`
    : shown.join(", ");
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
  const t = useTranslations("adminBlastRadius");
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

  // Latent-exposure (accessible-but-not-downloaded) pagination + repository
  // scope. A CVE spans many repos, so the accessible-users enumeration is
  // scoped to one repository chosen from the report's affected list.
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [accPage, setAccPage] = useState(1);
  const [accPageSize, setAccPageSize] = useState(BLAST_RADIUS_DEFAULT_PER_PAGE);

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

  // The affected repositories drive the CVE-mode repository scope selector.
  const affectedRepos = data?.affected_repos ?? [];
  // Artifact mode implies its repository (repository_id ignored server-side);
  // CVE mode defaults to the first affected repo until the admin picks another.
  const effectiveRepoId =
    applied?.kind === "artifact"
      ? null
      : (selectedRepoId ?? affectedRepos[0]?.repository_id ?? null);

  const {
    data: accessibleData,
    isLoading: accessibleLoading,
    isError: accessibleError,
    isFetching: accessibleFetching,
  } = useQuery({
    queryKey: [
      ...ACCESSIBLE_USERS_QUERY_KEY,
      applied,
      effectiveRepoId,
      accPage,
      accPageSize,
    ],
    queryFn: () =>
      applied!.kind === "cve"
        ? accessibleUsersApi.forCve(applied!.value, {
            repository_id: effectiveRepoId!,
            page: accPage,
            per_page: accPageSize,
          })
        : accessibleUsersApi.forArtifact(applied!.value, {
            page: accPage,
            per_page: accPageSize,
          }),
    enabled:
      !!user?.is_admin &&
      applied != null &&
      (applied?.kind === "artifact" || !!effectiveRepoId),
    retry: false,
    placeholderData: (prev) => prev,
  });

  function analyze() {
    const value = draft.trim();
    if (mode === "cve") {
      if (!isValidVulnId(value)) {
        setInputError(t("cveIdError"));
        return;
      }
      setInputError(null);
      setApplied({ kind: "cve", value: normalizeVulnId(value) });
    } else {
      if (!isValidUuid(value)) {
        setInputError(t("artifactIdError"));
        return;
      }
      setInputError(null);
      setApplied({ kind: "artifact", value });
    }
    setPage(1);
    // New target: reset the latent-exposure scope + pagination.
    setSelectedRepoId(null);
    setAccPage(1);
  }

  function switchMode(next: TargetKind) {
    setMode(next);
    setInputError(null);
  }

  const repoColumns: DataTableColumn<AffectedRepo>[] = [
    {
      id: "repository",
      header: t("colRepository"),
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
      header: t("colVisibility"),
      accessor: (r) => (r.is_public ? "public" : "private"),
      cell: (r) =>
        r.is_public ? (
          <Badge variant="outline">
            <Globe className="mr-1 size-3" />
            {t("public")}
          </Badge>
        ) : (
          <Badge variant="outline">
            <Lock className="mr-1 size-3" />
            {t("private")}
          </Badge>
        ),
      sortable: true,
    },
    {
      id: "access_scope",
      header: t("colAccessScope"),
      accessor: (r) => (r.access_scope === "public" ? 0 : 1),
      cell: (r) => <AccessScopeBadge scope={r.access_scope} />,
      sortable: true,
    },
  ];

  const downloaderColumns: DataTableColumn<BlastRadiusDownloader>[] = [
    {
      id: "user",
      header: t("colUser"),
      accessor: (d) => d.username ?? "",
      cell: (d) => {
        if (!d.user_id) {
          return <span className="text-muted-foreground">{t("anonymous")}</span>;
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
      header: t("colDownloads"),
      accessor: (d) => d.download_count,
      cell: (d) => <span className="tabular-nums">{d.download_count}</span>,
      sortable: true,
    },
    {
      id: "ips",
      header: t("colIps"),
      accessor: (d) => d.distinct_ip_count,
      className: "max-w-[280px]",
      cell: (d) => (
        <span
          className="block truncate font-mono text-xs"
          title={d.ip_addresses.join(", ") || undefined}
        >
          {ipPreview(d.ip_addresses, d.distinct_ip_count, (key, values) =>
            t(key, values)
          )}
        </span>
      ),
      sortable: true,
    },
    {
      id: "first_download",
      header: t("colFirstDownload"),
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
      header: t("colLastDownload"),
      accessor: (d) => d.last_download,
      cell: (d) => (
        <span className="whitespace-nowrap text-sm" title={d.last_download}>
          {new Date(d.last_download).toLocaleString()}
        </span>
      ),
      sortable: true,
    },
  ];

  const accessibleColumns: DataTableColumn<AccessibleUser>[] = [
    {
      id: "user",
      header: t("colUser"),
      accessor: (u) => u.username,
      cell: (u) => (
        <span title={u.user_id}>
          {u.username || (
            <span className="font-mono text-xs">{truncateId(u.user_id)}</span>
          )}
        </span>
      ),
      sortable: true,
    },
    {
      id: "via",
      header: t("colAccessVia"),
      accessor: (u) => u.via,
      cell: (u) => <ViaBadge via={u.via} />,
      sortable: true,
    },
  ];

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("accessDeniedDescription")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
            <Crosshair className="size-5 text-muted-foreground" />
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("refreshAria")}
              onClick={() => {
                queryClient.invalidateQueries({
                  queryKey: BLAST_RADIUS_QUERY_KEY,
                });
                queryClient.invalidateQueries({
                  queryKey: ACCESSIBLE_USERS_QUERY_KEY,
                });
              }}
            >
              <RefreshCw
                className={`size-4 ${
                  isFetching || accessibleFetching ? "animate-spin" : ""
                }`}
              />
            </Button>
          </div>
        }
      />

      {/* Target selector */}
      <div className="space-y-2">
        <Tabs value={mode} onValueChange={(v) => switchMode(v as TargetKind)}>
          <TabsList>
            <TabsTrigger value="cve">{t("byCve")}</TabsTrigger>
            <TabsTrigger value="artifact">{t("byArtifact")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="blast-radius-target">
              {mode === "cve" ? t("cveOrAdvisoryId") : t("artifactId")}
            </Label>
            <Input
              id="blast-radius-target"
              className="w-[320px] font-mono"
              placeholder={
                mode === "cve" ? t("cvePlaceholder") : t("artifactPlaceholder")
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
          <Button onClick={analyze}>{t("analyze")}</Button>
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
          <AlertTitle>{t("pickTarget")}</AlertTitle>
          <AlertDescription>
            {t("pickTargetDescription")}
          </AlertDescription>
        </Alert>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("unavailableTitle")}</AlertTitle>
          <AlertDescription>
            {t("unavailableDescription")}
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
            <span className="text-sm text-muted-foreground">{t("reportFor")}</span>
            <Badge variant="outline" className="font-mono">
              {data.target.value}
            </Badge>
            {data.summary.anonymous_download_present && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              >
                <AlertTriangle className="mr-1 size-3" />
                {t("anonymousDownloadsPresent")}
              </Badge>
            )}
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={Bug}
              label={t("affectedArtifacts")}
              value={data.summary.affected_artifact_count}
              color={
                data.summary.affected_artifact_count > 0 ? "red" : "green"
              }
            />
            <StatCard
              icon={Database}
              label={t("affectedRepos")}
              value={data.summary.affected_repo_count}
              color={data.summary.affected_repo_count > 0 ? "yellow" : "green"}
            />
            <StatCard
              icon={Users}
              label={t("downloaders")}
              value={data.summary.downloader_user_count}
              description={
                data.summary.anonymous_download_present
                  ? t("plusAnonymous")
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
              label={t("distinctIps")}
              value={data.summary.distinct_ip_count}
              color="blue"
            />
            <StatCard
              icon={Download}
              label={t("totalDownloads")}
              value={data.summary.total_download_count}
              color={data.summary.total_download_count > 0 ? "yellow" : "green"}
            />
          </div>

          {/* Affected repositories */}
          <section className="space-y-2" aria-label={t("affectedRepositories")}>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("affectedRepositories")}
            </h2>
            <DataTable
              columns={repoColumns}
              data={data.affected_repos}
              loading={false}
              emptyMessage={t("noAffectedRepos")}
              rowKey={(r) => r.repository_id}
            />
          </section>

          {/* Downloaders */}
          <section className="space-y-2" aria-label={t("downloadersTitle")}>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("downloadersTitle")}
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
              emptyMessage={t("noDownloaders")}
              rowKey={(d) => d.user_id ?? "anonymous"}
            />
          </section>

          {/* Latent exposure: accessible but not downloaded (1.6.0, #2386).
              Visually separated and tinted so it reads as *potential* reach,
              distinct from the confirmed downloaders above. */}
          <section
            className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"
            aria-label={t("accessibleNotDownloaded")}
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-lg font-semibold tracking-tight">
                  {t("accessibleNotDownloaded")}
                </h2>
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  {t("latentExposure")}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t.rich("latentDescription", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>

            {/* A CVE spans many repositories; scope the enumeration to one. */}
            {applied.kind === "cve" && affectedRepos.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="accessible-repo" className="text-sm">
                  {t("repository")}
                </Label>
                <Select
                  value={effectiveRepoId ?? undefined}
                  onValueChange={(v) => {
                    setSelectedRepoId(v);
                    setAccPage(1);
                  }}
                >
                  <SelectTrigger id="accessible-repo" className="w-[280px]">
                    <SelectValue placeholder={t("selectRepositoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {affectedRepos.map((r) => (
                      <SelectItem key={r.repository_id} value={r.repository_id}>
                        {r.repository_key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {accessibleError ? (
              <Alert variant="destructive">
                <AlertTitle>{t("latentUnavailableTitle")}</AlertTitle>
                <AlertDescription>
                  {t("latentUnavailableDescription")}
                </AlertDescription>
              </Alert>
            ) : accessibleLoading || !accessibleData ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t("exposure")}
                  </span>
                  <ExposureBadge exposure={accessibleData.exposure} />
                  <Badge variant="outline" className="font-mono">
                    {accessibleData.repository.repository_key}
                  </Badge>
                  {accessibleData.total != null && (
                    <span className="text-sm text-muted-foreground">
                      {t("withLatentAccess", { count: accessibleData.total ?? 0 })}
                    </span>
                  )}
                </div>

                {accessibleData.exposure === "enumerable" ? (
                  <DataTable
                    columns={accessibleColumns}
                    data={accessibleData.accessible_not_downloaded}
                    total={
                      accessibleData.total ??
                      accessibleData.accessible_not_downloaded.length
                    }
                    page={accPage}
                    pageSize={accPageSize}
                    onPageChange={setAccPage}
                    onPageSizeChange={(s) => {
                      setAccPageSize(s);
                      setAccPage(1);
                    }}
                    pageSizeOptions={[20, 50, 100]}
                    loading={false}
                    emptyMessage={t("noLatentAccess")}
                    rowKey={(u) => u.user_id}
                  />
                ) : (
                  <Alert>
                    <AlertTitle>
                      {accessibleData.exposure === "everyone"
                        ? t("publicRepoAlertTitle")
                        : t("tooBroadAlertTitle")}
                    </AlertTitle>
                    <AlertDescription>
                      {accessibleData.exposure === "everyone"
                        ? t("publicRepoAlertDescription")
                        : t("tooBroadAlertDescription")}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
