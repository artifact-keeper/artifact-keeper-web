import { resolvedMeta } from "@/lib/mcp/server-json";
import type {
  McpHealth,
  McpPackage,
  McpPackagePin,
  McpPackagePolicy,
  McpServerJson,
} from "@/types/mcp";

/**
 * Join of a server version's `packages[i]` with what Artifact Keeper pinned
 * for it (`pins[index === i]`) and the served coordinates, shared by the
 * Packages & Remotes tab, the lineage graph and the Security tab so the three
 * agree on which repository backs a package.
 *
 * Only server-side state names a backing repository: the stored pin, the
 * OCI `_meta["com.artifactkeeper/resolved"]`, or a `registryBaseUrl` the
 * backend rewrote under `own-repos`. Under the `open` policy the URL is the
 * publisher's own and is never read as an AK repository.
 */
export interface McpPackageLink {
  index: number;
  pkg: McpPackage;
  pin?: McpPackagePin;
  /** Backing repository key, `null` when not mirrored. */
  repository: string | null;
  artifactIds: string[];
  digest?: string;
  children: { platform: string; digest: string }[];
  /** `npm:@acme/db-tool@2.0.0`, the coordinate hold bodies and health use. */
  coordinate: string;
  /** Pinned in this instance (the package resolves through AK and is gated). */
  mirrored: boolean;
  /** The pinned tag moved since publish. */
  drift: boolean;
}

export type McpHealthPackage = McpHealth["packages"][number];

const BASE_URL_REPO = /\/(?:npm|pypi|nuget|cargo)\/([^/?#]+)/;

/** `https://ak/npm/npm-local` -> `npm-local`. */
export function backingRepoFromBaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const m = new URL(url).pathname.match(BASE_URL_REPO);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function packageCoordinate(pkg: McpPackage, pin?: McpPackagePin): string {
  const identifier = pin?.submitted.identifier ?? resolvedMeta(pkg)?.submittedIdentifier ?? pkg.identifier;
  const version = pin?.submitted.version ?? pkg.version;
  return `${pkg.registryType}:${identifier}${version ? `@${version}` : ""}`;
}

export function packageLinks(
  server: McpServerJson,
  pins: McpPackagePin[] | undefined,
  policy: McpPackagePolicy | undefined,
): McpPackageLink[] {
  const open = policy === "open";
  return (server.packages ?? []).map((pkg, index) => {
    const pin = open ? undefined : pins?.find((p) => p.index === index);
    const resolved = open ? undefined : resolvedMeta(pkg);
    const repository = open
      ? null
      : (pin?.resolved.repository ?? resolved?.backingRepository ?? backingRepoFromBaseUrl(pkg.registryBaseUrl));
    return {
      index,
      pkg,
      pin,
      repository,
      artifactIds: pin?.resolved.artifactIds ?? [],
      digest: pin?.resolved.digest ?? resolved?.digest,
      children: pin?.resolved.children ?? resolved?.children ?? [],
      coordinate: packageCoordinate(pkg, pin),
      mirrored: repository !== null,
      drift: !!pin?.drift,
    };
  });
}

/** The health row of a package: by coordinate, artifact id, then identifier. */
export function healthFor(link: McpPackageLink, health: McpHealth | null | undefined): McpHealthPackage | undefined {
  const rows = health?.packages ?? [];
  return (
    rows.find((r) => r.package === link.coordinate) ??
    rows.find((r) => !!r.artifact_id && link.artifactIds.includes(r.artifact_id)) ??
    rows.find((r) => r.package === link.pkg.identifier || r.package.startsWith(`${link.pkg.registryType}:${link.pkg.identifier}`))
  );
}

/** Repository detail link, optionally on a tab. */
export function repoHref(key: string, tab?: "artifacts" | "packages" | "security"): string {
  const base = `/repositories/${encodeURIComponent(key)}`;
  return tab ? `${base}?tab=${tab}` : base;
}

/** Where a not-mirrored package comes from, for the amber note. */
export function upstreamOf(pkg: McpPackage): string {
  if (pkg.registryBaseUrl) {
    try {
      return new URL(pkg.registryBaseUrl).host;
    } catch {
      return pkg.registryBaseUrl;
    }
  }
  return `the ${pkg.registryType} registry`;
}

/** Short digest for display (`sha256:9f3c…`). */
export function shortDigest(d: string | undefined): string {
  if (!d) return "";
  const [algo, hex] = d.includes(":") ? d.split(":", 2) : ["", d];
  return `${algo ? `${algo}:` : ""}${hex.slice(0, 12)}`;
}
