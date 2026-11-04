// Stub for H1's McpSourceBadge (replaced by the owner's version at merge).
import type { McpSourceKind } from "@/lib/mcp/server-json";

export function McpSourceBadge({ kind }: { kind: McpSourceKind }) {
  return <span>{kind}</span>;
}
