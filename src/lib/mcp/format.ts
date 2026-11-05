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

/**
 * The registry's soft delete, the only delete an MCP repository accepts
 * (artifact-keeper#5257): the generic
 * `DELETE /api/v1/repositories/{key}/artifacts/{path}` answers `400` for
 * every `mcp` repository, administrators included.
 */
export const MCP_SOFT_DELETE_ROUTE =
  "DELETE /mcp/{repository}/v0.1/servers/{serverName}/versions/{version}" as const;

/** Why an MCP repository's artifacts offer no generic Delete. */
export const MCP_GENERIC_DELETE_REASON =
  "MCP server versions are not deleted as artifacts. Delete a version from its server page " +
  "(Servers tab): a soft delete through the MCP registry, " +
  `${MCP_SOFT_DELETE_ROUTE}.`;

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
 * Whether the backend accepts Remote/Virtual MCP repositories. The handler's
 * `repository_types` (`GET /api/v1/formats`) says which types it can be
 * created as; a handler that predates the field is believed through
 * `capabilities.repo_types` when present, else every type is offered (the
 * backend accepts all four).
 */
export function mcpRepoTypeSupport(handlers: FormatHandler[] | undefined | null): McpRepoTypeSupport {
  const handler = (handlers ?? []).find((h) => h.format_key === MCP_FORMAT);
  const types = handler?.repository_types ?? handler?.capabilities?.["repo_types"];
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

/**
 * The server version a stored MCP artifact belongs to. One version is one
 * artifact at `servers/<name>/<version>/server.json`; an MCPB bundle sits at
 * `servers/<name>/<version>/bundles/<file>`. A server name has at most one
 * `/` (`com.acme/echo`). `null` for any other path.
 */
export function mcpServerVersionFromArtifactPath(
  path: string | null | undefined,
): { name: string; version: string } | null {
  const segs = (path ?? "").replace(/^\/+/, "").split("/");
  if (segs[0] !== "servers") return null;
  let rest = segs.slice(1);
  if (rest.length >= 2 && rest[rest.length - 2] === "bundles") rest = rest.slice(0, -2);
  else if (rest[rest.length - 1] === "server.json") rest = rest.slice(0, -1);
  else return null;
  if (rest.length < 2 || rest.length > 3 || rest.some((s) => !s)) return null;
  return { name: rest.slice(0, -1).join("/"), version: rest[rest.length - 1] };
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
 * Glob match used for deny / auto-approve lists, exactly as the backend's
 * `glob_matches` (services/mcp_settings.rs) evaluates it: `*` matches any run
 * of characters including `/`, every other character is literal (there is
 * no `?` wildcard), and the comparison is ASCII case-insensitive so
 * `Com.Evil/x` cannot dodge `com.evil/*`. Anchored on the full server name.
 * Like the backend it does not trim: the backend stores globs trimmed, so a
 * caller previewing typed input trims it first.
 */
export function mcpGlobMatches(glob: string, name: string): boolean {
  // ASCII-only folding, like `eq_ignore_ascii_case`: a non-ASCII letter
  // must match exactly.
  const fold = (v: string) => v.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const pattern = fold(glob)
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

/**
 * Client-side check of a namespace-grant pattern
 * (`conditions.mcp_namespaces`), with the backend's rules: 1 to 200
 * characters of letters, digits, `.`, `_`, `-`, `*`, at most one `/`, and
 * `{claim}` placeholders naming a CI OIDC claim (lowercase letters, digits,
 * `_`). A pattern without `/` means the namespace's servers (`com.acme` =
 * `com.acme/*`). The backend re-validates.
 */
export function validateNamespacePattern(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return "Enter a namespace or pattern";
  if (p.length > 200) return "At most 200 characters";
  if ((p.match(/\//g) ?? []).length > 1) return "At most one slash";
  const rest = p.replace(/\{([^{}]*)\}/g, (_m, claim: string) => (/^[a-z0-9_]+$/.test(claim) ? "" : "\u0000"));
  if (rest.includes("\u0000")) return "A {claim} is lowercase letters, digits and underscores";
  if (/[{}]/.test(rest)) return "Unbalanced { }";
  if (!/^[A-Za-z0-9._\-*/]*$/.test(rest)) return "Use letters, digits, dots, hyphens, underscores, *, / and {claim} only";
  return null;
}
