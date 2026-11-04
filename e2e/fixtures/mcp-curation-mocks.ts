import { expect, type Page, type Route } from '@playwright/test';

/**
 * Network stubs for the MCP approval queue on /curation (artifact-keeper#5253
 * Phase 2). The e2e backend has no MCP Remote repositories, so the
 * repository list, the review lists and the upstream catalog are answered
 * here, and the specs assert on what the browser sends.
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

const SERVER = {
  name: 'io.github.acme/weather',
  version: '1.4.2',
  description: 'Weather forecasts',
  packages: [
    {
      registryType: 'npm',
      identifier: '@acme/weather-mcp',
      version: '1.4.2',
      transport: { type: 'stdio' },
      environmentVariables: [{ name: 'ACME_API_KEY', isSecret: true }],
    },
  ],
};

export const MCP_PENDING = [
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    name: SERVER.name,
    status: 'pending',
    first_seen_at: '2026-11-01T00:00:00Z',
    server: SERVER,
    findings: [{ rule: 'injection_phrase', action: 'review' }],
    tool_diff: { added: ['a', 'b', 'c'], removed: [], changed: [{ name: 'd', fields: ['annotations'] }] },
  },
  {
    id: '00000000-0000-4000-8000-0000000000e2',
    name: 'com.other/sql',
    status: 'pending',
    first_seen_at: '2026-11-01T00:00:00Z',
    server: { ...SERVER, name: 'com.other/sql', version: '0.1.0' },
  },
];

/** Answers every MCP read /curation makes for one Remote MCP repository. */
export async function stubMcpCuration(page: Page) {
  const reviewReads: string[] = [];
  await page.route(/\/api\/v1\/repositories(\?|$)/, (route) =>
    json(route, {
      items: [
        repo('00000000-0000-4000-8000-0000000000c1', 'staging-npm', 'npm', 'staging'),
        repo('00000000-0000-4000-8000-0000000000c2', MCP_REMOTE_KEY, 'mcp', 'remote'),
      ],
      pagination: { page: 1, per_page: 1000, total: 2, total_pages: 1 },
    }),
  );
  await page.route(new RegExp(`/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/reviews(\\?|$)`), (route) => {
    const status = new URL(route.request().url()).searchParams.get('status') ?? '';
    reviewReads.push(status);
    return json(route, { items: status === 'pending' ? MCP_PENDING : [] });
  });
  await page.route(new RegExp(`/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/upstream(\\?|$)`), (route) =>
    json(route, {
      servers: [
        { server: { ...SERVER, name: 'io.github.new/thing', version: '2.0.0' }, review_status: null },
        { server: SERVER, review_status: 'pending', review_id: MCP_PENDING[0].id },
      ],
      next_cursor: null,
    }),
  );
  return { reviewReads };
}

/** For non-admin roles: /curation never shows or loads the MCP queue. */
export async function expectMcpCurationDenied(page: Page) {
  const { reviewReads } = await stubMcpCuration(page);
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
  await expect(page.getByRole('button', { name: `Approve ${SERVER.name}` })).toHaveCount(0);
  expect(reviewReads).toEqual([]);
}
