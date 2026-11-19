import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * MCP server detail page (web, artifact-keeper#5253).
 *
 * The e2e backend has no `mcp` format yet, so the registry API, the stored
 * metadata and the package row are stubbed at the network layer. The admin
 * storage state is a repository holder, so a held exact version answers with
 * the reason-gated body; the plain 404 is what any reader gets for a version
 * that is held, deleted or missing.
 */

const PKG_ID = '00000000-0000-4000-8000-0000000000c1';
const REPO = 'mcp-local';
const NAME = 'com.acme/weather';

const SERVER = {
  name: NAME,
  description: 'Weather forecasts and alerts',
  title: 'Acme Weather',
  version: '1.4.2',
  repository: { url: 'https://github.com/acme/weather', source: 'github' },
  packages: [
    {
      registryType: 'npm',
      registryBaseUrl: 'https://ak.example/npm/npm-local',
      identifier: '@acme/weather-mcp',
      version: '1.4.2',
      transport: { type: 'stdio' },
      environmentVariables: [{ name: 'ACME_API_KEY', isSecret: true, isRequired: true }],
    },
  ],
  remotes: [{ type: 'streamable-http', url: 'https://mcp.acme.dev/' }],
};

function served(version: string, isLatest: boolean) {
  return {
    server: { ...SERVER, version },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        isLatest,
        publishedAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      'com.artifactkeeper.registry/source': {
        repository: REPO,
        artifactId: `art-${version}`,
        packagePolicy: 'own-repos',
        origin: 'hosted',
        upstreamVerified: false,
      },
    },
  };
}

const PLAIN_404 = { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Server not found' };
const HELD_BODY = {
  type: 'about:blank',
  title: 'Not Found',
  status: 404,
  detail: `${NAME} 2.0.0 is held: a package it runs is quarantined`,
  error: 'mcp_backing_artifact_blocked',
  name: NAME,
  version: '2.0.0',
  hold: 'backing',
  gate: 'quarantine',
  package: 'npm:@acme/weather-mcp@2.0.0',
};

const json = (route: Route, body: unknown, status = 200, contentType = 'application/json') =>
  route.fulfill({ status, contentType, body: JSON.stringify(body) });

async function stubMcp(page: Page, opts: { capabilities?: unknown; health?: unknown } = {}) {
  await page.route(`**/api/v1/packages/${PKG_ID}`, (route) =>
    json(route, {
      id: PKG_ID,
      repository_key: REPO,
      name: NAME,
      version: '1.4.2',
      format: 'mcp',
      size_bytes: 512,
      download_count: 0,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      metadata: { format: 'mcp', source: 'hosted', origin: 'hosted', name: NAME, version: '1.4.2', status: 'active' },
    }),
  );
  await page.route(`**/api/v1/packages/${PKG_ID}/versions`, (route) =>
    json(route, {
      versions: ['1.4.2', '2.0.0', '3.0.0'].map((version, i) => ({
        version,
        size_bytes: 512,
        download_count: 0,
        created_at: `2026-1${i}-01T00:00:00Z`,
        checksum_sha256: 'a'.repeat(64),
      })),
    }),
  );
  await page.route(`**/mcp/${REPO}/v0.1/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/capabilities') && opts.capabilities) return json(route, opts.capabilities);
    if (path.endsWith('/versions')) return json(route, { servers: [served('1.4.2', true)], metadata: { count: 1 } });
    if (path.endsWith('/versions/2.0.0')) return json(route, HELD_BODY, 404, 'application/problem+json');
    if (path.endsWith('/versions/3.0.0')) return json(route, PLAIN_404, 404, 'application/problem+json');
    return json(route, PLAIN_404, 404, 'application/problem+json');
  });
  await page.route(`**/api/v1/repositories/${REPO}/artifacts/**`, (route) =>
    json(route, { id: 'art-stored', path: 'servers/x/server.json' }),
  );
  await page.route('**/api/v1/artifacts/*/metadata', (route) =>
    json(route, {
      metadata: {
        server: SERVER,
        registry: { status: 'active' },
        packages: [
          {
            index: 0,
            registryType: 'npm',
            submitted: { identifier: '@acme/weather-mcp', version: '1.4.2' },
            resolved: { repository: 'npm-local', artifactIds: ['art-npm'] },
          },
        ],
      },
    }),
  );
  await page.route(`**/api/v1/repositories/${REPO}/mcp/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/health') && opts.health) return json(route, opts.health);
    return json(route, { code: 'NOT_FOUND', message: 'not found' }, 404);
  });
  await page.route(`**/api/v1/repositories/${REPO}`, (route) =>
    json(route, { id: 'r1', key: REPO, name: REPO, format: 'mcp', repo_type: 'local' }),
  );
}

