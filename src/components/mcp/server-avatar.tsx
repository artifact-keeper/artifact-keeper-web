import { monogramOf } from "@/lib/mcp/server-json";
import { cn } from "@/lib/utils";

/**
 * Monogram avatar for a server. Publisher icons (`server.json` `icons[]`)
 * are remote URLs the publisher controls, so they are never loaded here
 * (no `<img>`): the CSP review for remote icons is a later phase. The
 * monogram is decoration next to the visible name, hence `aria-hidden`.
 */
export function McpServerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="mcp-server-avatar"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-semibold text-primary",
        className,
      )}
    >
      {monogramOf(name)}
    </span>
  );
}
