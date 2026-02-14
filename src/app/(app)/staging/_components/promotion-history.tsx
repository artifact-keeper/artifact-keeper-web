"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
} from "lucide-react";

import { promotionApi } from "@/lib/api/promotion";
import type {
  PromotionHistoryEntry,
  PromotionHistoryStatus,
  PolicyViolation,
} from "@/types/promotion";
import {
  SEVERITY_COLORS,
  PROMOTION_HISTORY_STATUS_COLORS,
} from "@/types/promotion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PromotionHistoryProps {
  repoKey: string;
}

const STATUS_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "__all__", label: "All statuses" },
  { value: "promoted", label: "Promoted" },
  { value: "rejected", label: "Rejected" },
  { value: "pending_approval", label: "Pending Approval" },
];

export function PromotionHistory({ repoKey }: PromotionHistoryProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("__all__");
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["promotion-history", repoKey, page, pageSize, statusFilter],
    queryFn: () =>
      promotionApi.getPromotionHistory(repoKey, {
        page,
        per_page: pageSize,
        status: statusFilter === "__all__" ? undefined : statusFilter,
      }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const entries = data?.items ?? [];
  const totalPages = data?.pagination?.total_pages ?? 1;

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ArrowRight className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No promotion history yet.</p>
          <p className="text-xs mt-1">
            Promotions from this staging repository will appear here.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-1 pr-4">
            {entries.map((entry) => (
              <PromotionHistoryItem key={entry.id} entry={entry} />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
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
    </div>
  );
}

const STATUS_ICON: Record<
  PromotionHistoryStatus,
  { icon: typeof CheckCircle; className: string; bgClassName: string }
> = {
  promoted: {
    icon: CheckCircle,
    className: "text-green-600 dark:text-green-400",
    bgClassName: "bg-green-100 dark:bg-green-900/30",
  },
  rejected: {
    icon: XCircle,
    className: "text-red-600 dark:text-red-400",
    bgClassName: "bg-red-100 dark:bg-red-900/30",
  },
  pending_approval: {
    icon: Clock,
    className: "text-yellow-600 dark:text-yellow-400",
    bgClassName: "bg-yellow-100 dark:bg-yellow-900/30",
  },
};

const STATUS_LABEL: Record<PromotionHistoryStatus, string> = {
  promoted: "Promoted",
  rejected: "Rejected",
  pending_approval: "Pending Approval",
};

function PromotionHistoryItem({ entry }: { entry: PromotionHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasViolations = (entry.policy_result?.violations?.length ?? 0) > 0;

  const status: PromotionHistoryStatus = entry.status ?? "promoted";

  const statusMeta = STATUS_ICON[status] ?? STATUS_ICON.promoted;
  const StatusIcon = statusMeta.icon;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border bg-card hover:bg-accent/30 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 text-left">
            <div className="flex items-start gap-3">
              {/* Timeline indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`size-8 rounded-full flex items-center justify-center ${statusMeta.bgClassName}`}
                >
                  <StatusIcon className={`size-4 ${statusMeta.className}`} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {entry.artifact_path}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-medium ${PROMOTION_HISTORY_STATUS_COLORS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </Badge>
                  {expanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </div>

                {/* Source -> Target */}
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <Badge variant="outline" className="font-normal">
                    {entry.source_repo_key}
                  </Badge>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <Badge variant="secondary" className="font-normal">
                    {entry.target_repo_key}
                  </Badge>
                </div>

                {/* Metadata row */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {entry.promoted_by_username && (
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {entry.promoted_by_username}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(entry.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 ml-11 space-y-3 border-t">
            {/* Rejection reason */}
            {status === "rejected" && entry.rejection_reason && (
              <div className="pt-3">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                  Rejection Reason
                </p>
                <p className="text-sm">{entry.rejection_reason}</p>
              </div>
            )}

            {/* Notes */}
            {entry.notes && (
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Notes
                </p>
                <p className="text-sm">{entry.notes}</p>
              </div>
            )}

            {/* Policy violations */}
            {hasViolations && (
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Policy Violations
                </p>
                <div className="space-y-1">
                  {entry.policy_result?.violations.map(
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
            )}

            {/* CVE/License summary if available */}
            {entry.policy_result?.cve_summary && (
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  CVE Summary
                </p>
                <div className="flex items-center gap-3 text-xs">
                  {entry.policy_result.cve_summary.critical_count > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      <XCircle className="size-3 inline mr-0.5" />
                      {entry.policy_result.cve_summary.critical_count} critical
                    </span>
                  )}
                  {entry.policy_result.cve_summary.high_count > 0 && (
                    <span className="text-orange-600 dark:text-orange-400">
                      {entry.policy_result.cve_summary.high_count} high
                    </span>
                  )}
                  {entry.policy_result.cve_summary.medium_count > 0 && (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {entry.policy_result.cve_summary.medium_count} medium
                    </span>
                  )}
                  {entry.policy_result.cve_summary.low_count > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {entry.policy_result.cve_summary.low_count} low
                    </span>
                  )}
                </div>
              </div>
            )}

            {entry.policy_result?.license_summary && (
              <div className="pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  License Summary
                </p>
                <div className="text-xs">
                  {entry.policy_result.license_summary.denied_licenses.length > 0 && (
                    <p className="text-red-600 dark:text-red-400">
                      Denied: {entry.policy_result.license_summary.denied_licenses.join(", ")}
                    </p>
                  )}
                  {entry.policy_result.license_summary.licenses_found.length > 0 && (
                    <p className="text-muted-foreground">
                      Found: {entry.policy_result.license_summary.licenses_found.slice(0, 5).join(", ")}
                      {entry.policy_result.license_summary.licenses_found.length > 5 && " ..."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
