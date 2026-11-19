import { test, expect } from '@playwright/test';

// Upstream Filter editor on a remote (#1034), skips on a backend without the endpoint
test.describe.serial('Upstream filter settings', () => {
  const REMOTE = 'e2e-upstream-filter-remote';
  const LOCAL = 'e2e-upstream-filter-local';
  const api = `/api/v1/repositories/${REMOTE}/upstream-filter`;

  test.beforeAll(async ({ request }) => {
    // Ignore conflicts so reruns are stable
    await request.post('/api/v1/repositories', {
      data: {
        key: REMOTE,
        name: 'E2E Upstream Filter Remote',
        format: 'npm',
        repo_type: 'remote',
        upstream_url: 'https://registry.npmjs.org',
        is_public: false,
      },
    });
    await request.post('/api/v1/repositories', {
      data: {
        key: LOCAL,
        name: 'E2E Upstream Filter Local',
        format: 'npm',
        repo_type: 'local',
        is_public: false,
      },
    });
    await request.delete(api).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.delete(api).catch(() => {});
    await request.delete(`/api/v1/repositories/${REMOTE}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${LOCAL}`).catch(() => {});
  });

  async function openSettings(page: import('@playwright/test').Page, key: string) {
    await page.goto(`/repositories/${key}`);
    await page.getByRole('tab', { name: /settings/i }).click();
  }

  test('UI: an admin edits and saves the filter of a remote', async ({ page, request }) => {
    const probe = await request.delete(api);
    test.skip(!probe.ok(), `Upstream filter endpoint not available (status ${probe.status()})`);

    await openSettings(page, REMOTE);
    const section = page.locator('section[aria-labelledby="settings-upstream-filter-heading"]');
    await expect(section.getByText('No filter', { exact: true })).toBeVisible({ timeout: 15000 });
    await section.getByLabel('Include patterns').fill('^@acme(/|%2F)\n^left-pad');
    await section.getByLabel('Exclude patterns').fill('-beta\\.');
    await section.getByRole('button', { name: 'Save' }).click();
    await expect(section.getByText('Active', { exact: true })).toBeVisible();

    const stored = await (await request.get(api)).json();
    expect(stored.active).toBe(true);
    expect(stored.include_patterns).toEqual(['^@acme(/|%2F)', '^left-pad']);
    expect(stored.exclude_patterns).toEqual(['-beta\\.']);
  });

  test('UI: Clear removes the filter after confirming', async ({ page, request }) => {
    const put = await request.put(api, { data: { include_patterns: ['^@acme/'], exclude_patterns: [] } });
    test.skip(!put.ok(), `Upstream filter endpoint not available (status ${put.status()})`);

    await openSettings(page, REMOTE);
    const section = page.locator('section[aria-labelledby="settings-upstream-filter-heading"]');
    await expect(section.getByLabel('Include patterns')).toHaveValue('^@acme/', { timeout: 15000 });
    await section.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear' }).click();
    await expect(section.getByText('No filter', { exact: true })).toBeVisible();

    const stored = await (await request.get(api)).json();
    expect(stored.active).toBe(false);
  });

  test('UI: a local repository has no upstream filter section', async ({ page }) => {
    await openSettings(page, LOCAL);
    await expect(page.getByRole('heading', { name: /general/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Upstream Filter', exact: true })).toHaveCount(0);
  });
});
