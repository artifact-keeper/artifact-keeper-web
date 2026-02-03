"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SearchIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Hammer,
  Clock,
  GitBranch,
  GitCommit,
  Layers,
  Package,
  ArrowRightLeft,
  X,
  FileText,
  CheckCircle2,
  XCircle,
  Timer,
  CircleDashed,
  Ban,
  CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildsApi } from "@/lib/api/builds";
import { formatBytes } from "@/lib/utils";
import type {
  Build,
  BuildStatus,
  BuildDiff,
  BuildModule,
} from "@/types/builds";

// ---- Helpers ----

function formatDuration(ms: number | undefined): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIcon(status: BuildStatus) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "failed":
      return <XCircle className="size-4 text-red-500" />;
    case "running":
      return <Loader2 className="size-4 text-blue-500 animate-spin" />;
    case "pending":
      return <CircleDashed className="size-4 text-yellow-500" />;
    case "cancelled":
      return <Ban className="size-4 text-muted-foreground" />;
  }
}

function statusBadgeVariant(
  status: BuildStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "failed":
      return "destructive";
    case "running":
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

const STATUS_OPTIONS: { value: BuildStatus; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
];

// ---- Build Detail Dialog ----

function BuildDetailDialog({
  build,
  open,
  onOpenChange,
  onCompare,
}: {
  build: Build | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompare: () => void;
}) {
  if (!build) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {statusIcon(build.status)}
            {build.name} #{build.number}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="modules">
              Modules ({build.modules?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="flex-1 overflow-auto">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoItem
                  icon={<Clock className="size-3.5" />}
                  label="Status"
                >
                  <Badge variant={statusBadgeVariant(build.status)}>
                    {build.status}
                  </Badge>
                </InfoItem>
                <InfoItem
                  icon={<Timer className="size-3.5" />}
                  label="Duration"
                >
                  {formatDuration(build.duration_ms)}
                </InfoItem>
                <InfoItem
                  icon={<CalendarDays className="size-3.5" />}
                  label="Started"
                >
                  {formatDateTime(build.started_at)}
                </InfoItem>
                <InfoItem
                  icon={<CalendarDays className="size-3.5" />}
                  label="Finished"
                >
                  {formatDateTime(build.finished_at)}
                </InfoItem>
                {build.vcs_branch && (
                  <InfoItem
                    icon={<GitBranch className="size-3.5" />}
                    label="Branch"
                  >
                    {build.vcs_branch}
                  </InfoItem>
                )}
                {build.vcs_revision && (
                  <InfoItem
                    icon={<GitCommit className="size-3.5" />}
                    label="Commit"
                  >
                    <code className="text-xs">
                      {build.vcs_revision.slice(0, 8)}
                    </code>
                  </InfoItem>
                )}
                <InfoItem
                  icon={<Layers className="size-3.5" />}
                  label="Modules"
                >
                  {build.modules?.length ?? 0}
                </InfoItem>
                <InfoItem
                  icon={<Package className="size-3.5" />}
                  label="Artifacts"
                >
                  {build.artifact_count ?? 0}
                </InfoItem>
              </div>

              {build.vcs_message && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Commit:</span>{" "}
                  {build.vcs_message}
                </div>
              )}

              {build.agent && (
                <div className="text-sm text-muted-foreground">
                  Triggered by{" "}
                  <span className="font-medium text-foreground">
                    {build.agent}
                  </span>
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCompare}
                  className="gap-1.5"
                >
                  <ArrowRightLeft className="size-3.5" />
                  Compare with another build
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Modules */}
          <TabsContent value="modules" className="flex-1 overflow-auto">
            <div className="space-y-2 py-4">
              {(!build.modules || build.modules.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No module information available
                  </p>
                </div>
              ) : (
                build.modules.map((mod) => (
                  <ModuleCard key={mod.id} module={mod} />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}


function ModuleCard({ module }: { module: BuildModule }) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{module.module_name || module.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatBytes(module.size_bytes)}
        </span>
      </div>
    </div>
  );
}

// ---- Build Diff Dialog ----

function BuildDiffDialog({
  diff,
  open,
  onOpenChange,
  isLoading,
}: {
  diff: BuildDiff | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-4" />
            Build Comparison
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !diff ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No diff data available
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-6 py-4">
            {/* Build IDs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Build A</p>
                <code className="text-xs">{diff.build_a.slice(0, 8)}</code>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Build B</p>
                <code className="text-xs">{diff.build_b.slice(0, 8)}</code>
              </div>
            </div>

            {/* Added artifacts */}
            {diff.added.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Added ({diff.added.length})
                </h3>
                <div className="space-y-1">
                  {diff.added.map((art) => (
                    <div
                      key={art.path}
                      className="flex items-center justify-between text-sm rounded-lg bg-green-50 dark:bg-green-950/20 px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 dark:text-green-400">+</span>
                        <span className="font-mono text-xs">{art.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(art.size_bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Removed artifacts */}
            {diff.removed.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Removed ({diff.removed.length})
                </h3>
                <div className="space-y-1">
                  {diff.removed.map((art) => (
                    <div
                      key={art.path}
                      className="flex items-center justify-between text-sm rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400">-</span>
                        <span className="font-mono text-xs">{art.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(art.size_bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modified artifacts */}
            {diff.modified.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Modified ({diff.modified.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Old Size</TableHead>
                      <TableHead className="text-right">New Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.modified.map((art) => (
                      <TableRow key={art.path}>
                        <TableCell className="font-mono text-xs">
                          {art.name}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatBytes(art.old_size_bytes)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatBytes(art.new_size_bytes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No differences found between these builds
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Main Builds Page ----

export default function BuildsPage() {
  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BuildStatus | "">("");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Selection
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Comparison
  const [comparisonMode, setComparisonMode] = useState(false);
  const [compareBuildA, setCompareBuildA] = useState<string | null>(null);
  const [compareBuildB, setCompareBuildB] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  // Fetch builds
  const { data: buildsData, isLoading } = useQuery({
    queryKey: ["builds", search, statusFilter, sortBy, page, pageSize],
    queryFn: () =>
      buildsApi.list({
        page,
        per_page: pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        sort_by: sortBy,
        sort_order: "desc",
      }),
  });

  const builds = buildsData?.items ?? [];
  const totalPages = buildsData?.pagination?.total_pages ?? 0;
  const totalBuilds = buildsData?.pagination?.total ?? 0;

  // Fetch build detail
  const { data: buildDetail } = useQuery({
    queryKey: ["build-detail", selectedBuildId],
    queryFn: () => (selectedBuildId ? buildsApi.get(selectedBuildId) : null),
    enabled: !!selectedBuildId,
  });

  // Fetch build diff
  const { data: buildDiff, isLoading: diffLoading } = useQuery({
    queryKey: ["build-diff", compareBuildA, compareBuildB],
    queryFn: () =>
      compareBuildA && compareBuildB
        ? buildsApi.diff(compareBuildA, compareBuildB)
        : null,
    enabled: !!compareBuildA && !!compareBuildB && diffOpen,
  });

  const handleRowClick = useCallback(
    (build: Build) => {
      if (comparisonMode) {
        if (!compareBuildA) {
          setCompareBuildA(build.id);
        } else if (!compareBuildB && build.id !== compareBuildA) {
          setCompareBuildB(build.id);
          setDiffOpen(true);
        }
      } else {
        setSelectedBuildId(build.id);
        setDetailOpen(true);
      }
    },
    [comparisonMode, compareBuildA, compareBuildB]
  );

  const handleStartComparison = useCallback(() => {
    setComparisonMode(true);
    setCompareBuildA(selectedBuildId);
    setCompareBuildB(null);
    setDetailOpen(false);
  }, [selectedBuildId]);

  const handleExitComparison = useCallback(() => {
    setComparisonMode(false);
    setCompareBuildA(null);
    setCompareBuildB(null);
  }, []);

  const hasFilters = search || statusFilter;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Builds</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View build history, details, and comparisons
          </p>
        </div>
        {comparisonMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExitComparison}
            className="gap-1.5"
          >
            <X className="size-3.5" />
            Exit comparison
          </Button>
        )}
      </div>

      {/* Comparison mode banner */}
      {comparisonMode && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center gap-3">
          <ArrowRightLeft className="size-4 text-primary shrink-0" />
          <p className="text-sm">
            {compareBuildA && !compareBuildB
              ? "Select another build to compare"
              : "Select the first build to compare"}
          </p>
        </div>
      )}

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search builds..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>

            <Select
              value={statusFilter || "__all__"}
              onValueChange={(val) => {
                setStatusFilter(val === "__all__" ? "" : (val as BuildStatus));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date</SelectItem>
                <SelectItem value="build_number">Build Number</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      {!isLoading && (
        <div className="text-sm text-muted-foreground">
          {totalBuilds} {totalBuilds === 1 ? "build" : "builds"} found
        </div>
      )}

      {/* Builds table */}
      <Card className="py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : builds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Hammer className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No builds found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Build</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Modules</TableHead>
                  <TableHead className="text-right">Artifacts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((build) => {
                  const isSelectedForCompare =
                    comparisonMode &&
                    (build.id === compareBuildA ||
                      build.id === compareBuildB);

                  return (
                    <TableRow
                      key={build.id}
                      className={`cursor-pointer ${
                        isSelectedForCompare
                          ? "bg-primary/5"
                          : ""
                      }`}
                      onClick={() => handleRowClick(build)}
                    >
                      <TableCell>{statusIcon(build.status)}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {build.name}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            #{build.number}
                          </span>
                        </div>
                        {build.agent && (
                          <p className="text-xs text-muted-foreground">
                            by {build.agent}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadgeVariant(build.status)}
                          className="text-xs"
                        >
                          {build.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(build.started_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDuration(build.duration_ms)}
                      </TableCell>
                      <TableCell>
                        {build.vcs_branch && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <GitBranch className="size-3" />
                            <span className="text-xs">{build.vcs_branch}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {build.modules?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {build.artifact_count ?? 0}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Build Detail Dialog */}
      <BuildDetailDialog
        build={buildDetail ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCompare={handleStartComparison}
      />

      {/* Build Diff Dialog */}
      <BuildDiffDialog
        diff={buildDiff ?? null}
        open={diffOpen}
        onOpenChange={(open) => {
          setDiffOpen(open);
          if (!open) {
            handleExitComparison();
          }
        }}
        isLoading={diffLoading}
      />
    </div>
  );
}
