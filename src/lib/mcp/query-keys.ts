/**
 * TanStack Query keys for the MCP registry surfaces (artifact-keeper#5253).
 * Kept apart from `src/lib/query-keys.ts` so tests that mock that module do
 * not lose these. Every key starts with `"mcp"`, so invalidating `["mcp"]`
 * refreshes every MCP view after an approve/block/publish.
 */
export const mcpKeys = {
  all: ["mcp"] as const,
  servers: (repoKey: string, params?: unknown) => ["mcp", "servers", repoKey, params ?? {}] as const,
  versions: (repoKey: string, name: string) => ["mcp", "versions", repoKey, name] as const,
  version: (repoKey: string, name: string, version: string) => ["mcp", "version", repoKey, name, version] as const,
  stored: (repoKey: string, name: string, version: string) => ["mcp", "stored", repoKey, name, version] as const,
  reviews: (repoKey: string, status?: string) => ["mcp", "reviews", repoKey, status ?? "all"] as const,
  upstream: (repoKey: string, params?: unknown) => ["mcp", "upstream", repoKey, params ?? {}] as const,
  holds: (repoKey: string, params?: unknown) => ["mcp", "holds", repoKey, params ?? {}] as const,
  pendingCount: ["mcp", "pending-count"] as const,
  capabilities: (repoKey: string, name: string, version: string) =>
    ["mcp", "capabilities", repoKey, name, version] as const,
  health: (repoKey: string, name: string, version: string) => ["mcp", "health", repoKey, name, version] as const,
  bundle: (repoKey: string, name: string, version: string) => ["mcp", "bundle", repoKey, name, version] as const,
  grants: (repoKey: string) => ["mcp", "grants", repoKey] as const,
  catalog: (params?: unknown) => ["mcp", "catalog", params ?? {}] as const,
};
