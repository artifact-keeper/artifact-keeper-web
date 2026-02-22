import { test, expect } from '@playwright/test';

test.describe('Builds', () => {
  test('page loads with Builds heading', async ({ page }) => {
    await page.goto('/builds');
    await expect(page.getByRole('heading', { name: /builds/i })).toBeVisible({ timeout: 10000 });
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(1000);

    await expect(page.getByPlaceholder(/search builds/i)).toBeVisible({ timeout: 10000 });
  });

  test('status filter dropdown is visible and has options', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(1000);

    // The status filter select trigger should be visible
    const statusTrigger = page.locator('button[role="combobox"]').filter({ hasText: /all statuses|status/i });
    await expect(statusTrigger).toBeVisible({ timeout: 10000 });

    // Open the status dropdown
    await statusTrigger.click();
    await page.waitForTimeout(500);

    // Verify the dropdown options
    await expect(page.getByRole('option', { name: /all statuses/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /success/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /failed/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /running/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /pending/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /cancelled/i })).toBeVisible({ timeout: 5000 });

    // Close by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('sort dropdown works and has expected options', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(1000);

    // The sort select trigger should show "Date" by default
    const sortTrigger = page.locator('button[role="combobox"]').filter({ hasText: /date/i });
    await expect(sortTrigger).toBeVisible({ timeout: 10000 });

    // Open the sort dropdown
    await sortTrigger.click();
    await page.waitForTimeout(500);

    // Verify sort options
    await expect(page.getByRole('option', { name: /date/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /build number/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: /duration/i })).toBeVisible({ timeout: 5000 });

    // Select "Build Number" sort
    await page.getByRole('option', { name: /build number/i }).click();
    await page.waitForTimeout(500);

    // Verify the trigger now shows build number
    await expect(
      page.locator('button[role="combobox"]').filter({ hasText: /build number/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('builds table renders or shows empty state', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(2000);

    // Either the table with builds is shown, or the empty state is shown
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no builds found/i).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmptyState).toBeTruthy();

    if (hasTable) {
      // Verify table headers
      await expect(page.getByRole('columnheader', { name: /build/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('columnheader', { name: /started/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('columnheader', { name: /duration/i })).toBeVisible({ timeout: 10000 });
    }
  });

  test('pagination controls are visible when builds data exists', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(2000);

    // Pagination is only shown when totalPages > 1
    // Use soft assertion since data may not have enough pages
    const paginationVisible = await page.getByText(/page \d+ of \d+/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (paginationVisible) {
      await expect(page.getByRole('button', { name: /previous/i })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /next/i })).toBeVisible({ timeout: 5000 });
    }

    // Also verify the builds count summary is shown
    const countSummary = page.getByText(/\d+ builds? found/i);
    await expect(countSummary).toBeVisible({ timeout: 10000 });
  });

  test('clicking a build row opens detail dialog with Overview and Modules tabs', async ({ page }) => {
    await page.goto('/builds');
    await page.waitForTimeout(2000);

    // Check if there are any build rows to click
    const buildRows = page.locator('table tbody tr');
    const rowCount = await buildRows.count().catch(() => 0);

    if (rowCount === 0) {
      // No builds exist - skip gracefully
      test.skip();
      return;
    }

    // Click the first build row
    await buildRows.first().click();
    await page.waitForTimeout(500);

    // Dialog should open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Dialog should have Overview and Modules tabs
    const dialogTablist = dialog.locator('[role="tablist"]');
    await expect(dialogTablist.getByRole('tab', { name: /overview/i })).toBeVisible({ timeout: 10000 });
    await expect(dialogTablist.getByRole('tab', { name: /modules/i })).toBeVisible({ timeout: 10000 });

    // Overview tab should show build information
    await expect(dialog.getByText(/status/i).first()).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/duration/i).first()).toBeVisible({ timeout: 10000 });

    // Switch to Modules tab
    await dialogTablist.getByRole('tab', { name: /modules/i }).click();
    await page.waitForTimeout(500);

    // Close the dialog via the X button
    await dialog.locator('[data-slot="dialog-close"]').first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('page loads without console errors or crashes', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/builds');
    await page.waitForTimeout(2000);

    // The page should have loaded without crashing
    await expect(page.getByRole('heading', { name: /builds/i })).toBeVisible({ timeout: 10000 });

    // Filter out known noise (e.g., failed API fetches are acceptable)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('favicon') && !err.includes('net::') && !err.includes('Failed to load resource')
    );
    expect(criticalErrors).toEqual([]);
  });
});
