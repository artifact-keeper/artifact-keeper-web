// Stub for H1's McpServerJsonViewer (replaced by the owner's version at merge).
export function McpServerJsonViewer({ value, label }: { value: unknown; label?: string }) {
  return <pre aria-label={label ?? "server.json"}>{JSON.stringify(value)}</pre>;
}
