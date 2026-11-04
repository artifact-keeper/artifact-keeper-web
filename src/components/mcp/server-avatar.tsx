// Stub for H1's McpServerAvatar (replaced by the owner's version at merge).
import { monogramOf } from "@/lib/mcp/server-json";

export function McpServerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={className}>
      {monogramOf(name)}
    </span>
  );
}
