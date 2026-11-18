import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Repository detail tabs that depend on the format and type.
 *
 * - #1037 / #1211: the Environments tab only shows where the ecosystem has a
 *   lockfile the backend can store (npm yes, Maven no), or where environments
 *   are already registered.
 * - #1066 / #1183: the PyPI Tracks tab (admin) shows on a local PyPI
 *   repository, where tracks are created, and not on a virtual one.
 *
 * Each test creates an empty repository of its own, so the Maven one has no
 * registered environments.
 */

type RepoSpec = { format: string; repo_type: string };

/**
 * Create a repository of its own for one test, open it, and return its tab
 * list once it has rendered (Settings is admin-only). Removed in `afterEach`.
 */
async function openNewRepo(
  page: Page,
  request: APIRequestContext,
  created: string[],
  repo: RepoSpec,
) {
  const key = `e2e-tabs-${repo.format}-${repo.repo_type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const resp = await request.post('/api/v1/repositories', {
    data: { ...repo, key, name: key, is_public: true },
  });
  expect(resp.ok(), `create ${key}: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  created.push(key);

  await page.goto(`/repositories/${key}`);
  const tabs = page.getByRole('main').getByRole('tablist');
  await expect(tabs.getByRole('tab', { name: 'Settings', exact: true })).toBeVisible({
    timeout: 15000,
  });
  return tabs;
}

test.describe('Repository detail tabs by format', () => {
  const created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const key of created.splice(0)) {
      await request.delete(`/api/v1/repositories/${key}`).catch(() => {});
    }
  });

  test('#1037: the Environments tab is hidden on Maven', async ({ page, request }) => {
    const tabs = await openNewRepo(page, request, created, { format: 'maven', repo_type: 'local' });
    await expect(tabs.getByRole('tab', { name: 'Environments' })).toHaveCount(0);
  });

  test('#1037: the Environments tab is shown on npm', async ({ page, request }) => {
    const tabs = await openNewRepo(page, request, created, { format: 'npm', repo_type: 'local' });
    await expect(tabs.getByRole('tab', { name: 'Environments' })).toBeVisible();
  });

  test('#1066: the Tracks tab is shown on a local PyPI repository', async ({ page, request }) => {
    const tabs = await openNewRepo(page, request, created, { format: 'pypi', repo_type: 'local' });
    const tracks = tabs.getByRole('tab', { name: 'Tracks' });
    await expect(tracks).toBeVisible();
    await tracks.click();
    await expect(page.getByRole('main').getByRole('tabpanel', { name: 'Tracks' })).toBeVisible();
  });

  test('#1066: the Tracks tab is hidden on a virtual PyPI repository', async ({ page, request }) => {
    const tabs = await openNewRepo(page, request, created, { format: 'pypi', repo_type: 'virtual' });
    // The virtual repository's own tab is there, so the list has rendered.
    await expect(tabs.getByRole('tab', { name: 'Members' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Tracks' })).toHaveCount(0);
  });
});
