"use client";

import { useState, useMemo, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor?: (row: T) => unknown;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

type SortDir = "asc" | "desc";

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Total items for server-side pagination */
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  loading = false,
  emptyMessage = "No data found.",
  onRowClick,
  rowKey,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (colId: string) => {
      if (sortColumn === colId) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colId);
        setSortDir("asc");
      }
    },
    [sortColumn]
  );

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const col = columns.find((c) => c.id === sortColumn);
    if (!col || !col.accessor) return data;
    const accessor = col.accessor;
    return [...data].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [data, sortColumn, sortDir, columns]);

  const totalItems = total ?? data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.id} className={col.headerClassName}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.id}>
                      <Skeleton className="h-4 w-full max-w-[200px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} className={col.headerClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} className={col.headerClassName}>
                  {col.sortable ? (
                    <button
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded-md hover:bg-accent"
                      onClick={() => handleSort(col.id)}
                    >
                      {col.header}
                      {sortColumn === col.id ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, i) => (
              <TableRow
                key={rowKey ? rowKey(row) : i}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.id} className={col.className}>
                    {col.cell
                      ? col.cell(row)
                      : col.accessor
                        ? String(col.accessor(row) ?? "")
                        : null}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {(onPageChange || onPageSizeChange) && (
        <div className="flex items-center justify-between">
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
              {totalItems > 0
                ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalItems)} of ${totalItems}`
                : "0 results"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
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
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
