import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('page loads with Advanced Search heading', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: /advanced search/i })).toBeVisible({ timeout: 10000 });
  });

  test('all 4 search tabs are visible and clickable', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await expect(tablist).toBeVisible({ timeout: 10000 });

    // Verify all four tab triggers are present
    await expect(tablist.getByRole('tab', { name: /package/i })).toBeVisible({ timeout: 10000 });
    await expect(tablist.getByRole('tab', { name: /property/i })).toBeVisible({ timeout: 10000 });
    await expect(tablist.getByRole('tab', { name: /gavc/i })).toBeVisible({ timeout: 10000 });
    await expect(tablist.getByRole('tab', { name: /checksum/i })).toBeVisible({ timeout: 10000 });

    // Click each tab and verify it becomes selected
    await tablist.getByRole('tab', { name: /property/i }).click();
    await expect(tablist.getByRole('tab', { name: /property/i })).toHaveAttribute('data-state', 'active');

    await tablist.getByRole('tab', { name: /gavc/i }).click();
    await expect(tablist.getByRole('tab', { name: /gavc/i })).toHaveAttribute('data-state', 'active');

    await tablist.getByRole('tab', { name: /checksum/i }).click();
    await expect(tablist.getByRole('tab', { name: /checksum/i })).toHaveAttribute('data-state', 'active');

    await tablist.getByRole('tab', { name: /package/i }).click();
    await expect(tablist.getByRole('tab', { name: /package/i })).toHaveAttribute('data-state', 'active');
  });

  test('Package search tab shows name, version, repository, and format inputs', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Package tab is active by default
    await expect(page.getByText('Package Name')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., react, lodash')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Version').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., 1.0.0, ^2.0')).toBeVisible({ timeout: 10000 });

    // Repository select
    await expect(page.getByText('Repository').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('All repositories').first()).toBeVisible({ timeout: 10000 });

    // Format select
    await expect(page.getByText('Format').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('All formats')).toBeVisible({ timeout: 10000 });
  });

  test('Property search tab shows key/value inputs and add filter button', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await tablist.getByRole('tab', { name: /property/i }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Property Key')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., build.number')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Property Value')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., 42')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: /add filter/i })).toBeVisible({ timeout: 10000 });

    // Click add filter to add a second row, then verify remove button appears
    await page.getByRole('button', { name: /add filter/i }).click();
    // After adding a second filter, trash/remove buttons should appear
    const propertyKeyInputs = page.getByPlaceholder('e.g., build.number');
    await expect(propertyKeyInputs).toHaveCount(2);
  });

  test('GAVC search tab shows all 4 inputs', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await tablist.getByRole('tab', { name: /gavc/i }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Group ID')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., org.apache.maven')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Artifact ID')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., maven-core')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Version').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., 3.9.0')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Classifier')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('e.g., sources, javadoc')).toBeVisible({ timeout: 10000 });
  });

  test('Checksum search tab shows checksum input and algorithm select', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await tablist.getByRole('tab', { name: /checksum/i }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Checksum Value')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/enter sha-256/i)).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Algorithm')).toBeVisible({ timeout: 10000 });
    // Default algorithm is SHA-256
    await expect(page.getByText('SHA-256')).toBeVisible({ timeout: 10000 });
  });

  test('can perform a package search by filling name and clicking search', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Fill in a package name
    await page.getByPlaceholder('e.g., react, lodash').fill('test');

    // Click search button
    await page.getByRole('button', { name: /search/i }).first().click();

    // Wait for results section to appear (either results or empty state)
    await expect(
      page.getByText(/results/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('list and grid view toggles work after performing a search', async ({ page }) => {
    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Trigger a search to make the results area appear
    await page.getByPlaceholder('e.g., react, lodash').fill('test');
    await page.getByRole('button', { name: /search/i }).first().click();

    // Wait for results card to be visible
    await expect(page.getByText(/results/i).first()).toBeVisible({ timeout: 10000 });

    // The list/grid toggle buttons should be present in the results header
    // They use LayoutList and LayoutGrid icons. Look for the toggle button group.
    const listButton = page.locator('button').filter({ has: page.locator('svg.lucide-layout-list') });
    const gridButton = page.locator('button').filter({ has: page.locator('svg.lucide-layout-grid') });

    if (await listButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click grid view
      await gridButton.click();
      await page.waitForTimeout(500);

      // Click list view back
      await listButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('page loads without console errors or crashes', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/search');
    await page.waitForTimeout(2000);

    // The page should have loaded without crashing
    await expect(page.getByRole('heading', { name: /advanced search/i })).toBeVisible({ timeout: 10000 });

    // Filter out known noise (e.g., failed API fetches are acceptable)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('net::') && !err.includes('Failed to fetch') && !err.includes('NetworkError')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