test.describe('MCP server detail', () => {
  test('shows the served version with its packages and versions', async ({ page }) => {
    await stubMcp(page);
    await page.goto(`/packages/${PKG_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('weather');
    await expect(page.getByText('v1.4.2 (latest)')).toBeVisible();
    await expect(page.getByText('hosted', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install / Connect' })).toBeVisible();

    await page.getByRole('tab', { name: /Packages & Remotes/ }).click();
    await expect(page).toHaveURL(/tab=packages/);
    await expect(page.getByRole('link', { name: 'npm-local' }).first()).toBeVisible();

    await page.getByRole('tab', { name: /Versions/ }).click();
    await expect(page.getByRole('button', { name: '2.0.0' })).toBeVisible();
    await expect(page.getByText('not visible to clients').first()).toBeVisible();
  });

  test('explains a held version to a repository holder', async ({ page }) => {
    await stubMcp(page);
    await page.goto(`/packages/${PKG_ID}?version=2.0.0`);
    const panel = page.getByTestId('mcp-held-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('mcp-held-reason')).toHaveText('A package it runs is held');
    await expect(panel.getByText('npm:@acme/weather-mcp@2.0.0')).toBeVisible();
    await expect(panel.getByText(/plain 404/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install / Connect' })).toHaveCount(0);
  });

  test('stays neutral on the plain 404', async ({ page }) => {
    await stubMcp(page);
    await page.goto(`/packages/${PKG_ID}?version=3.0.0`);
    const panel = page.getByTestId('mcp-held-panel');
    await expect(panel.getByText(/Only a holder of this repository can see why/)).toBeVisible();
    await expect(panel.getByTestId('mcp-held-reason')).toHaveCount(0);
  });

  test('labels the provenance of tool snapshots', async ({ page }) => {
    const current = {
      id: 'snap-1',
      source: 'publisher_declared',
      provenance: 'declared by the publisher',
      observed: false,
      authState: 'auth_required',
      outcome: 'ok',
      counts: { tools: 1, resources: 0, prompts: 0 },
      tools: [{ name: 'get_forecast', description: 'Forecast', annotations: { readOnlyHint: true } }],
      resources: [],
      prompts: [],
      instructions: null,
    };
    await stubMcp(page, {
      capabilities: {
        repository: REPO,
        server: NAME,
        version: '1.4.2',
        artifactId: 'art-1.4.2',
        current,
        snapshots: [{ ...current, tools: undefined, resources: undefined, prompts: undefined }],
        introspection: { remoteProbe: 'off', probeEnabled: false, sandbox: 'off', sandboxEnabled: false },
        notice: 'Capability lists are untrusted.',
      },
    });
    await page.goto(`/packages/${PKG_ID}?tab=tools`);
    await expect(page.getByText('declared', { exact: true })).toBeVisible();
    await expect(page.getByText('get_forecast')).toBeVisible();
    await expect(page.getByText(/Unauthenticated view/)).toBeVisible();
    await expect(page.getByText('Capability lists are untrusted.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-probe' })).toHaveCount(0);
  });

  test('shows the health roll-up and lint findings to a repository holder', async ({ page }) => {
    await stubMcp(page, {
      health: {
        name: NAME,
        version: '1.4.2',
        artifactId: 'art-1.4.2',
        status: 'warning',
        packagePolicy: 'own-repos',
        packages: [
          {
            index: 0,
            package: 'npm:@acme/weather-mcp@1.4.2',
            registryType: 'npm',
            repository: 'npm-local',
            scanned: true,
            score: 97,
            grade: 'A',
            critical: 0,
            high: 0,
            medium: 1,
            low: 0,
            info: 0,
            gate: 'allowed',
            status: 'warning',
          },
        ],
        lint: {
          ran: true,
          block: 0,
          review: 1,
          warn: 0,
          findings: [
            {
              id: 'f1',
              rule: 'secret_unmarked',
              action: 'review',
              severity: 'high',
              source: 'server_json',
              path: 'packages[0].environmentVariables[0].isSecret',
              message: '"API_TOKEN" looks like a credential',
              acknowledged: false,
            },
          ],
        },
      },
    });
    await page.goto(`/packages/${PKG_ID}?tab=security`);
    await expect(page.getByText('Scan: grade A (97)')).toBeVisible();
    await expect(page.getByText('review: secret_unmarked')).toBeVisible();
    await expect(page.getByText('packages[0].environmentVariables[0].isSecret')).toBeVisible();
  });
});
