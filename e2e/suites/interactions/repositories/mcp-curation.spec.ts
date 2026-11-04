import { test, expect, type Route } from '@playwright/test';
import { MCP_PENDING, MCP_REMOTE_KEY, stubMcpCuration } from '../../../fixtures/mcp-curation-mocks';

/**
 * MCP approval queue on /curation (artifact-keeper#5253 Phase 2, lens-ui 4.2).
 * A Remote MCP repository is deny-by-default: an administrator approves
 * names, by row, by namespace glob, or from the upstream catalog. The
 * backend endpoints are stubbed (fixtures/mcp-curation-mocks.ts).
 */

const ok = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('MCP approval queue', () => {
  test.beforeEach(async ({ page }) => {
    await stubMcpCuration(page);
  });

  test('an admin approves one pending server, pinned to its version', async ({ page }) => {
    const [first] = MCP_PENDING;
    let body: Record<string, unknown> | null = null;
    await page.route(`**/api/v1/curation/packages/${first.id}/approve`, async (route) => {
      body = route.request().postDataJSON();
      await ok(route, { ...first, status: 'approved', version: '1.4.2' });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    await expect(page.getByText('Tools: +3 added, 1 changed')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pending/ })).toContainText('2');

    await page.getByRole('button', { name: `Approve ${first.name}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: /Pin this version only/ }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden();
    expect(body).toEqual({ version: '1.4.2' });
  });

  test('an admin approves a namespace glob after previewing its matches', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route(`**/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/reviews/bulk-approve-namespace`, async (route) => {
      body = route.request().postDataJSON();
      await ok(route, { approved: 1, denied: 0 });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await page.getByRole('button', { name: 'Approve namespace' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Namespace glob').fill('io.github.*');
    await expect(dialog.getByRole('alert')).toContainText('broad');
    await dialog.getByLabel('Namespace glob').fill('io.github.acme/*');
    await expect(dialog.getByText('Matches 1 pending server of 2.')).toBeVisible();
    await expect(dialog.getByText(/Deny globs always win/)).toBeVisible();
    await dialog.getByLabel('Reason').fill('trusted publisher');
    await dialog.getByRole('button', { name: 'Approve namespace' }).click();
    await expect(page.getByText('Approved 1 server')).toBeVisible();
    expect(body).toEqual({ namespace_glob: 'io.github.acme/*', reason: 'trusted publisher' });
  });

  test('an admin requests approval for an upstream entry from the catalog', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route(`**/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/upstream/request-approval`, async (route) => {
      body = route.request().postDataJSON();
      await ok(route, { id: 'new', name: 'io.github.new/thing', status: 'pending' });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await page.getByRole('tab', { name: 'Catalog' }).click();
    await expect(page.getByText('io.github.new/thing')).toBeVisible();
    await expect(page.getByText('Not visible to clients until approved').first()).toBeVisible();
    // The entry already queued offers no second request.
    await expect(page.getByRole('button', { name: `Request approval for ${MCP_PENDING[0].name}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Request approval for io.github.new/thing' }).click();
    await expect(page.getByText('Approval requested for io.github.new/thing')).toBeVisible();
    expect(body).toEqual({ name: 'io.github.new/thing' });
  });
});
