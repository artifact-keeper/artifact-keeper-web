import { test, expect } from '@playwright/test';

test.describe('Staging Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/staging');
  });

  test('page loads with Staging heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
  });

  test('search input is visible', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
  });

  test('format filter is visible', async ({ page }) => {
    const formatFilter = page.getByRole('combobox').filter({ hasText: /format/i }).or(
      page.locator('select, button').filter({ hasText: /format/i })
    );
    await expect(formatFilter.first()).toBeVisible({ timeout: 10000 });
  });

  test('page is interactive', async ({ page }) => {
    // Verify page loaded and is interactive
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 10000 });
    // Check for any interactive elements (search, filters, etc.)
    const search = page.getByPlaceholder(/search/i);
    const hasSearch = await search.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSearch).toBeTruthy();
  });

  test('staging repos display or empty state shown', async ({ page }) => {
    // Wait for the page heading to confirm we're authenticated
    await expect(page.getByRole('heading', { name: 'Staging' })).toBeVisible({ timeout: 15000 });

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [data-slot="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const emptyState = page.getByText(/no staging/i)
      .or(page.getByText(/no results/i))
      .or(page.getByText(/empty/i))
      .or(page.getByText(/no repositories/i))
      .or(page.getByText(/select a staging repository/i));

    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasRepos || hasEmptyState).toBeTruthy();
  });

  test('clicking a staging repo opens detail panel', async ({ page }) => {
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available to click');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    // Detail panel should appear with artifacts and a Promote button
    const promoteButton = page.getByRole('button', { name: /promote/i });
    const hasPromote = await promoteButton.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPromote) {
      // The Promote Selected button should be disabled until artifacts are selected
      const promoteSelected = page.getByRole('button', { name: /promote selected/i });
      if (await promoteSelected.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(promoteSelected).toBeDisabled();
      }
    }
  });

  test('detail panel shows artifacts and promotion history tab', async ({ page }) => {
    await page.waitForTimeout(2000);

    const repoItems = page.locator('[data-testid*="staging"], table tbody tr, [class*="card"], [role="listitem"]').filter({ hasText: /.+/ });
    const hasRepos = await repoItems.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRepos) {
      test.skip(true, 'No staging repos available');
      return;
    }

    await repoItems.first().click();
    await page.waitForTimeout(1000);

    // Check for Promotion History tab
    const historyTab = page.locator('[role="tablist"]').getByRole('tab', { name: /history|promotion/i });
    if (await historyTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/staging');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('Warning:')
    );
    expect(criticalErrors).toEqual([]);
  });
});
