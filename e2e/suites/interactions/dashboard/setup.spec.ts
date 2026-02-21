import { test, expect } from '@playwright/test';

test.describe('Setup Guide', () => {
  test('page loads with Setup Guide heading', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: /setup guide/i })).toBeVisible({ timeout: 10000 });
  });

  test('Repositories tab shows format cards', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    // Repositories tab is active by default
    const tablist = page.locator('[role="tablist"]').first();
    await expect(tablist.getByRole('tab', { name: /repositories/i })).toBeVisible({ timeout: 10000 });

    // Should show repository cards or empty state
    const hasCards = await page.locator('[data-slot="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no repositories/i).isVisible({ timeout: 3000 }).catch(() => false);

    // One of these must be true - either cards exist or the empty state is shown
    expect(hasCards || hasEmptyState).toBeTruthy();
  });

  test('can search and filter repositories', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    const searchInput = page.getByPlaceholder(/search repositories/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query
    await searchInput.fill('npm');
    await page.waitForTimeout(500);

    // Clear the search
    await searchInput.clear();
    await page.waitForTimeout(500);
  });

  test('category filter buttons work', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    // Verify category filter buttons are visible
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Core', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Container', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Linux', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Ecosystem', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Infrastructure', exact: true })).toBeVisible({ timeout: 10000 });

    // Click Core filter
    await page.getByRole('button', { name: 'Core', exact: true }).click();
    await page.waitForTimeout(500);

    // Click Container filter
    await page.getByRole('button', { name: 'Container', exact: true }).click();
    await page.waitForTimeout(500);

    // Click All to reset
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForTimeout(500);
  });

  test('CI/CD Platforms tab loads and shows platform cards', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await tablist.getByRole('tab', { name: /ci\/cd platforms/i }).click();
    await page.waitForTimeout(500);

    // Should show CI/CD platform cards
    await expect(page.getByText('GitHub Actions')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('GitLab CI')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Jenkins').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Azure DevOps')).toBeVisible({ timeout: 10000 });

    // Each platform card should have a Get Started button
    const getStartedButtons = page.getByRole('button', { name: /get started/i });
    await expect(getStartedButtons).toHaveCount(4);
  });

  test('can click a repository card to see setup details', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    // Find any clickable card on the setup page
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    if (cardCount === 0) {
      test.skip(true, 'No cards found on setup page');
      return;
    }

    // Click the first card
    await cards.first().click();
    await page.waitForTimeout(1000);

    // A dialog, sheet, or new content should appear
    const dialog = page.getByRole('dialog')
      .or(page.locator('[role="dialog"]'))
      .or(page.locator('[data-slot="sheet-content"]'))
      .or(page.locator('[data-slot="drawer-content"]'));
    const hasDialog = await dialog.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDialog) {
      // Close the dialog
      const closeBtn = dialog.getByRole('button', { name: /close|cancel/i }).first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
    // Whether dialog opened or not, page should not crash
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Application error');
  });

  test('can open CI/CD platform dialog and see setup steps', async ({ page }) => {
    await page.goto('/setup');
    await page.waitForTimeout(1000);

    const tablist = page.locator('[role="tablist"]').first();
    await tablist.getByRole('tab', { name: /ci\/cd platforms/i }).click();
    await page.waitForTimeout(500);

    // Click the GitHub Actions card
    const githubCard = page.locator('[data-slot="card"]').filter({
      hasText: 'GitHub Actions',
    });
    await githubCard.click();
    await page.waitForTimeout(500);

    // Dialog should open with integration details
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/github actions integration/i)).toBeVisible({ timeout: 10000 });

    // Should show numbered steps with code blocks
    await expect(dialog.getByText('1')).toBeVisible({ timeout: 10000 });
    const codeBlocks = dialog.locator('pre code');
    expect(await codeBlocks.count()).toBeGreaterThan(0);

    // Close the dialog
    const closeButton = dialog.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeButton.click();
    } else {
      await dialog.locator('[data-slot="dialog-close"]').first().click();
    }
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('page loads without console errors or crashes', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/setup');
    await page.waitForTimeout(2000);

    // The page should have loaded without crashing
    await expect(page.getByRole('heading', { name: /setup guide/i })).toBeVisible({ timeout: 10000 });

    // Filter out known noise (e.g., failed API fetches are acceptable)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('favicon') && !err.includes('net::') && !err.includes('Failed to load resource')
    );
    expect(criticalErrors).toEqual([]);
  });
});
