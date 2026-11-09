import { z } from "zod";
import { isSafeUrl } from "@/lib/utils";
import {
  MCP_AK_RESOLVED_META_KEY,
  MCP_AK_SOURCE_META_KEY,
  MCP_OFFICIAL_META_KEY,
  type McpAkSourceMeta,
  type McpInput,
  type McpOfficialMeta,
  type McpPackage,
  type McpResolvedMeta,
  type McpServedEntry,
  type McpServerJson,
  type McpStoredMetadata,
  type McpTransport,
} from "@/types/mcp";

/**
 * Tolerant parsing of `server.json` and registry envelopes
 * (artifact-keeper#5253). The backend already validates strictly on publish;
 * the UI's job is to never crash on a document it does not fully understand
 * (an older schema, an upstream entry in Phase 2, a field added later), so
 * every object passes unknown keys through and only the fields the UI reads
 * are typed.
 */

const InputSchema: z.ZodType<McpInput> = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      name: z.string().optional(),
      valueHint: z.string().optional(),
      isRepeated: z.boolean().optional(),
      description: z.string().optional(),
      isRequired: z.boolean().optional(),
      format: z.string().optional(),
      value: z.string().optional(),
      isSecret: z.boolean().optional(),
      default: z.string().optional(),
      placeholder: z.string().optional(),
      choices: z.array(z.string()).optional(),
      variables: z.record(z.string(), InputSchema).optional(),
    })
    .passthrough(),
);

const TransportSchema = z
  .object({
    type: z.string(),
    url: z.string().optional(),
    headers: z.array(InputSchema).optional(),
    variables: z.record(z.string(), InputSchema).optional(),
  })
  .passthrough();

