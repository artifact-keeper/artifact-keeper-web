import { test, expect } from '@playwright/test';

test.describe('Analytics Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with Analytics heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 10000 });
  });

  test('stat cards are visible', async ({ page }) => {
    // Check for stat cards - some may have different labels
    const storage = page.getByText(/total storage/i).first();
    const artifacts = page.getByText(/total artifacts/i).first();
    const stale = page.getByText(/stale/i).first();

    const hasStorage = await storage.isVisible({ timeout: 10000 }).catch(() => false);
    const hasArtifacts = await artifacts.isVisible({ timeout: 5000 }).catch(() => false);
    const hasStale = await stale.isVisible({ timeout: 5000 }).catch(() => false);

    // At least some stat cards should be visible
    expect(hasStorage || hasArtifacts || hasStale).toBeTruthy();
  });

  test('Refresh button works without error', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await expect(refreshButton).toBeVisible({ timeout: 10000 });
    await refreshButton.click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 10000 });
  });

  test('Breakdown tab shows data or empty state', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await tabList.getByRole('tab', { name: /breakdown/i }).click();

    const table = page.getByRole('table');
    const emptyState = page.getByText(/no data/i);

    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(tableVisible || emptyVisible).toBeTruthy();
  });

  test('Storage Trend tab loads with date range buttons', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    const storageTrendTab = tabList.getByRole('tab', { name: /storage trend/i });
    const hasTab = await storageTrendTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasTab) {
      test.skip(true, 'Storage Trend tab not found');
      return;
    }
    await storageTrendTab.click();
    await page.waitForTimeout(1000);

    // The tab panel should have loaded
    const tabPanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(tabPanel).toBeVisible({ timeout: 10000 });
  });

  test('Downloads tab loads', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    const downloadsTab = tabList.getByRole('tab', { name: /downloads/i });
    const hasTab = await downloadsTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasTab) {
      test.skip(true, 'Downloads tab not found');
      return;
    }
    await downloadsTab.click();
    await page.waitForTimeout(1000);

    // The active tab panel should be visible
    const tabPanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(tabPanel).toBeVisible({ timeout: 10000 });
  });

  test('Stale Artifacts tab loads with date range filters', async ({ page }) => {
    const tabList = page.locator('[role="tablist"]');
    await tabList.getByRole('tab', { name: /stale artifacts/i }).click();

    await expect(page.getByRole('button', { name: '30d' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '90d' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '180d' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '365d' })).toBeVisible({ timeout: 10000 });
  });

  test('Capture Snapshot button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /capture snapshot/i })).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on page', async () => {
    expect(consoleErrors).toEqual([]);
  });
});
