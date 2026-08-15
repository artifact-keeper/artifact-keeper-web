"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Bell,
  Check,
  Download,
  Loader2,
  Trash2,
  X,
  Search,
  FileIcon,
  FileArchive,
  Info,
  Shield,
  ExternalLink,
  HeartPulse,
  History,
  Layers,
  Package as PackageIcon,
  Settings,
  RotateCcw,
  Link2,
  Upload,
  Tag,
  Rocket,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import { artifactsApi } from "@/lib/api/artifacts";
import { securityApi } from "@/lib/api/security";
import { quarantineApi } from "@/lib/api/quarantine";
import { mutationErrorToast } from "@/lib/error-utils";
import { useFormatHandlers } from "@/hooks/use-format-handlers";
import { isPluginBackedRepo, repoFormatLabel } from "@/lib/repo-format";
import {
  isActivelyQuarantined,
  isQuarantineRejected,
  quarantineKnowledge,
  quarantineDownloadBlockedReason,
  type QuarantineFields,
} from "@/lib/quarantine";
import { isArtifactAnalyzable } from "@/lib/artifact-analyzable";
import {
  buildPomDependencySnippet,
  mavenGavcFromMetadata,
  parseMavenGav,
} from "@/lib/maven";
import { formatRelativeTimestamp, formatCacheExpiry } from "@/lib/cache-time";
import type { Artifact } from "@/types";
import type { UpsertScanConfigRequest } from "@/types/security";
import { supportsVersioning } from "@/lib/api/versions";
import { ArtifactVersionsSection } from "./artifact-versions-section";
import { SbomTabContent } from "./sbom-tab-content";
import { SecurityTabContent } from "./security-tab-content";
import { HealthTabContent } from "./health-tab-content";
import { NotificationsTabContent } from "./notifications-tab-content";
import { VirtualMembersPanel } from "./virtual-members-panel";
import { PypiTracksPanel } from "./pypi-tracks-panel";
import { RepoLabelsPanel } from "./repo-labels-panel";
import { PackagesTabContent } from "./packages-tab-content";
import {
  ArtifactBrowserToggle,
  DOCKER_FAMILY_FORMATS,
  supportsGrouping,
  supportsTree,
  type ArtifactViewMode,
} from "./artifact-browser-toggle";
import { MavenComponentList } from "./maven-component-list";
import { DockerTagList } from "./docker-tag-list";
import { ArtifactFolderTree } from "./artifact-folder-tree";
import { QuarantineBadge } from "@/components/common/quarantine-badge";
import { QuarantineBanner } from "@/components/common/quarantine-banner";
import { RepoSettingsTab } from "./repo-settings-tab";
import { RepoStoragePanel } from "./repo-storage-panel";
import { RepoFolderStoragePanel } from "./repo-folder-storage-panel";
import { resolveInitialRepoTab } from "@/lib/repo-tabs";
import { formatBytes, REPO_TYPE_COLORS } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useSystemConfig } from "@/providers/system-config-provider";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { CopyButton } from "@/components/common/copy-button";
import { MiddleEllipsis } from "@/components/common/middle-ellipsis";
import { FileUpload } from "@/components/common/file-upload";
import { RepoSetupGuide } from "@/components/setup/repo-setup-guide";

interface RepoDetailContentProps {
  repoKey: string;
  standalone?: boolean;
}

/**
 * The two admin decisions available on a held artifact. The backend only
 * allows `quarantined -> released|rejected`, so there is nothing to offer on
 * an artifact that has already been rejected.
 */
type QuarantineAction = "release" | "reject";

