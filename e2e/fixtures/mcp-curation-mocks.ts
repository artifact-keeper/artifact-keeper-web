import { expect, type Page, type Route } from '@playwright/test';

/**
 * Network stubs for the MCP approval queue on /curation (artifact-keeper#5253
 * Phase 2). The e2e backend has no MCP Remote repositories, so the
 * repository list and the Remote management API
 * (`/api/v1/repositories/{key}/mcp/catalog`) are answered here, in the
 * backend's shapes, and the specs assert on what the browser sends.
 */

export const MCP_REMOTE_KEY = 'mcp-proxy';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function repo(id: string, key: string, format: string, repoType: string) {
  return {
    id,
    key,
    name: key,
    description: null,
    format,
    repo_type: repoType,
    is_public: false,
    storage_used_bytes: 0,
    quota_bytes: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-0000000000e${n}`;

/** A `CatalogItem` of `GET /api/v1/repositories/{key}/mcp/catalog`, camelCase as the backend sends it. */
function item(n: number, name: string, over: Record<string, unknown> = {}) {
  return {
    id: ID(n),
    name,
    namespace: name.split('/')[0],
    status: 'pending',
    denied: false,
    title: null,
    description: 'Weather forecasts',
    latestVersion: '1.4.2',
    versions: ['1.4.2', '1.4.1'],
    upstreamStatus: 'active',
    upstreamUpdatedAt: '2026-11-01T00:00:00Z',
    flags: {},
    approvalRequests: {},
    evaluationReason: null,
    evaluatedAt: null,
    evaluatedBy: null,
    firstSeenAt: '2026-11-01T00:00:00Z',
    pins: [],
    ingested: [],
    ...over,
  };
}

export const MCP_PENDING = [
  item(1, 'io.github.acme/weather', {
    approvalRequests: { count: 2, lastNote: 'needed for the release bot' },
    // Ingested under allow_with_gates, so the queue shows its tool diff.
    ingested: [{ version: '1.4.2', artifactId: ID(9), upstreamStatus: 'active', unresolved: [] }],
  }),
  item(2, 'io.github.acrne/weather', {
    status: 'review',
    latestVersion: '0.1.0',
    versions: ['0.1.0'],
    flags: { typosquat: { similarTo: 'io.github.acme/weather' } },
  }),
];

/** The `name@version` row re-queued when the upstream bytes of 2.0.0 changed. */
export const MCP_DRIFT_PIN = {
  id: ID(4),
  version: '2.0.0',
  status: 'review',
  contentDrift: { storedSha256: 'aa', upstreamSha256: 'bb', detectedAt: '2026-11-02T00:00:00Z' },
  evaluationReason: null,
};

/** A name approved earlier whose upstream bytes changed under 2.0.0. */
export const MCP_DRIFTED = item(3, 'com.other/sql', {
  status: 'approved',
  latestVersion: '2.0.0',
  versions: ['2.0.0'],
  pins: [MCP_DRIFT_PIN],
});

const UNREQUESTED = item(5, 'io.github.new/thing', { latestVersion: '2.0.0', versions: ['2.0.0'] });

const COUNTS = { pending: 1, review: 1, approved: 1 };

const catalogPage = (items: unknown[]) => ({ items, nextCursor: null, counts: COUNTS });

/** Answers every MCP read /curation makes for one Remote MCP repository. */
export async function stubMcpCuration(page: Page) {
  const catalogReads: string[] = [];
  await page.route(/\/api\/v1\/repositories(\?|$)/, (route) =>
    json(route, {
      items: [
        repo('00000000-0000-4000-8000-0000000000c1', 'staging-npm', 'npm', 'staging'),
        repo('00000000-0000-4000-8000-0000000000c2', MCP_REMOTE_KEY, 'mcp', 'remote'),
      ],
      pagination: { page: 1, per_page: 1000, total: 2, total_pages: 1 },
    }),
  );
  await page.route(new RegExp(`/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/catalog(\\?|$)`), (route) => {
    const q = new URL(route.request().url()).searchParams;
    catalogReads.push(q.toString());
    if (q.get('queue') === 'true') return json(route, catalogPage([...MCP_PENDING, MCP_DRIFTED]));
    if (q.get('status') === 'approved') return json(route, catalogPage([MCP_DRIFTED]));
    if (q.get('status')) return json(route, catalogPage([]));
    // The catalog browse: every upstream name, whatever its status.
    return json(route, catalogPage([UNREQUESTED, ...MCP_PENDING, MCP_DRIFTED]));
  });
  // The queue's tool diff of an ingested version (registry surface).
  await page.route(
    (url) => url.pathname.startsWith(`/mcp/${MCP_REMOTE_KEY}/v0.1/servers/`) && url.pathname.endsWith('/capabilities/diff'),
    (route) =>
      json(route, {
        from: null,
        to: { id: ID(8), source: 'publisher_declared' },
        fromVersion: '1.4.1',
        toVersion: '1.4.2',
        summary: {
          text: 'Tools: +3 added, 1 changed',
          tools: { added: 3, removed: 0, changed: 1, unchanged: 2 },
          resources: { added: 0, removed: 0, changed: 0, unchanged: 0 },
          prompts: { added: 0, removed: 0, changed: 0, unchanged: 0 },
          instructionsChanged: false,
          destructiveAdded: [],
          identical: false,
        },
        tools: { added: [], removed: [], changed: [], unchanged: 2 },
        resources: { added: [], removed: [], changed: [], unchanged: 0 },
        prompts: { added: [], removed: [], changed: [], unchanged: 0 },
        instructionsChanged: false,
        notice: 'Capability lists are untrusted.',
      }),
  );
  return { catalogReads };
}

/** For non-admin roles: /curation never shows or loads the MCP queue. */
export async function expectMcpCurationDenied(page: Page) {
  const { catalogReads } = await stubMcpCuration(page);
  await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
  await page.waitForLoadState('domcontentloaded');
  // RequireAdmin redirects once the session is known, so poll for it.
  await expect
    .poll(async () => {
      const url = page.url();
      const body = (await page.textContent('body')) ?? '';
      return url.includes('/error/403') || url.includes('/login') || /administrator access|forbidden|denied/i.test(body);
    })
    .toBe(true);
  await expect(page.getByRole('button', { name: /Approve namespace/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Approve ${MCP_PENDING[0].name}` })).toHaveCount(0);
  expect(catalogReads).toEqual([]);
}