const PackageSchema = z
  .object({
    registryType: z.string(),
    registryBaseUrl: z.string().optional(),
    identifier: z.string(),
    version: z.string().optional(),
    fileSha256: z.string().optional(),
    runtimeHint: z.string().optional(),
    transport: TransportSchema,
    runtimeArguments: z.array(InputSchema).optional(),
    packageArguments: z.array(InputSchema).optional(),
    environmentVariables: z.array(InputSchema).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const ServerJsonSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().min(1),
    description: z.string().default(""),
    title: z.string().optional(),
    version: z.string().min(1),
    websiteUrl: z.string().optional(),
    repository: z
      .object({
        url: z.string(),
        source: z.string(),
        id: z.string().optional(),
        subfolder: z.string().optional(),
      })
      .passthrough()
      .optional(),
    icons: z
      .array(
        z
          .object({
            src: z.string(),
            mimeType: z.string().optional(),
            sizes: z.array(z.string()).optional(),
            theme: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    packages: z.array(PackageSchema).optional(),
    remotes: z.array(TransportSchema).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const EntrySchema = z
  .object({
    server: ServerJsonSchema,
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const ListSchema = z
  .object({
    servers: z.array(z.unknown()),
    metadata: z
      .object({ nextCursor: z.string().optional(), count: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Parse one server.json document; `null` when it is not one. */
export function parseServerJson(raw: unknown): McpServerJson | null {
  const r = ServerJsonSchema.safeParse(raw);
  return r.success ? (r.data as McpServerJson) : null;
}

/** Parse one `{server, _meta}` entry; `null` when malformed. */
export function parseServedEntry(raw: unknown): McpServedEntry | null {
  const r = EntrySchema.safeParse(raw);
  return r.success ? (r.data as McpServedEntry) : null;
}

/**
 * Parse a `/servers` or `/versions` envelope. Malformed entries are dropped
 * (and counted) rather than failing the page: one bad upstream document must
 * not blank the gallery.
 */
export function parseServerList(raw: unknown): {
  servers: McpServedEntry[];
  nextCursor?: string;
  count: number;
  dropped: number;
} {
  const r = ListSchema.safeParse(raw);
  if (!r.success) return { servers: [], count: 0, dropped: 0 };
  const servers: McpServedEntry[] = [];
  let dropped = 0;
  for (const e of r.data.servers) {
    const parsed = parseServedEntry(e);
    if (parsed) servers.push(parsed);
    else dropped += 1;
  }
  return {
    servers,
    nextCursor: r.data.metadata?.nextCursor,
    count: r.data.metadata?.count ?? servers.length,
    dropped,
  };
}

/** Parse a stored metadata document (`artifact_metadata.metadata`). */
export function parseStoredMetadata(raw: unknown): McpStoredMetadata | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const server = parseServerJson(r.server);
  if (!server) return null;
  const registry = (r.registry ?? {}) as McpOfficialMeta;
  return {
    schema: typeof r.schema === "string" ? r.schema : undefined,
    server,
    registry: { ...registry, status: registry.status ?? "active" },
    policy: (r.policy as McpStoredMetadata["policy"]) ?? undefined,
    packages: Array.isArray(r.packages) ? (r.packages as McpStoredMetadata["packages"]) : [],
    index: (r.index as McpStoredMetadata["index"]) ?? undefined,
    bundles: Array.isArray(r.bundles) ? (r.bundles as McpStoredMetadata["bundles"]) : [],
    resolution:
      r.resolution && typeof r.resolution === "object" ? (r.resolution as McpStoredMetadata["resolution"]) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

function metaObject(meta: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const v = meta?.[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** The official registry meta of an entry (status, isLatest, dates). */
export function officialMeta(entry: McpServedEntry): McpOfficialMeta | undefined {
  const m = metaObject(entry._meta, MCP_OFFICIAL_META_KEY);
  if (!m) return undefined;
  const status = m.status;
  return {
    ...(m as unknown as McpOfficialMeta),
    status: status === "deprecated" || status === "deleted" ? status : "active",
  };
}

/** AK's source meta of an entry (repository, artifact id, policy, origin). */
export function akSourceMeta(entry: McpServedEntry): McpAkSourceMeta | undefined {
  return metaObject(entry._meta, MCP_AK_SOURCE_META_KEY) as McpAkSourceMeta | undefined;
}

/** AK's resolved-pin meta on a served package (OCI). */
export function resolvedMeta(pkg: McpPackage): McpResolvedMeta | undefined {
  return metaObject(pkg._meta, MCP_AK_RESOLVED_META_KEY) as McpResolvedMeta | undefined;
}

/**
 * Source badge kind, from the server-side `origin` and `upstreamVerified` of
 * `_meta["com.artifactkeeper.registry/source"]` only, never from publisher
 * fields (issue section 6): `hosted` for a publish to this instance,
 * `remote` / `mirror` for a version a Remote ingested (allowlist or mirror
 * mode), `-verified` when the backend vouches that the bytes are the official
 * registry's (or another Artifact Keeper's) and have not drifted.
 * A source block without `origin` comes from a backend that predates
 * Remotes, where every version is hosted; `unknown` when there is no source
 * block at all.
 */
export type McpSourceKind = "hosted" | "remote" | "remote-verified" | "mirror" | "mirror-verified" | "unknown";

export function sourceKindOf(origin: unknown, upstreamVerified: unknown): McpSourceKind {
  if (origin === "hosted") return "hosted";
  if (origin === "remote" || origin === "mirror") return upstreamVerified === true ? `${origin}-verified` : origin;
  return "unknown";
}

export function sourceKind(entry: McpServedEntry): McpSourceKind {
  const src = akSourceMeta(entry);
  if (!src) return "unknown";
  return sourceKindOf(src.origin ?? "hosted", src.upstreamVerified);
}

/** Whether a source kind is an ingested upstream version the backend does not vouch for. */
export function isUnverifiedSource(kind: McpSourceKind | undefined): boolean {
  return kind === "remote" || kind === "mirror";
}

export interface McpTransportChip {
  /** Stable key, e.g. `stdio:npm` or `remote:streamable-http`. */
  key: string;
  /** Visible text, e.g. `stdio·npm` or `http`. */
  label: string;
  kind: "package" | "remote";
  /** Runs code on the user's machine. */
  local: boolean;
}

function transportLabel(t: string): string {
  if (t === "streamable-http") return "http";
  return t;
}

/** Deduplicated transport chips for a server (`stdio·npm`, `http`, `sse`). */
export function transportsOf(server: McpServerJson): McpTransportChip[] {
  const out = new Map<string, McpTransportChip>();
  for (const p of server.packages ?? []) {
    const t = p.transport?.type ?? "stdio";
    const key = `${t}:${p.registryType}`;
    if (!out.has(key)) {
      out.set(key, {
        key,
        label: t === "stdio" ? `stdio·${p.registryType}` : `${transportLabel(t)}·${p.registryType}`,
        kind: "package",
        local: true,
      });
    }
  }
  for (const r of server.remotes ?? []) {
    const key = `remote:${r.type}`;
    if (!out.has(key)) out.set(key, { key, label: transportLabel(r.type), kind: "remote", local: false });
  }
  return [...out.values()];
}

/** Every input of a package that the user must supply a value for. */
export function inputsOf(pkg: McpPackage): McpInput[] {
  return [
    ...(pkg.environmentVariables ?? []),
    ...(pkg.runtimeArguments ?? []),
    ...(pkg.packageArguments ?? []),
    ...(pkg.transport?.headers ?? []),
  ];
}

/** Distinct secret names (env vars and headers flagged `isSecret`). */
export function secretsOf(server: McpServerJson): string[] {
  const names = new Set<string>();
  const add = (i: McpInput) => {
    if (i.isSecret && i.name) names.add(i.name);
  };
  for (const p of server.packages ?? []) inputsOf(p).forEach(add);
  for (const r of server.remotes ?? []) (r.headers ?? []).forEach(add);
  return [...names];
}

/** A way to run a server: one package or one remote. */
export type McpRunner =
  | { kind: "package"; index: number; pkg: McpPackage; id: string }
  | { kind: "remote"; index: number; remote: McpTransport; id: string };

export function runnersOf(server: McpServerJson): McpRunner[] {
  return [
    ...(server.packages ?? []).map(
      (pkg, index): McpRunner => ({ kind: "package", index, pkg, id: `package-${index}` }),
    ),
    ...(server.remotes ?? []).map(
      (remote, index): McpRunner => ({ kind: "remote", index, remote, id: `remote-${index}` }),
    ),
  ];
}

/** A short label for a runner, e.g. `npm @acme/weather-mcp (stdio)`. */
export function runnerLabel(r: McpRunner): string {
  if (r.kind === "package") {
    return `${r.pkg.registryType} ${r.pkg.identifier} (${r.pkg.transport?.type ?? "stdio"})`;
  }
  return `remote ${r.remote.type} ${r.remote.url ?? ""}`.trim();
}

/** Only absolute http(s) URLs are ever linked; everything else is text. */
export function isSafeHttpUrl(url: string | undefined | null): url is string {
  return typeof url === "string" && isSafeUrl(url);
}

/** Last path segment of the name, for the monogram avatar. */
export function monogramOf(name: string): string {
  const short = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
  const ch = short.replace(/[^a-zA-Z0-9]/g, "").charAt(0);
  return (ch || "?").toUpperCase();
}

/**
 * The alias a client config keys the server by: the short name, lowercased,
 * restricted to `[a-z0-9_-]` (what every client accepts as a key).
 */
export function serverAlias(name: string): string {
  const short = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
  const alias = short.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return alias || "mcp-server";
}

/** Whether a version string is pinned (not `latest`, not a range). */
export function isPinnedVersion(v: string | undefined | null): boolean {
  if (!v) return false;
  if (v === "latest") return false;
  // The schema's range markers (`^ ~ * > < space ||`) and `x` wildcards.
  if (/[\^~*><\s|]/.test(v)) return false;
  return !/(^|\.)[xX](\.|$)/.test(v);
}
