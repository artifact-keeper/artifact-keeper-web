import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Admin setting that hides sidebar entries for every user (issue #968,
 * backend artifact-keeper#4574).
 *
 *   GET   /api/v1/admin/settings/system   -> hidden_nav_items
 *   PATCH /api/v1/admin/settings/system   { hidden_nav_items: [...] }
 *   GET   /api/v1/system/config           -> ui.hidden_nav_items (sidebar)
 *
 * Skips on a backend that predates the setting. Restores the original list
 * so the suite stays idempotent.
 */
const RUNTIME = '/api/v1/admin/settings/system';

async function readHidden(request: APIRequestContext): Promise<string[] | null> {
  const resp = await request.get(RUNTIME);
  expect(resp.ok(), `GET runtime settings failed: ${resp.status()}`).toBeTruthy();
  const body = await resp.json();
  return Array.isArray(body.hidden_nav_items) ? body.hidden_nav_items : null;
}

async function writeHidden(request: APIRequestContext, items: string[]) {
  const resp = await request.patch(RUNTIME, {
    data: { hidden_nav_items: items },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(resp.ok(), `PATCH runtime settings failed: ${resp.status()}`).toBeTruthy();
}

test.describe('Admin - Navigation visibility', () => {
  test('hiding an entry removes it from the sidebar but keeps the page reachable', async ({
    page,
    request,
  }) => {
    const original = await readHidden(request);
    test.skip(original === null, 'Backend predates hidden_nav_items (artifact-keeper#4574)');

    try {
      await writeHidden(request, []);

      await page.goto('/settings');
      await page.getByRole('tab', { name: /navigation/i }).click();
      const webhooks = page.getByRole('switch', {
        name: 'Show Integration / Webhooks in the sidebar',
      });
      await expect(webhooks).toBeChecked({ timeout: 10000 });

      // The Settings entry cannot be hidden.
      await expect(
        page.getByRole('switch', { name: 'Show Administration / Settings in the sidebar' })
      ).toBeDisabled();

      await webhooks.click();
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Navigation settings saved')).toBeVisible();

      const sidebar = page.locator('[data-sidebar="content"]').first();
      await expect(sidebar.getByRole('link', { name: 'Webhooks' })).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();

      const config = await (await request.get('/api/v1/system/config')).json();
      expect(config.ui.hidden_nav_items).toContain('/webhooks');

      // Navigation only: the page itself still loads.
      await page.goto('/webhooks');
      await expect(page.getByText(/webhook/i).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await writeHidden(request, original ?? []).catch(() => {});
    }
  });
});
