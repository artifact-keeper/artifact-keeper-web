// Stub for H1's McpTransportBadges (replaced by the owner's version at merge).
import type { McpServerJson } from "@/types/mcp";

export function McpTransportBadges({ server }: { server: McpServerJson }) {
  return <span data-testid="transport-badges">{server.name}</span>;
}
