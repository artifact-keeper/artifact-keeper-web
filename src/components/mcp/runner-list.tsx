// Stub for H1's McpRunnerList (replaced by the owner's version at merge).
import type { McpPackagePin, McpServerJson } from "@/types/mcp";

export function McpRunnerList({
  server,
}: {
  server: McpServerJson;
  pins?: McpPackagePin[];
  repoKey: string;
}) {
  return <div data-testid="runner-list">{server.name}</div>;
}
