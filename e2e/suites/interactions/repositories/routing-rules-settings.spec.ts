import { test, expect } from '@playwright/test';

/**
 * E2E coverage for routing rules management on the repository Settings tab
 * (issue #263).
 *
 * Routing rules rewrite the request path before it is forwarded upstream. The
 * backend stores the full ordered list under repository_config and exposes:
 *   GET    /api/v1/repositories/{key}/routing-rules
 *   POST   /api/v1/repositories/{key}/routing-rules   { rules: [...] }
 *   DELETE /api/v1/repositories/{key}/routing-rules
 *
 * The UI settings section is admin only, so the UI-driven test is best effort
 * and falls back to skipping when the Settings tab is not reachable. The API
 * contract tests are the load-bearing assertions.
 */
test.describe.serial('Routing Rules Settings', () => {
  const REPO_KEY = 'e2e-routing-remote';

  test.beforeAll(async ({ request }) => {
    // A remote repository is the natural home for routing rules. Create one to
    // operate on. Ignore conflicts so reruns are stable.
    await request.post('/api/v1/repositories', {
      data: {
        key: REPO_KEY,
        name: 'E2E Routing Remote',
        format: 'generic',
        repo_type: 'remote',
        upstream_url: 'https://example.com',
        is_public: true,
      },
    });
    // Start from a clean slate.
    await request.delete(`/api/v1/repositories/${REPO_KEY}/routing-rules`).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${REPO_KEY}/routing-rules`).catch(() => {});
    await request.delete(`/api/v1/repositories/${REPO_KEY}`).catch(() => {});
  });

  test('routing rules API round-trips set, get, and delete', async ({ request }) => {
    const rules = [
      { path_pattern: 'releases/(.+)', rewrite_to: 'download/$1' },
      { path_pattern: 'latest', rewrite_to: 'v1/latest' },
    ];

    const setResp = await request.post(
      `/api/v1/repositories/${REPO_KEY}/routing-rules`,
      { data: { rules } }
    );
    expect(setResp.ok(), `Set failed: ${setResp.status()}`).toBeTruthy();

    const getResp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/routing-rules`
    );
    expect(getResp.ok()).toBeTruthy();
    const body = await getResp.json();
    expect(body.repository_key).toBe(REPO_KEY);
    expect(body.rules).toHaveLength(2);
    expect(body.rules[0].path_pattern).toBe('releases/(.+)');
    expect(body.rules[0].rewrite_to).toBe('download/$1');

    const delResp = await request.delete(
      `/api/v1/repositories/${REPO_KEY}/routing-rules`
    );
    expect(delResp.ok()).toBeTruthy();

    const afterDelete = await request.get(
      `/api/v1/repositories/${REPO_KEY}/routing-rules`
    );
    expect(afterDelete.ok()).toBeTruthy();
    expect((await afterDelete.json()).rules).toHaveLength(0);
  });

  test('invalid regex pattern is rejected', async ({ request }) => {
    const resp = await request.post(
      `/api/v1/repositories/${REPO_KEY}/routing-rules`,
      { data: { rules: [{ path_pattern: '(', rewrite_to: 'x' }] } }
    );
    expect(resp.status()).toBe(400);
  });

  test('UI: add a routing rule on the settings tab', async ({ page, request }) => {
    // Ensure no rules exist before the UI flow.
    await request.delete(`/api/v1/repositories/${REPO_KEY}/routing-rules`).catch(() => {});

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const settingsTab = page.getByRole('tab', { name: /settings/i });
    if (!(await settingsTab.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, 'Settings tab not visible (requires admin); API tests cover the contract');
      return;
    }
    await settingsTab.click();

    // The Routing Rules section renders its own heading.
    const heading = page.getByRole('heading', { name: /routing rules/i });
    await expect(heading).toBeVisible({ timeout: 8000 });

    // Fill the add-rule draft and submit.
    await page.getByLabel(/^path pattern$/i).fill('docs/(.+)');
    await page.getByLabel(/^rewrite to$/i).fill('static/$1');
    await page.getByRole('button', { name: /add rule/i }).click();

    // Confirm the rule was persisted via the API.
    await expect(async () => {
      const resp = await request.get(
        `/api/v1/repositories/${REPO_KEY}/routing-rules`
      );
      const body = await resp.json();
      expect(body.rules).toHaveLength(1);
      expect(body.rules[0].path_pattern).toBe('docs/(.+)');
      expect(body.rules[0].rewrite_to).toBe('static/$1');
    }).toPass({ timeout: 10000 });

    // The new rule should appear in the rules table.
    await expect(page.getByRole('table', { name: /routing rules/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByLabel(/rule 1 path pattern/i)).toHaveValue('docs/(.+)', {
      timeout: 5000,
    });
  });

  test('UI: remove a routing rule on the settings tab', async ({ page, request }) => {
    // Seed a single rule to remove.
    await request.post(`/api/v1/repositories/${REPO_KEY}/routing-rules`, {
      data: { rules: [{ path_pattern: 'remove/(.+)', rewrite_to: 'gone/$1' }] },
    });

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const settingsTab = page.getByRole('tab', { name: /settings/i });
    if (!(await settingsTab.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, 'Settings tab not visible (requires admin); API tests cover the contract');
      return;
    }
    await settingsTab.click();

    await expect(page.getByRole('heading', { name: /routing rules/i })).toBeVisible({
      timeout: 8000,
    });

    const removeBtn = page.getByRole('button', { name: /remove rule 1/i });
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    // Removing the last rule clears the config entirely.
    await expect(async () => {
      const resp = await request.get(
        `/api/v1/repositories/${REPO_KEY}/routing-rules`
      );
      const body = await resp.json();
      expect(body.rules).toHaveLength(0);
    }).toPass({ timeout: 10000 });
  });
});
