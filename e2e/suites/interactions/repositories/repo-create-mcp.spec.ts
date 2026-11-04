import { test, expect, navigateTo } from '../../../fixtures/test-fixtures';
import type { Page, Route } from '@playwright/test';

/**
 * Creating an MCP registry (artifact-keeper#5253). The e2e backend image does
 * not ship the `mcp` format yet, so GET /api/v1/formats is stubbed to list it
 * (or to leave it out) and the create call is answered at the network layer:
 * the assertions are on what the browser offers and sends.
 */

const FORMATS = /\/api\/v1\/formats(\?.*)?$/;
const REPOSITORIES = /\/api\/v1\/repositories(\?.*)?$/;

const MCP_HANDLER = {
  id: '00000000-0000-4000-8000-0000000000c1',
  format_key: 'mcp',
  display_name: 'MCP Registry',
  description: 'MCP server registry',
  extensions: ['.json'],
  handler_type: 'Core',
  is_enabled: true,
  priority: 0,
  plugin_id: null,
  capabilities: null,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Serve the real handler list with `mcp` added or removed. */
async function stubFormats(page: Page, withMcp: boolean) {
  await page.route(FORMATS, async (route) => {
    let handlers: { format_key: string }[] = [];
    try {
      const res = await route.fetch();
      handlers = await res.json();
    } catch {
      handlers = [];
    }
    const rest = (Array.isArray(handlers) ? handlers : []).filter((h) => h.format_key !== 'mcp');
    await json(route, withMcp ? [...rest, MCP_HANDLER] : rest);
  });
}

async function openCreateDialog(page: Page) {
  await navigateTo(page, '/repositories');
  await page.getByRole('button', { name: /create repository/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

test.describe('Create MCP registry (#5253)', () => {
  test('sends format mcp, Local, own-repos and the namespace allowlist', async ({ page }) => {
    await stubFormats(page, true);
    let body: Record<string, unknown> | null = null;
    await page.route(REPOSITORIES, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      body = route.request().postDataJSON();
      const now = new Date().toISOString();
      await json(
        route,
        {
          id: '00000000-0000-4000-8000-0000000000e1',
          key: body?.key,
          name: body?.name,
          description: null,
          format: 'mcp',
          repo_type: 'local',
          is_public: false,
          visibility: 'private',
          storage_used_bytes: 0,
          quota_bytes: null,
          created_at: now,
          updated_at: now,
          mcp_package_policy: 'own-repos',
          mcp_namespace_allow: ['com.acme'],
        },
        201,
      );
    });

    const dialog = await openCreateDialog(page);
    await dialog.locator('#create-key').fill('e2e-mcp-local');
    await dialog.locator('#create-name').fill('E2E MCP Local');
    await dialog.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'MCP Registry', exact: true }).click();

    // Phase 1: only the hosted types are offered.
    await dialog.getByRole('combobox').nth(1).click();
    await expect(page.getByRole('option', { name: 'Local', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Staging', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Remote', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Virtual', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Local', exact: true }).click();

    await expect(dialog.getByText('MCP Options')).toBeVisible();
    await dialog.getByLabel('Namespace allowlist').fill('com.acme');
    await dialog.getByLabel('Namespace allowlist').press('Enter');
    await expect(dialog.getByRole('button', { name: 'Remove com.acme' })).toBeVisible();
    await expect(dialog.getByLabel(/Own repositories/)).toBeChecked();

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    expect(body).toMatchObject({
      format: 'mcp',
      repo_type: 'local',
      mcp_package_policy: 'own-repos',
      mcp_namespace_allow: ['com.acme'],
    });
  });

  test('does not offer MCP Registry when the backend lacks the format', async ({ page }) => {
    await stubFormats(page, false);
    const formats = page.waitForResponse(FORMATS);
    const dialog = await openCreateDialog(page);
    await formats;
    await dialog.getByRole('combobox').nth(0).click();
    await expect(page.getByRole('option', { name: 'NPM', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'MCP Registry', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});
