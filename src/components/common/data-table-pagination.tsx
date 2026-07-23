"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export interface DataTablePaginationProps {
  /** Total number of items across all pages (server-side total). */
  total: number;
  /** Current 1-based page. */
  page: number;
  /** Number of items per page. */
  pageSize: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Noun used in the "N results" / range label (default: "results"). */
  itemLabel?: string;
}

/**
 * Shared pagination control used by `DataTable` (flat artifact list) and the
 * grouped Maven component view.  Extracted so both surfaces show identical
 * controls and the grouped view gets real pagination (issue #443) without
 * duplicating the markup.
 *
 * Renders nothing when neither `onPageChange` nor `onPageSizeChange` is
 * supplied, matching the previous inline behaviour in `DataTable`.
 */
export function DataTablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "results",
}: DataTablePaginationProps) {
  if (!onPageChange && !onPageSizeChange) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between" data-testid="data-table-pagination">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange?.(Number(v))}
        >
          <SelectTrigger size="sm" className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">
          {total > 0 ? `${rangeStart}-${rangeEnd} of ${total}` : `0 ${itemLabel}`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
