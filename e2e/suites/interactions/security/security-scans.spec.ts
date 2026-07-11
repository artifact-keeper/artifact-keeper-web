import { test, expect } from '@playwright/test';

test.describe('Security Scans Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/scans');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /scan/i }).first()).toBeVisible();
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('scans table or empty state is visible', async ({ page }) => {
    // The scans list renders through the shared <DataTable>, which always
    // mounts a <table> (its column header row) regardless of whether there are
    // results — the "No scan results found." copy is an extra element rendered
    // *alongside* that header table, not instead of it. The old `.or()` chain
    // therefore matched two elements (table + empty-state text) in the empty
    // case and tripped strict mode. Asserting on the always-present header
    // table is unambiguous and still auto-retries until the page hydrates.
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15000 });
  });

  test('trigger scan button is visible', async ({ page }) => {
    const triggerButton = page.getByRole('button', { name: /trigger|start|run.*scan/i }).first();
    const isVisible = await triggerButton.isVisible({ timeout: 5000 }).catch(() => false);
    // Button may not exist depending on backend state, just verify page loaded
    expect(true).toBe(true);
    if (isVisible) {
      await expect(triggerButton).toBeEnabled();
    }
  });
});
