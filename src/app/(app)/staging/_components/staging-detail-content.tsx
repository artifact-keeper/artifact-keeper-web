"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import { promotionApi } from "@/lib/api/promotion";
import type { Artifact } from "@/types";
import type { StagingArtifact, PolicyViolation } from "@/types/promotion";
import { POLICY_STATUS_COLORS, SEVERITY_COLORS } from "@/types/promotion";
import { formatBytes } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { POLICY_STATUS_LABELS } from "../_lib/constants";
import { PromotionDialog } from "./promotion-dialog";
import { RejectionDialog } from "./rejection-dialog";
import { PromotionHistory } from "./promotion-history";

interface StagingDetailContentProps {
  repoKey: string;
  standalone?: boolean;
}

// Transform base artifact to staging artifact with mock policy status
function toStagingArtifact(artifact: Artifact): StagingArtifact {
  // In a real implementation, policy_status would come from the backend
  // For now we'll derive it based on artifact metadata if available
  const policyStatus = artifact.metadata?.policy_status as StagingArtifact["policy_status"] | undefined;
  return {
    ...artifact,
    policy_status: policyStatus ?? "pending",
    policy_result: artifact.metadata?.policy_result as StagingArtifact["policy_result"] | undefined,
  };
}

export function StagingDetailContent({
  repoKey,
  standalone = false,
}: StagingDetailContentProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // search / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // promotion dialog
  const [promotionOpen, setPromotionOpen] = useState(false);

  // rejection dialog
  const [rejectionOpen, setRejectionOpen] = useState(false);

  // --- queries ---
  const { data: repository, isLoading: repoLoading } = useQuery({
    queryKey: ["repository", repoKey],
    queryFn: () => repositoriesApi.get(repoKey),
    enabled: !!repoKey,
  });

  const { data: artifactsData, isLoading: artifactsLoading } = useQuery({
    queryKey: ["staging-artifacts", repoKey, searchQuery, page, pageSize],
    queryFn: () =>
      promotionApi.listStagingArtifacts(repoKey, {
        page,
        per_page: pageSize,
        path_prefix: searchQuery || undefined,
      }),
    enabled: !!repoKey,
  });

  const artifacts: StagingArtifact[] = useMemo(
    () => (artifactsData?.items ?? []).map(toStagingArtifact),
    [artifactsData?.items]
  );

  const selectedArtifacts = useMemo(
    () => artifacts.filter((a) => selectedIds.has(a.id)),
    [artifacts, selectedIds]
  );

  const allSelected = artifacts.length > 0 && selectedIds.size === artifacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < artifacts.length;

  // --- handlers ---
  function toggleSetItem(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(artifacts.map((a) => a.id)));
    }
  }, [allSelected, artifacts]);

  const handleSelectOne = useCallback(
    (id: string) => toggleSetItem(setSelectedIds, id),
    []
  );

  const toggleExpanded = useCallback(
    (id: string) => toggleSetItem(setExpandedRows, id),
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // --- loading / not found ---
  if (repoLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">Staging repository not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/staging")}
        >
          Back to Staging
        </Button>
      </div>
    );
  }

  const totalPages = artifactsData?.pagination?.total_pages ?? 1;
  const total = artifactsData?.pagination?.total ?? 0;

  const repoMetaBadges = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {repository.format.toUpperCase()}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs font-normal bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800"
        >
          staging
        </Badge>
        <span className="text-sm text-muted-foreground ml-2">
          {formatBytes(repository.storage_used_bytes)} used
        </span>
      </div>
      {repository.description && (
        <p className="text-sm text-muted-foreground max-w-2xl">
          {repository.description}
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header - conditional on standalone */}
      {standalone ? (
        <>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/staging">Staging</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{repository.key}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.push("/staging")}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-2xl font-semibold tracking-tight">
                {repository.name}
              </h1>
            </div>
            {repoMetaBadges}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{repository.name}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" asChild>
                  <a
                    href={`/staging/${repoKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in new tab</TooltipContent>
            </Tooltip>
          </div>
          {repoMetaBadges}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="artifacts">
        <TabsList variant="line">
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="history">Promotion History</TabsTrigger>
        </TabsList>

        {/* --- Artifacts Tab --- */}
        <TabsContent value="artifacts" className="mt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search artifacts..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {isAuthenticated && (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => setRejectionOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  <XCircle className="size-4" />
                  Reject ({selectedIds.size})
                </Button>
                <Button
                  onClick={() => setPromotionOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  <ArrowUpRight className="size-4" />
                  Promote ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>

          {/* Artifacts Table */}
          {artifactsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-md">
              <Package className="size-8 mb-2 opacity-50" />
              <p className="text-sm">No artifacts in this staging repository.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el && someSelected) {
                            (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = true;
                          }
                        }}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[30px]" />
                    <TableHead>Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Policy Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((artifact) => (
                    <ArtifactRow
                      key={artifact.id}
                      artifact={artifact}
                      selected={selectedIds.has(artifact.id)}
                      expanded={expandedRows.has(artifact.id)}
                      onSelect={() => handleSelectOne(artifact.id)}
                      onToggleExpand={() => toggleExpanded(artifact.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* --- History Tab --- */}
        <TabsContent value="history" className="mt-4">
          <PromotionHistory repoKey={repoKey} />
        </TabsContent>
      </Tabs>

      {/* Promotion Dialog */}
      <PromotionDialog
        open={promotionOpen}
        onOpenChange={setPromotionOpen}
        sourceRepoKey={repoKey}
        sourceRepoFormat={repository.format}
        selectedArtifacts={selectedArtifacts}
        onSuccess={clearSelection}
      />

      {/* Rejection Dialog */}
      <RejectionDialog
        open={rejectionOpen}
        onOpenChange={setRejectionOpen}
        sourceRepoKey={repoKey}
        selectedArtifacts={selectedArtifacts}
        onSuccess={clearSelection}
      />
    </div>
  );
}

// --- Artifact Row Component ---

function ArtifactRow({
  artifact,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
}: {
  artifact: StagingArtifact;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const hasViolations = (artifact.policy_result?.violations?.length ?? 0) > 0;

  const statusIcon = {
    passing: <CheckCircle className="size-3.5 text-green-500" />,
    failing: <XCircle className="size-3.5 text-red-500" />,
    warning: <AlertTriangle className="size-3.5 text-yellow-500" />,
    pending: <Clock className="size-3.5 text-gray-500" />,
  };

  return (
    <Collapsible open={expanded} onOpenChange={onToggleExpand} asChild>
      <>
        <TableRow className={selected ? "bg-accent/50" : undefined}>
          <TableCell>
            <Checkbox
              checked={selected}
              onCheckedChange={onSelect}
              aria-label={`Select ${artifact.name}`}
              onClick={(e) => e.stopPropagation()}
            />
          </TableCell>
          <TableCell>
            {hasViolations && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-xs">
                  {expanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </TableCell>
          <TableCell>
            <span className="font-medium text-sm">{artifact.name}</span>
          </TableCell>
          <TableCell>
            {artifact.version ? (
              <Badge variant="outline" className="text-xs font-normal">
                {artifact.version}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell>
            <span className="text-sm text-muted-foreground">
              {formatBytes(artifact.size_bytes)}
            </span>
          </TableCell>
          <TableCell>
            <Badge
              variant="outline"
              className={`text-xs ${POLICY_STATUS_COLORS[artifact.policy_status ?? "pending"]}`}
            >
              {statusIcon[artifact.policy_status ?? "pending"]}
              <span className="ml-1">
                {POLICY_STATUS_LABELS[artifact.policy_status ?? "pending"]}
              </span>
            </Badge>
          </TableCell>
          <TableCell>
            <span className="text-sm text-muted-foreground">
              {new Date(artifact.created_at).toLocaleDateString()}
            </span>
          </TableCell>
        </TableRow>

        {/* Expanded violations row */}
        {hasViolations && (
          <CollapsibleContent asChild>
            <TableRow className="bg-muted/30">
              <TableCell colSpan={7} className="p-0">
                <div className="px-4 py-3 ml-[70px] space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Policy Violations ({artifact.policy_result?.violations.length})
                  </p>
                  <div className="space-y-1">
                    {artifact.policy_result?.violations.map(
                      (v: PolicyViolation, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <Badge
                            className={`shrink-0 text-[10px] ${SEVERITY_COLORS[v.severity]}`}
                          >
                            {v.severity}
                          </Badge>
                          <div>
                            <span className="font-medium">{v.rule}:</span>{" "}
                            <span className="text-muted-foreground">{v.message}</span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </CollapsibleContent>
        )}
      </>
    </Collapsible>
  );
}
