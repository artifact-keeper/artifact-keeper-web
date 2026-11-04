// Stub for H1's McpStatusBadge (replaced by the owner's version at merge).
import type { McpServerStatus } from "@/types/mcp";

export function McpStatusBadge({ status }: { status: McpServerStatus | "held" }) {
  return <span>{status}</span>;
}
