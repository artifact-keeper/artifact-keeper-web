import { test, expect } from '@playwright/test';

test.describe('Telemetry Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/telemetry');
  });

  test('page loads with Telemetry heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });
  });

  test('stat cards are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });

    // Check for key stat cards
    await expect(
      page.getByText(/telemetry status/i).or(page.getByText(/enabled|disabled/i).first())
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/crash reports/i).first()
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/pending reports/i).or(page.getByText(/pending/i).first())
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/pii scrub/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('settings toggles are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });

    // Enable Telemetry toggle
    await expect(
      page.getByText(/enable telemetry/i)
    ).toBeVisible({ timeout: 10000 });

    // Review Before Send toggle
    await expect(
      page.getByText(/review before send/i)
    ).toBeVisible({ timeout: 10000 });

    // Include Logs toggle
    await expect(
      page.getByText(/include logs/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('PII Scrub Level section is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });

    // PII scrub section should be present
    const piiText = page.getByText(/pii scrub/i).first();
    const hasPii = await piiText.isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasPii).toBeTruthy();
  });

  test('crash reports table renders or shows empty state', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });

    // Either the table with crash reports or an empty state message
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no crash reports/i).or(page.getByText(/no reports/i)).or(page.getByText(/no data/i));

    await expect(
      table.or(emptyState).first()
    ).toBeVisible({ timeout: 10000 });

    // If a table is present, verify expected column headers exist
    if (await table.isVisible().catch(() => false)) {
      const headers = page.getByRole('columnheader');
      const headerCount = await headers.count();
      if (headerCount > 0) {
        const headerTexts = await headers.allTextContents();
        const joinedHeaders = headerTexts.join(' ').toLowerCase();
        // At least some of the expected columns should be present
        const hasExpectedColumns =
          joinedHeaders.includes('error') ||
          joinedHeaders.includes('component') ||
          joinedHeaders.includes('severity') ||
          joinedHeaders.includes('count');
        expect(hasExpectedColumns).toBeTruthy();
      }
    }
  });

  test('no console errors on the page', async ({ page }) => {
    // Wait for page to fully load
    await expect(page.getByRole('heading', { name: /telemetry/i })).toBeVisible({ timeout: 10000 });

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('favicon') && !err.includes('404')
    );
    expect(criticalErrors).toEqual([]);
  });
});
