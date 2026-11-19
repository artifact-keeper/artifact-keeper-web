import { test, expect, navigateTo } from '../../../fixtures/test-fixtures';
import type { Page, Route } from '@playwright/test';

/**
 * Setup Guide for MCP registries (artifact-keeper#5253). The e2e backend has
 * no `mcp` repositories, so the repository list is served with two added at
 * the network layer: a public one (VS Code gallery URL) and a private one
 * (the gallery cannot read it anonymously).
 */

const REPOSITORIES = /\/api\/v1\/repositories(\?.*)?$/;

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function mcpRepo(n: number, key: string, visibility: 'public' | 'private') {
  const now = '2026-11-01T00:00:00Z';
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    key,
    name: key,
    description: null,
    format: 'mcp',
    repo_type: 'local',
    is_public: visibility === 'public',
    visibility,
    storage_used_bytes: 0,
    quota_bytes: null,
    created_at: now,
    updated_at: now,
    mcp_package_policy: 'own-repos',
  };
}

async function stubRepositories(page: Page) {
  await page.route(REPOSITORIES, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    const items = [
      ...(body.items ?? []),
      mcpRepo(1, 'e2e-mcp-public', 'public'),
      mcpRepo(2, 'e2e-mcp-private', 'private'),
    ];
    await json(route, { ...body, items });
  });
}

async function openGuide(page: Page, key: string) {
  await navigateTo(page, '/setup');
  await page.getByRole('button', { name: 'AI agents', exact: true }).click();
  await page.getByText(key, { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

test.describe('MCP registry Setup Guide (#5253)', () => {
  test.beforeEach(async ({ page }) => {
    await stubRepositories(page);
  });

  test('a public repository gets the VS Code gallery setting and publish steps', async ({ page }) => {
    const dialog = await openGuide(page, 'e2e-mcp-public');
    await expect(dialog.getByRole('tab', { name: 'VS Code', selected: true })).toBeVisible();
    const vscode = dialog.getByRole('tabpanel', { name: 'VS Code' });
    await expect(vscode).toContainText('"chat.mcp.gallery.serviceUrl"');
    await expect(vscode).toContainText('/mcp/e2e-mcp-public');

    await dialog.getByRole('tab', { name: 'Publish' }).click();
    const publish = dialog.getByRole('tabpanel', { name: 'Publish' });
    await expect(publish).toContainText('/mcp/e2e-mcp-public/v0.1/publish');
    await expect(publish).toContainText('~/.config/mcp-publisher/token.json');
    await expect(publish).toContainText('your package to Artifact Keeper first');
  });

  test('a private repository explains why the VS Code gallery cannot read it', async ({ page }) => {
    const dialog = await openGuide(page, 'e2e-mcp-private');
    const vscode = dialog.getByRole('tabpanel', { name: 'VS Code' });
    await expect(vscode).toContainText('sends no credential');
    await expect(vscode).not.toContainText('"chat.mcp.gallery.serviceUrl"');

    await dialog.getByRole('tab', { name: 'Claude Code' }).click();
    await expect(dialog.getByRole('tabpanel', { name: 'Claude Code' })).toContainText(
      'no registry subscription',
    );
  });
});
