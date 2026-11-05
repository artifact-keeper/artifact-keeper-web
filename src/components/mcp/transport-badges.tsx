import { Badge } from "@/components/ui/badge";
import { transportsOf } from "@/lib/mcp/server-json";
import type { McpServerJson } from "@/types/mcp";

/** One chip per distinct transport (`stdio·npm`, `http`, `sse`). */
export function McpTransportBadges({ server }: { server: McpServerJson }) {
  const chips = transportsOf(server);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Transports" className="flex flex-wrap gap-1">
      {chips.map((c) => {
        const title = c.local
          ? `Runs locally (${c.label})`
          : `Remote ${c.label} endpoint`;
        return (
          <li key={c.key}>
            <Badge variant="outline" className="font-mono text-[11px] font-normal" title={title}>
              {c.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
