import { StatusBadge } from "@/components/common/status-badge";
import type { McpSourceKind } from "@/lib/mcp/server-json";

/**
 * Where an entry came from. The text comes from the server-side enum
 * (`sourceKind`), never from publisher fields, so a publisher cannot label
 * its own server "verified".
 */
const SOURCE: Record<McpSourceKind, { label: string; color: "green" | "blue" | "yellow"; title: string }> = {
  hosted: { label: "hosted", color: "green", title: "Published to this Artifact Keeper instance" },
  "upstream-verified": {
    label: "proxied, upstream verified",
    color: "blue",
    title: "Proxied from an upstream registry that marked it official",
  },
  unverified: {
    label: "unverified",
    color: "yellow",
    title: "Proxied from an upstream registry that did not mark it official",
  },
};

export function McpSourceBadge({ kind }: { kind: McpSourceKind }) {
  const s = SOURCE[kind] ?? SOURCE.unverified;
  return (
    <span title={s.title}>
      <StatusBadge status={s.label} color={s.color} className="normal-case" />
    </span>
  );
}
