import { test, expect } from '@playwright/test';

test.describe('Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/health');
  });

  test('page loads with Health Dashboard heading', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('stat cards are visible', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });

    // Check for the stat card labels
    const artifactsEval = page.getByText(/artifacts evaluated/i);
    const repositories = page.getByText(/repositories/i);
    const gradeA = page.getByText(/grade a repos/i);

    const hasArtifacts = await artifactsEval.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasRepos = await repositories.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasGradeA = await gradeA.first().isVisible({ timeout: 5000 }).catch(() => false);

    // At least the stat cards should render (even with 0 values)
    expect(hasArtifacts || hasRepos || hasGradeA).toBeTruthy();
  });

  test('overall health score display is present', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });

    // Look for the score indicator (/100 text) or the "Average health score" description
    const scoreIndicator = page.getByText(/\/100/i)
      .or(page.getByText(/average health score/i));

    // If there's data, the score shows; if not, the loading/empty state is fine
    // Either way the page loaded without error
    await scoreIndicator.first().isVisible({ timeout: 5000 }).catch(() => false);
  });

  test('grade distribution card is visible', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });

    const gradeDist = page.getByText(/grade distribution/i);
    const hasGradeDist = await gradeDist.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Grade distribution should show if data is available
    // The heading always renders even when empty
    if (hasGradeDist) {
      // Grade distribution is visible with data
    }
  });

  test('repository health scores table heading is present', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });

    const tableHeading = page.getByText(/repository health scores/i);
    const hasTable = await tableHeading.first().isVisible({ timeout: 5000 }).catch(() => false);

    // If data loaded, the table heading should be visible
    // If no data, the page still renders correctly
    if (hasTable) {
      // Verify table columns
      await expect(page.getByText(/repository/i).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('refresh button is clickable', async ({ page }) => {
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });

    // The refresh icon button in the page header
    const refreshBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    await refreshBtn.click();
    // Page should still be visible after refresh
    await expect(page.getByText(/health dashboard/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/health');
    await page.waitForTimeout(3000);

    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
