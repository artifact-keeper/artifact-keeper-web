import { cn } from "@/lib/utils";

interface ListTruncationNoticeProps {
  /** Number of items currently rendered. */
  shown: number;
  /** Total number of items reported by the server. */
  total: number;
  className?: string;
}

/**
 * Surfaces silent truncation on lists that fetch a capped page
 * (e.g. `per_page: 100`) without pagination. Renders nothing when the
 * server-reported total fits within the fetched items.
 */
export function ListTruncationNotice({
  shown,
  total,
  className,
}: ListTruncationNoticeProps) {
  if (total <= shown) return null;
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      Showing first {shown} of {total} — refine your search or filters to
      narrow results.
    </p>
  );
}
