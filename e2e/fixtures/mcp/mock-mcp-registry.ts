import type { Page, Route } from '@playwright/test';
import weather from './weather-npm.json';
import sql from './sql-oci.json';
import remote from './github-remote.json';

/**
 * Network-level stand-in for an MCP registry repository (artifact-keeper#5253).
 *
 * The e2e backend image predates the `mcp` format, so the format list, the
 * repository, its package catalog and its registry API (`/mcp/<key>/v0.1`)
 * are fulfilled here. Everything else still reaches the real backend.
 */

export const MCP_REPO_KEY = 'e2e-mcp-local';

type Entry = { server: { name: string; version: string; description?: string } };

/** Served entries, newest publish last, as the registry lists them. */
export const MCP_ENTRIES: Entry[] = [weather, sql, remote];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const MCP_HANDLER = {
  id: '00000000-0000-4000-8000-0000000000f1',
  format_key: 'mcp',
  display_name: 'MCP Registry',
  description: 'Model Context Protocol server registry',
  extensions: ['.json'],
  handler_type: 'Core',
  is_enabled: true,
  priority: 0,
  plugin_id: null,
  capabilities: null,
  repository_types: ['local', 'staging', 'remote', 'virtual'],
};

const REPOSITORY = {
  id: '00000000-0000-4000-8000-0000000000e1',
  key: MCP_REPO_KEY,
  name: 'E2E MCP Local',
  description: 'Mocked MCP registry',
  format: 'mcp',
  repo_type: 'local',
  is_public: true,
  allow_anonymous_access: false,
  curation_enabled: false,
  curation_default_action: 'allow',
  has_trusted_gpg_key: false,
  promotion_only: false,
  upstream_auth_configured: false,
  versioning_enabled: false,
  storage_used_bytes: 4096,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
  mcp_package_policy: 'own-repos',
  mcp_package_repos: { npm: 'e2e-npm-local', oci: 'e2e-docker-local' },
  mcp_namespace_allow: [],
  mcp_server_deny: [],
  mcp_require_oci_label: false,
  mcp_require_namespace_grant: false,
  mcp_probe_remotes: 'off',
  mcp_probe_remotes_locked: false,
  mcp_sandbox_introspection: 'off',
  mcp_require_bundle_signature: false,
  mcp_caller_can_lock: true,
};

const EMPTY_PAGE = { items: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 } };

export interface MockMcpRegistryOptions {
  /** Entries per `/servers` page, to exercise the cursor. */
  pageSize?: number;
  /** Catalog names with no served version (held for every version). */
  heldNames?: string[];
}

/** Install the routes. Returns the `/servers` request URLs seen, for assertions. */
export async function mockMcpRegistry(page: Page, opts: MockMcpRegistryOptions = {}): Promise<URL[]> {
  const pageSize = opts.pageSize ?? 50;
  const seen: URL[] = [];

  await page.route('**/api/v1/formats', async (route) => {
    let handlers: unknown[] = [];
    try {
      const res = await route.fetch();
      const body = await res.json();
      if (Array.isArray(body)) handlers = body;
    } catch {
      // A backend that cannot answer still gets the MCP handler.
    }
    await json(route, [...handlers.filter((h) => (h as { format_key?: string }).format_key !== 'mcp'), MCP_HANDLER]);
  });

  // Sub-resources first: Playwright tries the most recently added route first.
  // Every other sub-resource of the fake repository answers as the backend
  // does for a resource it has nothing for. A list-shaped body would crash
  // panels that expect an object (the storage panel reads `blob_count`).
  await page.route(`**/api/v1/repositories/${MCP_REPO_KEY}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/(artifacts|packages|members)$/.test(path)) return json(route, EMPTY_PAGE);
    return json(route, { code: 'NOT_FOUND', message: 'Not found' }, 404);
  });
  await page.route(`**/api/v1/repositories/${MCP_REPO_KEY}`, (route) => json(route, REPOSITORY));

  await page.route(/\/api\/v1\/packages(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('repository_key') !== MCP_REPO_KEY) return route.fallback();
    const names = [...MCP_ENTRIES.map((e) => e.server.name), ...(opts.heldNames ?? [])];
    const items = names.map((name, i) => ({
      id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
      repository_key: MCP_REPO_KEY,
      name,
      version: '1.0.0',
      format: 'mcp',
      description: null,
      size_bytes: 1024,
      download_count: 0,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      metadata: { format: 'mcp' },
    }));
    await json(route, { items, pagination: { page: 1, per_page: 100, total: items.length, total_pages: 1 } });
  });

  const base = `/mcp/${MCP_REPO_KEY}/v0.1/servers`;
  await page.route((url) => url.pathname === base, async (route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const matching = MCP_ENTRIES.filter((e) => !search || e.server.name.toLowerCase().includes(search));
    const start = Number(url.searchParams.get('cursor') ?? '0');
    const slice = matching.slice(start, start + pageSize);
    const next = start + pageSize < matching.length ? String(start + pageSize) : undefined;
    await json(route, { servers: slice, metadata: { count: slice.length, ...(next ? { nextCursor: next } : {}) } });
  });

  await page.route(
    (url) => url.pathname.startsWith(`${base}/`) && url.pathname.endsWith('/versions'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const name = decodeURIComponent(path.slice(base.length + 1, -'/versions'.length));
      const versions = MCP_ENTRIES.filter((e) => e.server.name === name);
      if (versions.length === 0) return json(route, { title: 'Not Found', status: 404 }, 404);
      return json(route, { servers: versions, metadata: { count: versions.length } });
    },
  );

  return seen;
}

/**
 * Record what the page copies. `navigator.clipboard` needs a permission
 * grant and a secure origin; replacing `writeText` works on any origin.
 */
export async function captureClipboard(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
        readText: async () => copied[copied.length - 1] ?? '',
      },
    });
  });
  return () => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}