export function RepoDetailContent({ repoKey, standalone = false }: RepoDetailContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations("app/repositories/_components/repo-detail-content");
  const tSev = useTranslations("core/severity");
  const { isAuthenticated, user } = useAuth();
  const { config: systemConfig } = useSystemConfig();

  // artifact search / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Grouped vs flat vs tree artifact-browser view (issues #254, #330, #2791).
  // The URL `?view=flat|grouped|tree` query param is the source of truth so the
  // choice survives a refresh and is shareable.  Absence falls back to the
  // per-format default.
  const urlView = searchParams.get("view");
  const viewModeOverride: ArtifactViewMode | null =
    urlView === "flat" || urlView === "grouped" || urlView === "tree"
      ? urlView
      : null;

  // artifact detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  // Which quarantine decision the admin is confirming, and the optional reason
  // recorded with a rejection (#650).
  const [quarantineAction, setQuarantineAction] = useState<QuarantineAction | null>(null);
  const [quarantineReason, setQuarantineReason] = useState("");
  const closeQuarantineDialog = useCallback(() => {
    setQuarantineAction(null);
    setQuarantineReason("");
  }, []);

  // Polite live region for destructive-action outcomes (delete / cache
  // invalidate). Toasts alone are not reliably announced by screen readers,
  // so the result is also written here. Kept separate from the view-mode
  // status region below, whose content is derived from `viewMode`.
  const [actionAnnounce, setActionAnnounce] = useState("");

  // security form local state
  const [secForm, setSecForm] = useState<UpsertScanConfigRequest | null>(null);

  // --- queries ---
  const { data: repository, isLoading: repoLoading } = useQuery({
    queryKey: ["repository", repoKey],
    queryFn: () => repositoriesApi.get(repoKey),
    enabled: !!repoKey,
  });

  // Installed format handlers — resolves the custom layout name for repos
  // backed by a WASM plugin (#592), which report `format: "generic"`.
  const { data: formatHandlers } = useFormatHandlers();

  const repoFormat = repository?.format;
  // Derive effective view mode: explicit user choice wins; otherwise default
  // to `grouped` for formats that support grouping.
  const viewMode: ArtifactViewMode =
    viewModeOverride ??
    (repoFormat && supportsGrouping(repoFormat) ? "grouped" : "flat");
  // Both grouped views are server-side: Maven/Gradle GAV components (#254,
  // backend ak#701) and Docker tag rollups (#330, backend ak#1336).  Docker
  // grouping was previously re-derived client-side from ONE page of the
  // flat artifact list, which rendered "No image tags found" whenever the
  // first page (sorted by path) contained no `…/manifests/<tag>` rows —
  // trivially hit by any large repository.
  const useServerGrouping =
    viewMode === "grouped" &&
    (repoFormat === "maven" || repoFormat === "gradle");
  // The whole Docker family shares the OCI manifest+blobs layout, so the
  // server-side docker_tag rollup applies to all of them (#418).
  const isDockerGrouped =
    viewMode === "grouped" &&
    !!repoFormat &&
    DOCKER_FAMILY_FORMATS.has(repoFormat);
  // Folder-tree view for RAW/Generic repos (#2791): the tree is grouped
  // client-side from the flat artifact list, so it needs the whole listing
  // on one page (bounded) rather than a paginated slice.
  const isTreeView =
    viewMode === "tree" && !!repoFormat && supportsTree(repoFormat);
  // First-class version history (#571, backend artifact-keeper#2367): only
  // repositories that opted in via `versioning_enabled` AND whose format
  // participates (Generic/Mlmodel) get the Versions tab in the artifact
  // detail dialog. Everything else keeps the existing dialog unchanged.
  const versioningActive =
    !!repository?.versioning_enabled &&
    !!repoFormat &&
    supportsVersioning(repoFormat);
  // The tree view still aggregates client-side, so it needs all artifacts on
  // one page.  Bound by a high cap to avoid runaway responses on huge
  // repositories.  (Docker grouping used to need this too; it is server-side
  // now — see `isDockerGrouped` above.)
  const effectivePageSize = isTreeView ? 500 : pageSize;
  const effectivePage = isTreeView ? 1 : page;

  const handleViewModeChange = useCallback(
    (next: ArtifactViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      // `replace` avoids polluting browser history with each toggle.
      // `scroll: false` keeps the user anchored on the artifacts tab.
      router.replace(`?${params.toString()}`, { scroll: false });
      setPage(1);
    },
    [router, searchParams],
  );

  const { data: artifactsData, isLoading: artifactsLoading } = useQuery({
    queryKey: [
      "artifacts",
      repoKey,
      searchQuery,
      effectivePage,
      effectivePageSize,
      useServerGrouping ? "grouped:maven" : isDockerGrouped ? "grouped:docker" : "flat",
    ],
    queryFn: () =>
      artifactsApi.listGrouped(repoKey, {
        q: searchQuery || undefined,
        per_page: effectivePageSize,
        page: effectivePage,
        // The pagination bar renders `pagination.total` verbatim ("1-20 of N",
        // "Page 1 of M"), so it needs the real count. Without this the backend
        // returns a per-page lower bound (offset + rows + has_more) and the bar
        // reads "1-20 of 21", then "21-40 of 41", growing with the page.
        count: "exact" as const,
        ...(useServerGrouping ? { group_by: "maven_component" as const } : {}),
        ...(isDockerGrouped ? { group_by: "docker_tag" as const } : {}),
      }),
    enabled: !!repoKey,
  });

  // --- quarantine state for the artifact in the detail dialog ---
  //
  // Every current artifact payload (listing, by-id, by-path) carries the
  // verdict as `quarantine_status` (artifact-keeper#2966), but never the
  // *reason* — that is disclosed only by the authenticated,
  // repo-visibility-checked GET /api/v1/quarantine/{id} (#2912). So the
  // status endpoint is queried exactly when the dialog has something to gain
  // from it: the artifact is held (the reason is worth showing) or the
  // payload carried no verdict at all (older backend — absent means "the
  // server did not look", not "not held"; reading it as the latter is what
  // left the quarantine banner unreachable, #650). A clear artifact costs no
  // extra request.
  const selectedArtifactId = selectedArtifact?.id;
  const selectedKnowledge = quarantineKnowledge(selectedArtifact);
  const { data: fetchedQuarantine } = useQuery({
    queryKey: ["quarantine-status", selectedArtifactId],
    queryFn: async () =>
      selectedArtifactId ? await quarantineApi.getStatus(selectedArtifactId) : null,
    enabled: detailOpen && !!selectedArtifactId && selectedKnowledge !== "clear",
  });
  // Prefer the fetched status once it lands: it carries the reason and a
  // freshly computed verdict, while the listing row only has the verdict.
  const quarantine: QuarantineFields | null = !selectedArtifact
    ? null
    : (fetchedQuarantine ?? selectedArtifact);
  const quarantineBlocked = isActivelyQuarantined(quarantine);
  // Download stats for the detail dialog's "Last downloaded" row (#472).
  // Best-effort: if the stats fetch fails (older backend, transient error)
  // the row is simply hidden — the dialog itself is unaffected.
  const { data: artifactStats } = useQuery({
    queryKey: ["artifact-stats", selectedArtifactId],
    queryFn: async () =>
      selectedArtifactId ? await artifactsApi.getStats(selectedArtifactId) : null,
    enabled: detailOpen && !!selectedArtifactId,
  });
  // A rejection is terminal: the backend only accepts
  // `quarantined -> released|rejected`, so offering either on an already
  // rejected artifact would only ever produce a 409.
  const quarantineActionable = quarantineBlocked && !isQuarantineRejected(quarantine);

  const { data: repoSecurity, isLoading: securityLoading } = useQuery({
    queryKey: ["repository-security", repoKey],
    queryFn: () => securityApi.getRepoSecurity(repoKey),
    enabled: !!repoKey && !!user?.is_admin,
  });

  // initialise security form from fetched data
  const securityDefaults: UpsertScanConfigRequest = {
    scan_enabled: repoSecurity?.config?.scan_enabled ?? false,
    scan_on_upload: repoSecurity?.config?.scan_on_upload ?? true,
    scan_on_proxy: repoSecurity?.config?.scan_on_proxy ?? false,
    block_on_policy_violation: repoSecurity?.config?.block_on_policy_violation ?? false,
    severity_threshold: repoSecurity?.config?.severity_threshold ?? "high",
  };
  const currentSecForm = secForm ?? securityDefaults;

  // --- mutations ---
  const deleteMutation = useMutation({
    mutationFn: (path: string) => artifactsApi.delete(repoKey, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
      setDetailOpen(false);
      setSelectedArtifact(null);
      toast.success(t("artifactDeleted"));
      setActionAnnounce(t("artifactDeletedAria"));
    },
    onError: mutationErrorToast(t("deleteFailed")),
  });

  const scanArtifactMutation = useMutation({
    mutationFn: (artifactId: string) =>
      securityApi.triggerScan({ artifact_id: artifactId }),
    onSuccess: (res) => {
      toast.success(t("scanQueued", { count: res.artifacts_queued }));
    },
    onError: mutationErrorToast(t("scanFailed")),
  });

  // Invalidate a single cached entry on a Remote (proxy) repository
  // (artifact-keeper#1539 / artifact-keeper-web#446). Backend rejects this on
  // non-Remote repos with 400, but we also gate the button below on
  // `repository.repo_type === "remote"` so the operation is never offered
  // for repos without a cache.
  const invalidateCacheMutation = useMutation({
    mutationFn: (path: string) => artifactsApi.invalidateCache(repoKey, path),
    onSuccess: () => {
      // Drop the artifacts list and repo summary from the cache so the next
      // fetch goes back to upstream (the underlying download endpoint will
      // re-populate the proxy cache on the next access).
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
      // The open dialog holds a stale copy of the artifact whose
      // cache_cached_at / cache_expires_at fields no longer reflect reality.
      // Close it rather than show outdated freshness fields; the artifacts
      // list refetch above gives the operator the current state.
      setDetailOpen(false);
      setSelectedArtifact(null);
      const message = t("cacheInvalidated");
      toast.success(message);
      setActionAnnounce(message);
    },
    onError: mutationErrorToast(t("cacheInvalidateFailed")),
  });

  // Release or reject a held artifact (#650). Both endpoints are admin-only on
  // the backend; the buttons are gated on `user?.is_admin` as well so an
  // operator is never offered an action that can only come back 403.
  const quarantineMutation = useMutation({
    mutationFn: ({
      artifactId,
      action,
      reason,
    }: {
      artifactId: string;
      action: QuarantineAction;
      reason: string;
    }) =>
      action === "release"
        ? quarantineApi.release(artifactId)
        : quarantineApi.reject(artifactId, reason || undefined),
    onSuccess: (_result, { artifactId, action }) => {
      // The listing row for this artifact now carries a stale verdict, as does
      // any cached status lookup for it.
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["quarantine-status", artifactId] });
      // Apply the same transition the backend just wrote to the copy the open
      // dialog holds: both transitions clear `quarantine_until`, a release
      // moves the status to "released", a rejection to "rejected". The status
      // lookup above was invalidated and refetches the reason on its own.
      // Without this the dialog would keep describing the old hold until it
      // was closed and reopened, and the refetched listing would silently
      // disagree with it.
      setSelectedArtifact((prev) =>
        prev && prev.id === artifactId
          ? {
              ...prev,
              quarantine_status: action === "release" ? "released" : "rejected",
              quarantine_until: null,
            }
          : prev,
      );
      closeQuarantineDialog();
      const message =
        action === "release" ? t("releaseSuccess") : t("rejectSuccess");
      toast.success(message);
      setActionAnnounce(message);
    },
    onError: mutationErrorToast(t("quarantineActionFailed")),
  });

  const scanRepoMutation = useMutation({
    mutationFn: () =>
      securityApi.triggerScan({ repository_id: repository?.id }),
    onSuccess: (res) => {
      toast.success(t("scanQueued", { count: res.artifacts_queued }));
    },
    onError: mutationErrorToast(t("scanFailed")),
  });

  const updateSecurityMutation = useMutation({
    mutationFn: (values: UpsertScanConfigRequest) =>
      securityApi.updateRepoSecurity(repoKey, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository-security", repoKey] });
      setSecForm(null); // reset to refetched defaults
      toast.success(t("securitySaved"));
    },
    onError: mutationErrorToast(t("securitySaveFailed")),
  });

  // --- handlers ---
  const handleDownload = useCallback(
    async (artifact: Artifact) => {
      // The download gate refuses held artifacts with a 409 (or a 403 for a
      // rejection). Say so here rather than letting the click turn into a
      // failed download with no explanation (#650). The controls that call
      // this are disabled for a held artifact; this covers the paths that
      // reach it another way.
      if (isActivelyQuarantined(artifact)) {
        const blockedReason = quarantineDownloadBlockedReason(artifact);
        toast.error(blockedReason);
        setActionAnnounce(blockedReason);
        return;
      }
      const url = artifactsApi.getDownloadUrl(repoKey, artifact.path);
      // Maven artifacts store a bare artifactId as `name`, so saving under it
      // drops the version and extension (#477). The real filename is the last
      // path segment; fall back to `name` when the path is somehow empty.
      const filename = artifact.path.split("/").pop() || artifact.name;
      try {
        const ticket = await artifactsApi.createDownloadTicket(repoKey, artifact.path);
        const link = document.createElement("a");
        link.href = `${url}?ticket=${ticket}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        // Fallback: try without ticket (backend may allow cookie auth)
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [repoKey]
  );

  const handleUpload = useCallback(
    async (file: File, path?: string) => {
      await artifactsApi.upload(repoKey, file, path);
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
    },
    [repoKey, queryClient]
  );

  const handleChunkedComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
    queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
  }, [repoKey, queryClient]);

  const showDetail = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setDetailOpen(true);
  }, []);

  // Grouped (Maven) view only knows a file's path, not its full Artifact
  // record.  Fetch the detail on demand so clicking a file row inside a GAV
  // group opens the same dialog as the flat list (issues #444, #445).
  const showDetailByPath = useCallback(
    async (filePath: string, filename: string) => {
      try {
        const artifact = await artifactsApi.get(repoKey, filePath);
        setSelectedArtifact(artifact);
        setDetailOpen(true);
      } catch {
        toast.error(t("loadDetailsFailed", { filename }));
      }
    },
    [repoKey, t],
  );

  // --- artifact columns ---
  // Maven-family repos store many files per GAV that differ only by
  // classifier and/or extension (`lib-1.0.jar` vs `lib-1.0-sources.jar` vs
  // `lib-1.0.tar.gz`); the flat view could not tell them apart (#474). The
  // coordinates come from the backend-parsed metadata when present, with the
  // path parser as fallback (#482).
  const isMavenFamily = repoFormat === "maven" || repoFormat === "gradle";
  const artifactGavc = (a: Artifact) =>
    mavenGavcFromMetadata(a.metadata) ?? parseMavenGav(a.path);
  const artifactColumns: DataTableColumn<Artifact>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (a) => a.name,
      sortable: true,
      // The name is width-capped and middle-elided (#768). Uncapped, a long
      // filename set this column's width directly — every table cell is
      // `whitespace-nowrap`, so nothing wrapped — and widened the table past
      // the detail panel. The panel's ScrollArea viewport sizes its content
      // with `display: table` and is `overflow-x: hidden`, so the extra width
      // applied to the whole detail column (displacing right-aligned controls
      // in the cards above) and was then clipped, unreachable. One long
      // filename was enough to hide Downloads, Created and the row actions
      // outright.
      //
      // Elided in the MIDDLE, not the end: artifact names are distinguished by
      // their tail as often as their head (`…-tlsconsul` vs
      // `…-tlsconsul-docker`), which end-truncation would collapse into
      // identical-looking rows. Full name via tooltip and the detail dialog.
      cell: (a) => (
        <div className="flex items-center gap-2 max-w-[360px]">
          <button
            className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              showDetail(a);
            }}
          >
            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            <MiddleEllipsis text={a.name} />
          </button>
          {isActivelyQuarantined(a) && (
            // The listing carries no reason (#2966); the badge tooltip falls
            // back to the hold expiry. `shrink-0` keeps the badge legible when
            // the name beside it is being truncated.
            <QuarantineBadge
              quarantineUntil={a.quarantine_until}
              className="shrink-0"
            />
          )}
        </div>
      ),
    },
    {
      id: "path",
      header: t("colPath"),
      accessor: (a) => a.path,
      cell: (a) => (
        <code className="text-xs text-muted-foreground max-w-[200px] truncate block">
          {a.path}
        </code>
      ),
    },
    {
      id: "version",
      header: t("colVersion"),
      accessor: (a) => a.version ?? "",
      cell: (a) =>
        a.version ? (
          <Badge variant="outline" className="text-xs font-normal">
            {a.version}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    ...(isMavenFamily
      ? [
          {
            id: "classifier",
            header: t("colClassifier"),
            accessor: (a: Artifact) => artifactGavc(a)?.classifier ?? "",
            cell: (a: Artifact) => {
              const gavc = artifactGavc(a);
              if (!gavc || (!gavc.classifier && !gavc.extension)) {
                return <span className="text-xs text-muted-foreground">-</span>;
              }
              return (
                <span className="flex items-center gap-1 text-xs">
                  {gavc.classifier && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {gavc.classifier}
                    </Badge>
                  )}
                  {gavc.extension && (
                    <span className="text-muted-foreground">
                      {gavc.extension}
                    </span>
                  )}
                </span>
              );
            },
          } satisfies DataTableColumn<Artifact>,
        ]
      : []),
    {
      id: "size",
      header: t("colSize"),
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
      header: t("colDownloads"),
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
      header: t("colCreated"),
      accessor: (a) => a.created_at,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (a) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => showDetail(a)}
              >
                <Info className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("details")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrapped: a disabled button emits no pointer events, so the
                  tooltip explaining why would never open. */}
              <span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={isActivelyQuarantined(a)}
                  aria-label={
                    isActivelyQuarantined(a)
                      ? t("downloadBlockedAria", { name: a.name })
                      : t("downloadAria", { name: a.name })
                  }
                  onClick={() => handleDownload(a)}
                >
                  <Download className="size-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isActivelyQuarantined(a)
                ? quarantineDownloadBlockedReason(a)
                : t("download")}
            </TooltipContent>
          </Tooltip>
          {user?.is_admin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => scanArtifactMutation.mutate(a.id)}
                  disabled={
                    scanArtifactMutation.isPending || !isArtifactAnalyzable(a)
                  }
                >
                  <Shield className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isArtifactAnalyzable(a) ? t("scan") : t("analyzableDisabled")}
              </TooltipContent>
            </Tooltip>
          )}
          {isAuthenticated && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(a.path)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("delete")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // --- loading / not found ---
  if (repoLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">{t("repoNotFound")}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/repositories")}
        >
          {t("backToRepositories")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - conditional on standalone */}
      {standalone ? (
        <>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/repositories">{t("repositories")}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{repository.key}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Repo metadata header */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.push("/repositories")}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-2xl font-semibold tracking-tight">
                {repository.name}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {repoFormatLabel(repository, formatHandlers).toUpperCase()}
              </Badge>
              {isPluginBackedRepo(repository) && (
                <Badge variant="outline" className="text-xs font-normal">
                  {t("wasmPlugin")}
                </Badge>
              )}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REPO_TYPE_COLORS[repository.repo_type] ?? ""}`}
              >
                {repository.repo_type}
              </span>
              <Badge
                variant={repository.is_public ? "outline" : "secondary"}
                className="text-xs font-normal"
              >
                {repository.is_public ? t("public") : t("private")}
              </Badge>
              <span className="text-sm text-muted-foreground ml-2">
                {t("used", { size: formatBytes(repository.storage_used_bytes) })}
              </span>
            </div>

            {repository.description && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                {repository.description}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{repository.name}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" asChild>
                  <a href={`/repositories/${repoKey}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("openInNewTab")}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {repoFormatLabel(repository, formatHandlers).toUpperCase()}
            </Badge>
            {isPluginBackedRepo(repository) && (
              <Badge variant="outline" className="text-xs font-normal">
                {t("wasmPlugin")}
              </Badge>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REPO_TYPE_COLORS[repository.repo_type] ?? ""}`}
            >
              {repository.repo_type}
            </span>
            <Badge
              variant={repository.is_public ? "outline" : "secondary"}
              className="text-xs font-normal"
            >
              {repository.is_public ? t("public") : t("private")}
            </Badge>
            <span className="text-sm text-muted-foreground ml-2">
              {t("used", { size: formatBytes(repository.storage_used_bytes) })}
            </span>
          </div>
          {repository.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{repository.description}</p>
          )}
        </div>
      )}

      {/* Deduplicated storage usage (epic artifact-keeper#2056). Renders the
          real physical/logical footprint, dedup savings, and — for admins —
          the instance total and reclaimable estimate. Field visibility for
          non-admins on instance-scope backends is enforced by the backend and
          handled gracefully by the panel. */}
      <RepoStoragePanel
        repository={repository}
        isAdmin={!!user?.is_admin}
      />

      {/* Per-folder deduplicated storage (epic artifact-keeper#2056, sub-task
          4). Lists each top-level folder's real physical footprint and dedup
          split. The folder-level figures are not yet part of the generated SDK,
          so the panel reads them from the tree response via a validated
          trust-boundary adapter and renders nothing until a backend reports
          them — no empty panel on backends that predate the folder API. */}
      <RepoFolderStoragePanel
        repository={repository}
        isAdmin={!!user?.is_admin}
      />

      {/* Tabs. The default primary tab is format-driven (#2793): package-oriented
          formats (Maven/npm/PyPI/…) open on Packages, where their catalog lives;
          RAW/Generic and container formats keep Artifacts. An explicit `?tab=`
          wins, and any `?view=` artifact deep-link pins Artifacts. `repository`
          is loaded before this renders (guards above), so the format is known
          when the uncontrolled Tabs mounts. */}
      <Tabs
        defaultValue={resolveInitialRepoTab(
          searchParams.get("tab"),
          searchParams.get("view"),
          repoFormat,
        )}
      >
        <TabsList variant="line">
          <TabsTrigger value="artifacts">
            <FileArchive className="size-3.5 mr-1" />
            {t("tabArtifacts")}
          </TabsTrigger>
          <TabsTrigger value="packages">
            <PackageIcon className="size-3.5 mr-1" />
            {t("tabPackages")}
          </TabsTrigger>
          <TabsTrigger value="setup">
            <Rocket className="size-3.5 mr-1" />
            {t("tabSetup")}
          </TabsTrigger>
          {isAuthenticated && (
            <TabsTrigger value="upload">
              <Upload className="size-3.5 mr-1" />
              {t("tabUpload")}
            </TabsTrigger>
          )}
          {repository.repo_type === "virtual" && (
            <TabsTrigger value="members">
              <Layers className="size-3.5 mr-1" />
              {t("tabMembers")}
            </TabsTrigger>
          )}
          {user?.is_admin &&
            repository.format === "pypi" &&
            repository.repo_type === "virtual" && (
              <TabsTrigger value="pypi-tracks">
                <Link2 className="size-3.5 mr-1" />
                {t("tabTracks")}
              </TabsTrigger>
            )}
          {user?.is_admin && (
            <TabsTrigger value="security">
              <Shield className="size-3.5 mr-1" />
              {t("tabSecurity")}
            </TabsTrigger>
          )}
          {user?.is_admin && (
            <TabsTrigger value="notifications">
              <Bell className="size-3.5 mr-1" />
              {t("tabNotifications")}
            </TabsTrigger>
          )}
          {user?.is_admin && (
            <TabsTrigger value="settings">
              <Settings className="size-3.5 mr-1" />
              {t("tabSettings")}
            </TabsTrigger>
          )}
          {user?.is_admin && (
            <TabsTrigger value="labels">
              <Tag className="size-3.5 mr-1" />
              {t("tabLabels")}
            </TabsTrigger>
          )}
        </TabsList>

        {/* --- Artifacts Tab --- */}
        <TabsContent value="artifacts" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {repoFormat &&
              (supportsGrouping(repoFormat) || supportsTree(repoFormat)) && (
                <ArtifactBrowserToggle
                  value={viewMode}
                  onChange={handleViewModeChange}
                  format={repoFormat}
                />
              )}
            {user?.is_admin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => scanRepoMutation.mutate()}
                disabled={scanRepoMutation.isPending}
              >
                <Shield className="size-4" />
                {scanRepoMutation.isPending ? t("scanning") : t("scanAll")}
              </Button>
            )}
          </div>

          {/*
            M4: SR users get an announcement when the toggle changes the
            view mode.  `role=status` + `aria-live=polite` queues the
            update without interrupting current speech, and `sr-only`
            keeps it visually invisible.
          */}
          <div role="status" aria-live="polite" className="sr-only">
            {viewMode === "grouped"
              ? repoFormat && DOCKER_FAMILY_FORMATS.has(repoFormat)
                ? t("showingGroupedTag")
                : t("showingGroupedComponent")
              : viewMode === "tree"
                ? t("showingTree")
                : t("showingFlat")}
          </div>

          {/* Outcome announcements for destructive actions (delete / cache
              invalidate). Polite so it does not interrupt; sr-only because the
              same text is shown visually via toast. */}
          <div role="status" aria-live="polite" className="sr-only">
            {actionAnnounce}
          </div>

          {useServerGrouping ? (
            <MavenComponentList
              components={artifactsData?.components ?? []}
              loading={artifactsLoading}
              total={artifactsData?.pagination?.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              onFileSelect={showDetailByPath}
              emptyMessage={t("emptyMavenGrouped")}
            />
          ) : isTreeView ? (
            <ArtifactFolderTree
              artifacts={artifactsData?.items ?? []}
              loading={artifactsLoading}
              onFileSelect={showDetail}
              selectedPath={selectedArtifact?.path ?? null}
              emptyMessage={t("emptyArtifacts")}
            />
          ) : isDockerGrouped ? (
            <DockerTagList
              tags={artifactsData?.docker_tags ?? []}
              loading={artifactsLoading}
              total={artifactsData?.pagination?.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              // The grouped row only carries the manifest's artifact id, not
              // the full Artifact — resolve it by its deterministic path
              // (`v2/{image}/manifests/{tag}`, composed by the push handler)
              // so clicking a tag opens the same detail dialog as flat view.
              onTagClick={(t) =>
                showDetailByPath(
                  `v2/${t.image}/manifests/${t.tag}`,
                  `${t.image}:${t.tag}`,
                )
              }
              onScan={
                user?.is_admin
                  ? (t) => scanArtifactMutation.mutate(t.id)
                  : undefined
              }
              scanPending={scanArtifactMutation.isPending}
            />
          ) : (
            <DataTable
              columns={artifactColumns}
              data={artifactsData?.items ?? []}
              total={artifactsData?.pagination?.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              loading={artifactsLoading}
              emptyMessage={t("emptyArtifacts")}
              rowKey={(a) => a.id}
              onRowClick={showDetail}
            />
          )}
        </TabsContent>

        {/* --- Packages Tab --- */}
        <TabsContent value="packages" className="mt-4">
          <PackagesTabContent
            repositoryKey={repoKey}
            repositoryFormat={repository.format}
          />
        </TabsContent>

        {/* --- Setup Tab (#560): same format-aware guide as the central Setup page. --- */}
        <TabsContent value="setup" className="mt-4">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.rich("setupIntro", {
                name: repository.key,
                strong: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </p>
            <RepoSetupGuide repo={repository} />
          </div>
        </TabsContent>

        {/* --- Upload Tab --- */}
        {isAuthenticated && (
          <TabsContent value="upload" className="mt-4">
            <div className="max-w-lg">
              <h3 className="text-sm font-medium mb-4">
                {t("uploadTitle", { name: repository.key })}
              </h3>
              <FileUpload
                onUpload={handleUpload}
                showPathInput
                repositoryKey={repoKey}
                onChunkedComplete={handleChunkedComplete}
                maxUploadSizeBytes={systemConfig.max_upload_size_bytes}
              />
            </div>
          </TabsContent>
        )}

        {/* --- Members Tab (Virtual Repos) --- */}
        {repository.repo_type === "virtual" && (
          <TabsContent value="members" className="mt-4">
            <VirtualMembersPanel repository={repository} />
          </TabsContent>
        )}

        {/* --- PyPI Tracks Tab (PEP 708, virtual PyPI repos) --- */}
        {user?.is_admin &&
          repository.format === "pypi" &&
          repository.repo_type === "virtual" && (
            <TabsContent value="pypi-tracks" className="mt-4">
              <PypiTracksPanel repository={repository} />
            </TabsContent>
          )}

        {/* --- Security Tab --- */}
        {user?.is_admin && (
          <TabsContent value="security" className="mt-4">
            {securityLoading ? (
              <div className="space-y-3 max-w-md">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <form
                className="space-y-5 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateSecurityMutation.mutate(currentSecForm);
                }}
              >
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-enabled">{t("enableScanning")}</Label>
                  <Switch
                    id="sec-enabled"
                    checked={currentSecForm.scan_enabled}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_enabled: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-upload">{t("scanOnUpload")}</Label>
                  <Switch
                    id="sec-upload"
                    checked={currentSecForm.scan_on_upload}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_on_upload: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-proxy">{t("scanOnProxy")}</Label>
                  <Switch
                    id="sec-proxy"
                    checked={currentSecForm.scan_on_proxy}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_on_proxy: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-block">{t("blockOnViolation")}</Label>
                  <Switch
                    id="sec-block"
                    checked={currentSecForm.block_on_policy_violation}
                    onCheckedChange={(v) =>
                      setSecForm({
                        ...currentSecForm,
                        block_on_policy_violation: v,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("severityThreshold")}</Label>
                  <Select
                    value={currentSecForm.severity_threshold}
                    onValueChange={(v) =>
                      setSecForm({ ...currentSecForm, severity_threshold: v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">{tSev("critical")}</SelectItem>
                      <SelectItem value="high">{tSev("high")}</SelectItem>
                      <SelectItem value="medium">{tSev("medium")}</SelectItem>
                      <SelectItem value="low">{tSev("low")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={updateSecurityMutation.isPending}
                >
                  {updateSecurityMutation.isPending
                    ? t("saving")
                    : t("saveSettings")}
                </Button>
              </form>
            )}
          </TabsContent>
        )}

        {/* --- Notifications Tab --- */}
        {user?.is_admin && (
          <TabsContent value="notifications" className="mt-4">
            <NotificationsTabContent repositoryId={repository.id} />
          </TabsContent>
        )}

        {/* --- Settings Tab --- */}
        {user?.is_admin && (
          <TabsContent value="settings" className="mt-4">
            <RepoSettingsTab repository={repository} />
          </TabsContent>
        )}

        {/* --- Labels Tab --- */}
        {user?.is_admin && (
          <TabsContent value="labels" className="mt-4">
            <RepoLabelsPanel repository={repository} />
          </TabsContent>
        )}
      </Tabs>

      {/* --- Artifact Detail Dialog --- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileIcon className="size-4" />
              {selectedArtifact?.name ?? t("artifactDetails")}
            </DialogTitle>
          </DialogHeader>
          {quarantineBlocked && (
            <QuarantineBanner
              reason={quarantine?.quarantine_reason}
              quarantineUntil={quarantine?.quarantine_until}
              status={quarantine?.quarantine_status}
            />
          )}
          {selectedArtifact && (
            <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
              <TabsList variant="line" className="shrink-0">
                <TabsTrigger value="details">
                  <Info className="size-3.5 mr-1" />
                  {t("tabDetails")}
                </TabsTrigger>
                {versioningActive && (
                  <TabsTrigger value="versions">
                    <History className="size-3.5 mr-1" />
                    {t("tabVersions")}
                  </TabsTrigger>
                )}
                <TabsTrigger value="sbom">
                  <FileIcon className="size-3.5 mr-1" />
                  {t("tabSbom")}
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Shield className="size-3.5 mr-1" />
                  {t("tabSecurity")}
                </TabsTrigger>
                <TabsTrigger value="health">
                  <HeartPulse className="size-3.5 mr-1" />
                  {t("tabHealth")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex-1 overflow-y-auto mt-4">
                <div className="space-y-3 text-sm">
                  <DetailRow label={t("detailName")} value={selectedArtifact.name} />
                  <DetailRow label={t("detailPath")} value={selectedArtifact.path} copy />
                  {selectedArtifact.version && (
                    <DetailRow label={t("detailVersion")} value={selectedArtifact.version} />
                  )}
                  <DetailRow
                    label={t("detailSize")}
                    value={`${formatBytes(selectedArtifact.size_bytes)} (${selectedArtifact.size_bytes.toLocaleString()} bytes)`}
                  />
                  <DetailRow
                    label={t("detailContentType")}
                    value={selectedArtifact.content_type}
                  />
                  <DetailRow
                    label={t("detailDownloads")}
                    value={selectedArtifact.download_count.toLocaleString()}
                  />
                  {artifactStats?.last_downloaded && (
                    <DetailRow
                      label={t("detailLastDownloaded")}
                      value={new Date(
                        artifactStats.last_downloaded
                      ).toLocaleString()}
                    />
                  )}
                  {quarantineBlocked && (
                    <>
                      <DetailRow
                        label={t("detailQuarantine")}
                        value={
                          // The reason is redacted for callers who cannot
                          // access the repository, so fall back to the status
                          // rather than rendering a blank row.
                          quarantine?.quarantine_reason ||
                          (isQuarantineRejected(quarantine)
                            ? t("rejectedInReview")
                            : t("active"))
                        }
                      />
                      {quarantine?.quarantine_until && (
                        <DetailRow
                          label={t("detailQuarantineUntil")}
                          value={new Date(quarantine.quarantine_until).toLocaleString()}
                        />
                      )}
                    </>
                  )}
                  <DetailRow
                    label={t("detailCreated")}
                    value={new Date(selectedArtifact.created_at).toLocaleString()}
                  />
                  {repository.repo_type === "remote" &&
                    selectedArtifact.cache_cached_at && (
                      <DetailRow
                        label={t("detailCached")}
                        value={formatRelativeTimestamp(
                          selectedArtifact.cache_cached_at
                        )}
                        title={new Date(
                          selectedArtifact.cache_cached_at
                        ).toLocaleString()}
                      />
                    )}
                  {repository.repo_type === "remote" &&
                    selectedArtifact.cache_expires_at && (
                      <DetailRow
                        label={t("detailCacheExpires")}
                        value={formatCacheExpiry(
                          selectedArtifact.cache_expires_at
                        )}
                        title={new Date(
                          selectedArtifact.cache_expires_at
                        ).toLocaleString()}
                      />
                    )}
                  <DetailRow
                    label={t("detailSha256")}
                    value={selectedArtifact.checksum_sha256}
                    copy
                    mono
                  />
                  <DetailRow
                    label={t("detailDownloadUrl")}
                    value={artifactsApi.getAbsoluteDownloadUrl(repoKey, selectedArtifact.path)}
                    copy
                    mono
                  />
                  {(repoFormat === "maven" || repoFormat === "gradle") && (
                    <MavenGavSection
                      path={selectedArtifact.path}
                      metadata={selectedArtifact.metadata}
                    />
                  )}
                  {selectedArtifact.metadata &&
                    Object.keys(selectedArtifact.metadata).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("metadata")}
                        </p>
                        <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-40">
                          {JSON.stringify(selectedArtifact.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                </div>
              </TabsContent>

              {versioningActive && (
                <TabsContent
                  value="versions"
                  className="flex-1 overflow-y-auto mt-4"
                >
                  <ArtifactVersionsSection
                    repoKey={repoKey}
                    artifact={selectedArtifact}
                  />
                </TabsContent>
              )}

              <TabsContent value="sbom" className="flex-1 overflow-y-auto mt-4">
                <SbomTabContent artifact={selectedArtifact} />
              </TabsContent>

              <TabsContent value="security" className="flex-1 overflow-y-auto mt-4">
                <SecurityTabContent artifact={selectedArtifact} />
              </TabsContent>

              <TabsContent value="health" className="flex-1 overflow-y-auto mt-4">
                <HealthTabContent artifact={selectedArtifact} />
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              onClick={() => setDetailOpen(false)}
            >
              {t("close")}
            </Button>
            {selectedArtifact && (
              <>
                {user?.is_admin && (
                  <Button
                    variant="outline"
                    onClick={() => scanArtifactMutation.mutate(selectedArtifact.id)}
                    disabled={
                      scanArtifactMutation.isPending ||
                      !isArtifactAnalyzable(selectedArtifact)
                    }
                    title={
                      isArtifactAnalyzable(selectedArtifact)
                        ? undefined
                        : t("analyzableDisabled")
                    }
                  >
                    <Shield className="size-4" />
                    {scanArtifactMutation.isPending ? t("scanning") : t("scan")}
                  </Button>
                )}
                {user?.is_admin && quarantineActionable && (
                  <>
                    <Button
                      variant="outline"
                      disabled={quarantineMutation.isPending}
                      onClick={() => setQuarantineAction("release")}
                    >
                      <Check className="size-4 text-emerald-600" />
                      {t("release")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={quarantineMutation.isPending}
                      onClick={() => setQuarantineAction("reject")}
                    >
                      <X className="size-4 text-destructive" />
                      {t("reject")}
                    </Button>
                  </>
                )}
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedArtifact) deleteMutation.mutate(selectedArtifact.path);
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                  {t("delete")}
                </Button>
                {repository.repo_type === "remote" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={invalidateCacheMutation.isPending}
                        title={t("invalidateTooltip")}
                      >
                        <RotateCcw className="size-4" />
                        {invalidateCacheMutation.isPending
                          ? t("invalidating")
                          : t("invalidateCache")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("invalidateTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t.rich("invalidateDescription", {
                            name: selectedArtifact.name,
                            medium: (chunks) => (
                              <span className="font-medium">{chunks}</span>
                            ),
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            if (selectedArtifact) {
                              invalidateCacheMutation.mutate(
                                selectedArtifact.path
                              );
                            }
                          }}
                        >
                          {t("invalidate")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {/* A held artifact's bytes are refused by the download gate,
                    so the control says so instead of handing the user a 409.
                    The banner above carries the explanation. */}
                <Button
                  disabled={quarantineBlocked}
                  title={
                    quarantineBlocked
                      ? quarantineDownloadBlockedReason(quarantine)
                      : undefined
                  }
                  onClick={() => selectedArtifact && handleDownload(selectedArtifact)}
                >
                  <Download className="size-4" />
                  {quarantineBlocked ? t("downloadBlocked") : t("download")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Quarantine decision confirmation (#650) ---
          Structured like the age gate review queue's approve/reject
          confirmation so the two admin review surfaces behave the same way.
          Release takes no reason: the backend clears `quarantine_reason` when
          it lifts a hold, so an input there would be discarded. */}
      <Dialog
        open={quarantineAction !== null}
        onOpenChange={(open) => {
          if (!open) closeQuarantineDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quarantineAction === "reject"
                ? t("rejectConfirmTitle", { name: selectedArtifact?.name ?? "" })
                : t("releaseConfirmTitle", { name: selectedArtifact?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {quarantineAction === "reject"
                ? t("rejectDescription")
                : t("releaseDescription")}
            </DialogDescription>
          </DialogHeader>
          {quarantineAction === "reject" && (
            <div className="py-2">
              <Input
                placeholder={t("reasonPlaceholder")}
                value={quarantineReason}
                onChange={(e) => setQuarantineReason(e.target.value)}
                aria-label={t("reasonAria")}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeQuarantineDialog}>
              {t("cancel")}
            </Button>
            <Button
              variant={quarantineAction === "reject" ? "destructive" : "default"}
              disabled={quarantineMutation.isPending}
              onClick={() => {
                if (!selectedArtifact || !quarantineAction) return;
                quarantineMutation.mutate({
                  artifactId: selectedArtifact.id,
                  action: quarantineAction,
                  reason: quarantineReason.trim(),
                });
              }}
            >
              {quarantineMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- detail row helper --

/**
 * Maven GAV coordinates plus a copy/paste pom.xml dependency snippet. Shown
 * in the artifact detail view for maven/gradle repositories so users can
 * identify the GAV and reuse it. (issue #442)
 *
 * The backend parses the coordinates (classifier included) once at upload
 * time and stores them in `artifact.metadata`; prefer that over re-parsing
 * the path client-side, falling back to `parseMavenGav` for backends that
 * predate the stored form (#482).
 */
function MavenGavSection({
  path,
  metadata,
}: {
  path: string;
  metadata?: Record<string, unknown>;
}) {
  const t = useTranslations("app/repositories/_components/repo-detail-content");
  const gav = mavenGavcFromMetadata(metadata) ?? parseMavenGav(path);
  if (!gav) return null;
  const snippet = buildPomDependencySnippet(gav);
  return (
    <div data-testid="maven-gav-section" className="space-y-3">
      <DetailRow label={t("gavGroupId")} value={gav.groupId} copy mono />
      <DetailRow label={t("gavArtifactId")} value={gav.artifactId} copy mono />
      <DetailRow label={t("gavVersion")} value={gav.version} copy mono />
      {gav.classifier && (
        <DetailRow label={t("gavClassifier")} value={gav.classifier} copy mono />
      )}
      {gav.extension && (
        <DetailRow label={t("gavExtension")} value={gav.extension} copy mono />
      )}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            {t("pomDependency")}
          </p>
          <CopyButton value={snippet} />
        </div>
        <pre
          data-testid="maven-pom-snippet"
          className="overflow-auto rounded-md bg-muted p-3 text-xs"
        >
          {snippet}
        </pre>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copy,
  mono,
  title,
}: {
  label: string;
  value: string;
  copy?: boolean;
  mono?: boolean;
  /**
   * Override the hover-tooltip text. Defaults to `value` when omitted.
   * Useful for rows where the visible text is a derived/abbreviated form
   * (e.g. "in 4 hours") and the full ISO-8601 timestamp belongs in the
   * tooltip rather than the visible cell — see the cache_cached_at /
   * cache_expires_at rows added in #449.
   */
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <span className="text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={`break-all ${mono ? "font-mono text-xs" : ""}`}
          title={title ?? value}
        >
          {value}
        </span>
        {copy && <CopyButton value={value} />}
      </div>
    </div>
  );
}
