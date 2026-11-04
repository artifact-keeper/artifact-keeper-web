import { test, expect, type Route } from '@playwright/test';
import { MCP_DRIFT_PIN, MCP_DRIFTED, MCP_PENDING, MCP_REMOTE_KEY, stubMcpCuration } from '../../../fixtures/mcp-curation-mocks';

/**
 * MCP approval queue on /curation (artifact-keeper#5253 Phase 2, lens-ui 4.2).
 * A Remote MCP repository is deny-by-default: an administrator approves
 * names, by row, by namespace glob, or from the catalog. The Remote
 * management API (`/api/v1/repositories/{key}/mcp/catalog`) is stubbed in
 * the backend's shapes (fixtures/mcp-curation-mocks.ts).
 */

const CATALOG = `**/api/v1/repositories/${MCP_REMOTE_KEY}/mcp/catalog`;

const ok = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('MCP approval queue', () => {
  test.beforeEach(async ({ page }) => {
    await stubMcpCuration(page);
  });

  test('an admin approves one pending server, pinned to its version', async ({ page }) => {
    const [first] = MCP_PENDING;
    let body: Record<string, unknown> | null = null;
    await page.route(`${CATALOG}/pins`, async (route) => {
      body = route.request().postDataJSON();
      await ok(route, { item: { ...first, status: 'pending' }, ingestError: null });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    await expect(page.getByText('Tools: +3 added, 1 changed')).toBeVisible();
    await expect(page.getByText('Requested 2 times: needed for the release bot')).toBeVisible();
    await expect(page.getByText(`Looks like ${first.name}`)).toBeVisible();
    await expect(page.getByRole('tab', { name: /Awaiting decision/ })).toContainText('2');

    await page.getByRole('button', { name: `Approve ${first.name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: /Pin this version only/ }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden();
    expect(body).toEqual({ name: first.name, version: '1.4.2' });
  });

  test('an admin re-approves a version whose upstream content changed', async ({ page }) => {
    const pin = MCP_DRIFT_PIN;
    let hit = false;
    await page.route(`${CATALOG}/${pin.id}/approve`, async (route) => {
      hit = true;
      await ok(route, { item: MCP_DRIFTED, ingestError: null });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await expect(page.getByText(/Upstream content changed after approval/)).toBeVisible();
    // The approved name itself needs no decision; only its drifted version does.
    await expect(page.getByRole('button', { name: `Approve ${MCP_DRIFTED.name}`, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `Approve ${MCP_DRIFTED.name} ${pin.version}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(`Approved version ${pin.version}`)).toBeVisible();
    expect(hit).toBe(true);
  });

  test('an admin approves a namespace glob after previewing its matches', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route(`${CATALOG}/bulk-approve`, async (route) => {
      body = route.request().postDataJSON();
      await ok(route, { approved: 1, names: [MCP_PENDING[0].name], skippedDenied: 0, skippedReview: 1 });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await page.getByRole('button', { name: 'Approve namespace' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Namespace glob').fill('io.github.acme');
    await expect(dialog.getByText(/Match the full name/)).toBeVisible();
    await dialog.getByLabel('Namespace glob').fill('io.github.*');
    await expect(dialog.getByRole('alert')).toContainText('broad');
    await dialog.getByLabel('Namespace glob').fill('io.github.acme/*');
    await expect(dialog.getByText('Matches 1 pending server of 1.')).toBeVisible();
    await expect(dialog.getByText(/Deny globs always win/)).toBeVisible();
    await dialog.getByLabel('Reason').fill('trusted publisher');
    await dialog.getByRole('button', { name: 'Approve namespace' }).click();
    await expect(page.getByText('Approved 1 server; 1 flagged left for review')).toBeVisible();
    expect(body).toEqual({ pattern: 'io.github.acme/*', includeReview: false, reason: 'trusted publisher' });
  });

  test('an admin requests approval for an upstream name from the catalog', async ({ page }) => {
    let url = '';
    await page.route(`${CATALOG}/*/request-approval`, async (route) => {
      url = route.request().url();
      await ok(route, { ...MCP_PENDING[0], name: 'io.github.new/thing' });
    });

    await page.goto(`/curation?repo=${MCP_REMOTE_KEY}`);
    await page.getByRole('tab', { name: 'Catalog' }).click();
    await expect(page.getByText('io.github.new/thing')).toBeVisible();
    await expect(page.getByText('Not visible to clients until approved').first()).toBeVisible();
    // An approved name offers no request.
    await expect(page.getByRole('button', { name: `Request approval for ${MCP_DRIFTED.name}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Request approval for io.github.new/thing' }).click();
    await expect(page.getByText('Approval requested for io.github.new/thing')).toBeVisible();
    expect(url).toMatch(/\/catalog\/00000000-0000-4000-8000-0000000000e5\/request-approval$/);
  });
});
