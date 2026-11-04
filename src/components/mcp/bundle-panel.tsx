"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { mcpApi } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { formatBytes } from "@/lib/utils";
import { isSafeHttpUrl } from "@/lib/mcp/server-json";
import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";

/**
 * MCPB bundle stored for a server version (Phase 3). Renders nothing on a
 * backend that does not serve bundles. The download URL is a short-lived
 * ticket the backend mints, so it is used as given and never shown as text.
 */

const SIGNATURE_COLOR: Record<string, "green" | "red" | "default"> = {
  verified: "green",
  invalid: "red",
};

export function McpBundlePanel({ repoKey, name, version }: { repoKey: string; name: string; version: string }) {
  const { data } = useQuery({
    queryKey: mcpKeys.bundle(repoKey, name, version),
    queryFn: () => mcpApi.bundle(repoKey, name, version),
  });
  if (!data) return null;
  const sig = data.signature_state ?? "none";
  const url = data.download_url;
  const href = url && ((url.startsWith("/") && !url.startsWith("//")) || isSafeHttpUrl(url)) ? url : null;
  return (
    <section aria-label="MCP bundle" className="rounded-md border p-3 space-y-1 text-sm" data-testid="mcp-bundle">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{data.file_name ?? `${data.name}-${data.version}.mcpb`}</span>
        {typeof data.size_bytes === "number" && <span className="text-muted-foreground">{formatBytes(data.size_bytes)}</span>}
        <StatusBadge status={sig === "none" ? "unsigned" : `signature ${sig}`} color={SIGNATURE_COLOR[sig] ?? "default"} className="normal-case" />
      </div>
      <div className="flex items-center gap-1">
        <code className="font-mono text-xs break-all">sha256:{data.sha256}</code>
        <CopyButton value={data.sha256} label="Copy sha256" />
      </div>
      {href && (
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={href} download>
            <Download className="size-3.5" aria-hidden="true" />
            Download bundle
          </a>
        </Button>
      )}
    </section>
  );
}
