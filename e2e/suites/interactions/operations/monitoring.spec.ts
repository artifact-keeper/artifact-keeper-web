import { test, expect } from '@playwright/test';

test.describe('Monitoring Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/monitoring');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with monitoring heading', async ({ page }) => {
    const heading = page.getByRole('heading').filter({ hasText: /monitor|health/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Run Health Check button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /run health check/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('service status section is visible', async ({ page }) => {
    // Service status cards are displayed in a grid; look for status indicators or card content
    const statusSection = page.locator('[class*="grid"]').first();
    const hasCards = await statusSection.isVisible().catch(() => false);

    if (hasCards) {
      await expect(statusSection).toBeVisible({ timeout: 10000 });
    } else {
      // Fallback: look for any text mentioning status or service names
      const statusText = page.getByText(/status|service/i).first();
      await expect(statusText).toBeVisible({ timeout: 10000 });
    }
  });

  test('health status filter is visible', async ({ page }) => {
    // The filter is a dropdown/select for filtering by health status
    const filter = page.getByRole('combobox').or(
      page.locator('button').filter({ hasText: /all|healthy|warning|failed/i })
    ).first();
    await expect(filter).toBeVisible({ timeout: 10000 });
  });

  test('health log table renders or shows empty state', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no.*log|no.*data|no.*record|no.*result|empty/i).first();

    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(tableVisible || emptyVisible).toBeTruthy();

    if (tableVisible) {
      // Verify expected column headers exist
      const headers = page.getByRole('columnheader');
      const headerTexts = await headers.allTextContents();
      const joined = headerTexts.join(' ').toLowerCase();
      expect(joined).toMatch(/service|status|message|time/i);
    }
  });

  test('no console errors on page load', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});
