"use client";

import { Download } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { isSafeHttpUrl } from "@/lib/mcp/server-json";
import { StatusBadge } from "@/components/common/status-badge";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import type { McpBundle } from "@/types/mcp";

/**
 * An MCPB bundle a server version pins: the facts the upload recorded
 * (`metadata.bundles[]`: file, size, signature) and the served `identifier`,
 * which is the bundle's Artifact Keeper URL (`.../bundles/<file>.mcpb`; on an
 * exact read by a signed-in caller it carries a single-use ticket). The URL is
 * used as given, only when it is http(s), and never shown as text.
 */

const SIGNATURE: Record<string, { label: string; color: "green" | "red" | "default" }> = {
  valid: { label: "signature valid", color: "green" },
  invalid: { label: "signature invalid", color: "red" },
  unsigned: { label: "unsigned", color: "default" },
};

export function McpBundlePanel({ bundle, downloadUrl }: { bundle?: McpBundle; downloadUrl?: string }) {
  const href = downloadUrl && isSafeHttpUrl(downloadUrl) ? downloadUrl : null;
  if (!bundle && !href) return null;
  const state = bundle?.signature?.state ?? "unsigned";
  const sig = SIGNATURE[state] ?? { label: `signature ${state}`, color: "default" as const };
  const signer = bundle?.signature?.signer;
  return (
    <section aria-label="MCP bundle" className="rounded-md border p-3 space-y-1 text-sm" data-testid="mcp-bundle">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{bundle?.file ?? "bundle.mcpb"}</span>
        {typeof bundle?.size === "number" && <span className="text-muted-foreground">{formatBytes(bundle.size)}</span>}
        {bundle && <StatusBadge status={sig.label} color={sig.color} className="normal-case" />}
        {signer && (
          <span className="text-xs text-muted-foreground">
            signed by {signer}
            {bundle?.signature?.selfSigned ? " (self-signed)" : ""}
          </span>
        )}
      </div>
      {bundle?.fileSha256 && (
        <div className="flex items-center gap-1">
          <code className="font-mono text-xs break-all">sha256:{bundle.fileSha256}</code>
          <CopyButton value={bundle.fileSha256} label="Copy sha256" />
        </div>
      )}
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
