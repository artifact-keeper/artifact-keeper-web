// Stub for H1's install panel (replaced by the owner's version at merge).
import type { McpServedEntry } from "@/types/mcp";

export interface McpInstallPanelProps {
  repoKey: string;
  entry: McpServedEntry;
  versions?: McpServedEntry[];
  onVersionChange?: (version: string) => void;
}

export function McpInstallPanel(props: McpInstallPanelProps) {
  return <div data-testid="install-panel">{props.entry.server.name}</div>;
}

export function McpInstallSheet({
  open,
  entry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  repoKey: string;
  entry: McpServedEntry | null;
}) {
  return open && entry ? <div>{entry.server.name}</div> : null;
}
