import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("components/common/list-truncation-notice");
  if (total <= shown) return null;
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {t("listTruncationNotice", { shown, total })}
    </p>
  );
}
