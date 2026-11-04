import type { Repository } from "@/types";
import type { FormatHandler } from "@/lib/api/format-handlers";
import type { McpRegistryType } from "@/types/mcp";

/**
 * Format-gating predicates for the MCP registry (artifact-keeper#5253), in
 * the style of `repo-tabs.ts` / `signing-formats.ts`: pure, no React, so the
 * create dialog, settings tab, curation page and sidebar agree.
 */

export const MCP_FORMAT = "mcp" as const;

/** Mount prefix of the registry API on the backend (and proxied by the UI). */
export const MCP_ROUTE_PREFIX = "/mcp" as const;

/** The registry API version AK serves first; `/v0` is an alias. */
export const MCP_API_VERSION = "v0.1" as const;

/** Upstream default for a Remote MCP repository (Phase 2). */
export const MCP_OFFICIAL_REGISTRY_URL = "https://registry.modelcontextprotocol.io";

/** Namespace pre-ticked by the Remote creation wizard (section 8, Phase 2). */
export const MCP_OFFICIAL_NAMESPACE_GLOB = "io.github.modelcontextprotocol/*";

/** Reserved namespaces the backend refuses on hosted repositories. */
export const MCP_RESERVED_NAMESPACE_PREFIXES = ["io.modelcontextprotocol"] as const;

export function isMcpFormat(format: string | null | undefined): boolean {
  return format === MCP_FORMAT;
}

/** The repository types the backend accepts for `mcp` repositories. */
export type McpRepoTypeSupport = {
  /** Local + Staging. */
  hosted: true;
  /** Remote + Virtual. */
  proxy: boolean;
};

/**
 * Whether the backend advertises the `mcp` format at all. `GET
 * /api/v1/formats` lists one handler per format key; a backend that predates
 * #5253 does not list `mcp`, and the UI then hides the format option so a
 * user never picks something the create call refuses. While the list is
 * loading (`undefined`) the option stays hidden too.
 */
export function backendSupportsMcp(handlers: FormatHandler[] | undefined | null): boolean {
  return (handlers ?? []).some((h) => h.format_key === MCP_FORMAT && h.is_enabled !== false);
}

/**
 * Whether the backend accepts Remote/Virtual MCP repositories. The backend
 * accepts all four types and does not advertise them, so every type is
 * offered by default. A handler that does list `capabilities.repo_types` is
 * believed: without `remote` or `virtual` there, only the hosted types are
 * offered.
 */
export function mcpRepoTypeSupport(handlers: FormatHandler[] | undefined | null): McpRepoTypeSupport {
  const handler = (handlers ?? []).find((h) => h.format_key === MCP_FORMAT);
  const types = handler?.capabilities?.["repo_types"];
  if (!Array.isArray(types)) return { hosted: true, proxy: true };
  return { hosted: true, proxy: types.includes("remote") || types.includes("virtual") };
}

/** Repository types offered for `mcp` in the create dialog. */
export function mcpCreatableRepoTypes(support: McpRepoTypeSupport): string[] {
  return support.proxy ? ["local", "staging", "remote", "virtual"] : ["local", "staging"];
}

/** Base URL of a repository's registry API, e.g. `https://ak/mcp/mcp-local`. */
export function mcpRegistryBaseUrl(origin: string, repoKey: string): string {
  return `${origin.replace(/\/+$/, "")}${MCP_ROUTE_PREFIX}/${encodeURIComponent(repoKey)}`;
}

/** Whether a repository is a hosted (publishable) MCP registry. */
export function isHostedMcpRepo(repo: Pick<Repository, "format" | "repo_type">): boolean {
  return isMcpFormat(repo.format) && (repo.repo_type === "local" || repo.repo_type === "staging");
}

/** Whether a repository is a Remote MCP registry (Phase 2 curation). */
export function isRemoteMcpRepo(repo: Pick<Repository, "format" | "repo_type">): boolean {
  return isMcpFormat(repo.format) && repo.repo_type === "remote";
}

/**
 * MCP options section in the create dialog / settings tab. Every repository
 * type has some MCP setting (hosted: namespace allowlist, package policy,
 * backing repositories; Remote: posture, deny, auto-approve, probe), so the
 * predicate is format-only.
 */
export function hasMcpConfig(format: string): boolean {
  return isMcpFormat(format);
}

/**
 * registryType -> repository formats that can back it (as the backend's
 * `mcp_package_repos` validation accepts them).
 */
export const MCP_BACKING_FORMATS: Record<Exclude<McpRegistryType, "mcpb">, readonly string[]> = {
  npm: ["npm", "yarn", "pnpm"],
  pypi: ["pypi", "poetry", "jupyter"],
  nuget: ["nuget", "chocolatey", "powershell"],
  cargo: ["cargo"],
  oci: ["docker", "podman", "oras", "buildx"],
};

/** registryTypes a backing repository can be configured for. */
export const MCP_BACKABLE_REGISTRY_TYPES = Object.keys(MCP_BACKING_FORMATS) as Exclude<
  McpRegistryType,
  "mcpb"
>[];

/** Path of a server version's artifact (`servers/<name>/<version>/server.json`). */
export function mcpArtifactPath(name: string, version: string): string {
  return `servers/${name}/${version}/server.json`;
}

/** Split `com.acme/weather` into namespace and short name. */
export function splitServerName(name: string): { namespace: string; shortName: string } {
  const i = name.indexOf("/");
  if (i < 0) return { namespace: "", shortName: name };
  return { namespace: name.slice(0, i), shortName: name.slice(i + 1) };
}

/**
 * Whether `name` falls under a namespace prefix, as the backend's allowlist
 * matches it: `com.acme` admits `com.acme/x` and `com.acme.team/x`, not
 * `com.acmecorp/x`.
 */
export function namespaceAdmits(prefix: string, name: string): boolean {
  const { namespace } = splitServerName(name);
  const p = prefix.trim();
  if (!p) return false;
  return namespace === p || namespace.startsWith(`${p}.`);
}

/**
 * Glob match used for deny / auto-approve lists, as the backend's
 * `glob_matches` evaluates it: `*` matches any run of characters including
 * `/`, every other character is literal (there is no `?` wildcard), and the
 * comparison is ASCII case-insensitive so `Com.Evil/x` cannot dodge
 * `com.evil/*`. Anchored on the full server name.
 */
export function mcpGlobMatches(glob: string, name: string): boolean {
  const g = glob.trim();
  if (!g) return false;
  // ASCII-only folding, like `eq_ignore_ascii_case`: a non-ASCII letter
  // must match exactly.
  const fold = (v: string) => v.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const pattern = fold(g)
    .split(/\*+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`, "s").test(fold(name));
}

/** Whether a namespace glob is broad enough to warrant a warning (`io.github.*`). */
export function isBroadNamespaceGlob(glob: string): boolean {
  const ns = glob.split("/")[0] ?? "";
  return ns.includes("*") || glob.trim() === "*" || /^io\.github\.\*/.test(glob);
}

/** Client-side validation of a namespace prefix for the allowlist editor. */
export function validateNamespacePrefix(prefix: string): string | null {
  const p = prefix.trim();
  if (!p) return "Enter a namespace";
  if (p.includes("/")) return "A namespace has no slash: enter com.acme, not com.acme/x";
  if (!/^[a-zA-Z0-9.-]+$/.test(p)) return "Use letters, digits, dots and hyphens only";
  if (MCP_RESERVED_NAMESPACE_PREFIXES.some((r) => p === r || p.startsWith(`${r}.`))) {
    return "The io.modelcontextprotocol namespace is reserved";
  }
  return null;
}
