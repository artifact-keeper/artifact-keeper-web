import { StatusBadge } from "@/components/common/status-badge";
import type { McpSourceKind } from "@/lib/mcp/server-json";

/**
 * Where an entry came from. The text comes from the server-side
 * `_meta["com.artifactkeeper.registry/source"]` (`origin`,
 * `upstreamVerified`, via `sourceKind`), never from publisher fields, so a
 * publisher cannot label its own server "verified".
 */
const SOURCE: Record<McpSourceKind, { label: string; color: "green" | "blue" | "yellow" | "default"; title: string }> = {
  hosted: { label: "hosted", color: "green", title: "Published to this Artifact Keeper instance" },
  "remote-verified": {
    label: "proxied, upstream verified",
    color: "blue",
    title: "Approved from an upstream registry; its bytes match what the official registry served and have not changed",
  },
  remote: {
    label: "proxied",
    color: "yellow",
    title: "Approved from an upstream registry that Artifact Keeper cannot vouch for",
  },
  "mirror-verified": {
    label: "mirrored, upstream verified",
    color: "blue",
    title: "Mirrored from an upstream registry; its bytes match what the official registry served and have not changed",
  },
  mirror: {
    label: "mirrored",
    color: "yellow",
    title: "Mirrored from an upstream registry that Artifact Keeper cannot vouch for",
  },
  unknown: { label: "source unknown", color: "default", title: "The registry did not say where this version comes from" },
};

export function McpSourceBadge({
  kind,
  upstreamUrl,
  virtualRepository,
  memberRepository,
}: {
  kind: McpSourceKind;
  /** The Remote's upstream, shown in the tooltip of an ingested version. */
  upstreamUrl?: string;
  /** Set when a Virtual served the entry from `memberRepository`. */
  virtualRepository?: string;
  memberRepository?: string;
}) {
  const s = SOURCE[kind] ?? SOURCE.unknown;
  const title = [
    s.title,
    upstreamUrl && kind !== "hosted" ? `Upstream: ${upstreamUrl}` : null,
    virtualRepository && memberRepository ? `Served by ${virtualRepository} from member ${memberRepository}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <span title={title}>
      <StatusBadge status={s.label} color={s.color} className="normal-case" />
    </span>
  );
}
