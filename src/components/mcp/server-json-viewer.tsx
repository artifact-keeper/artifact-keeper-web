/**
 * Raw JSON, collapsed by default. Rendered as text inside `<pre>`, so a
 * publisher-controlled string can never become markup.
 */
export function McpServerJsonViewer({ value, label = "server.json" }: { value: unknown; label?: string }) {
  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">Raw {label}</summary>
      <pre aria-label={`Raw ${label}`} className="max-h-[32rem] overflow-auto border-t bg-muted p-3 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
