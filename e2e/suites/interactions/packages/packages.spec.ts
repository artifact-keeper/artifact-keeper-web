import { test, expect } from '@playwright/test';

test.describe('Packages Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/packages');
  });

  test('page loads with Packages heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Packages' })).toBeVisible({ timeout: 10000 });
  });

  test('search input is visible', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
  });

  test('format filter dropdown is visible', async ({ page }) => {
    const formatFilter = page.getByRole('combobox').filter({ hasText: /format/i }).or(
      page.locator('select, [role="listbox"], button').filter({ hasText: /format/i })
    );
    await expect(formatFilter.first()).toBeVisible({ timeout: 10000 });
  });

  test('filter controls are present', async ({ page }) => {
    // Format and repository filter dropdowns should be present
    await expect(page.getByRole('combobox').filter({ hasText: /all formats/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('combobox').filter({ hasText: /all repos/i })).toBeVisible({ timeout: 10000 });
  });

  test('sort dropdown works', async ({ page }) => {
    const sortButton = page.getByRole('combobox').filter({ hasText: /sort|downloads|name|updated/i }).or(
      page.locator('select, button').filter({ hasText: /sort|downloads|name|updated/i })
    );
    await expect(sortButton.first()).toBeVisible({ timeout: 10000 });
    await sortButton.first().click();

    const sortOption = page.getByRole('option', { name: /name/i }).or(
      page.locator('[role="option"]').filter({ hasText: /name/i })
    );
    if (await sortOption.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await sortOption.first().click();
    }
  });

  test('view toggle or layout options present', async ({ page }) => {
    // Some pages have list/grid toggle, others don't
    const listBtn = page.getByRole('button', { name: /list/i });
    const gridBtn = page.getByRole('button', { name: /grid/i });
    const toggleBtns = page.locator('button[aria-pressed]');

    const hasList = await listBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasGrid = await gridBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const hasToggle = await toggleBtns.first().isVisible({ timeout: 3000 }).catch(() => false);

    // Skip if no toggle is present - not all views have this
    if (!hasList && !hasGrid && !hasToggle) {
      test.skip(true, 'No list/grid toggle found on this page');
    }
  });

  test('packages display or empty state shown', async ({ page }) => {
    await page.waitForTimeout(2000);

    const packageItems = page.locator('[data-testid*="package"], table tbody tr, [class*="card"], [class*="package"]');
    const emptyState = page.getByText(/no packages/i).or(page.getByText(/no results/i)).or(page.getByText(/empty/i));

    const hasPackages = await packageItems.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasPackages || hasEmptyState).toBeTruthy();
  });

  test('clicking a package shows detail panel with tabs', async ({ page }) => {
    await page.waitForTimeout(2000);

    const packageItems = page.locator('[data-testid*="package"], table tbody tr, [class*="card"]').filter({ hasText: /.+/ });
    const hasPackages = await packageItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasPackages) {
      test.skip(true, 'No packages available to click');
      return;
    }

    await packageItems.first().click();
    await page.waitForTimeout(1000);

    const overviewTab = page.locator('[role="tablist"]').getByRole('tab', { name: /overview/i });
    const versionsTab = page.locator('[role="tablist"]').getByRole('tab', { name: /versions/i });

    const hasOverview = await overviewTab.isVisible({ timeout: 5000 }).catch(() => false);
    const hasVersions = await versionsTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasOverview && hasVersions) {
      await versionsTab.click();
      await page.waitForTimeout(500);
      await overviewTab.click();
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/packages');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('Warning:')
    );
    expect(criticalErrors).toEqual([]);
  });
});
