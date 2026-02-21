import { test, expect } from '@playwright/test';

test.describe('Migration Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/migration');
  });

  test('page loads with Migration heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /migration/i })).toBeVisible({ timeout: 10000 });
  });

  test('Source Connections tab is visible', async ({ page }) => {
    await expect(page.getByRole('tablist').getByRole('tab', { name: /source connections/i })).toBeVisible({ timeout: 10000 });
  });

  test('Add Connection button is visible on Source Connections tab', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /source connections/i }).click();
    await expect(page.getByRole('button', { name: /add connection/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking Add Connection opens a dialog', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /source connections/i }).click();
    await page.getByRole('button', { name: /add connection/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('Create Connection dialog has Name, URL, and Auth Type fields', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /source connections/i }).click();
    await page.getByRole('button', { name: /add connection/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    await expect(page.getByLabel(/name/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/endpoint url/i).or(page.getByLabel(/url/i))).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/authentication type|auth type/i).first()).toBeVisible({ timeout: 10000 });

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('Auth Type toggle changes visible inputs', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /source connections/i }).click();
    await page.getByRole('button', { name: /add connection/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    // Select API Token auth type
    const authTypeSelect = page.getByRole('dialog').locator('select, [role="combobox"]').filter({ hasText: /token|basic/i }).first();
    const hasAuthSelect = await authTypeSelect.count();

    if (hasAuthSelect > 0) {
      // Try selecting Basic Auth to see username/password fields
      await authTypeSelect.click();
      const basicOption = page.getByRole('option', { name: /basic/i });
      if (await basicOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await basicOption.click();
        await expect(
          page.getByLabel(/username/i).or(page.getByPlaceholder(/username/i))
        ).toBeVisible({ timeout: 10000 });
      }
    }

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('Cancel button closes the Create Connection dialog', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /source connections/i }).click();
    await page.getByRole('button', { name: /add connection/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });
  });

  test('Migration Jobs tab loads', async ({ page }) => {
    const jobsTab = page.getByRole('tablist').getByRole('tab', { name: /migration jobs/i });
    await expect(jobsTab).toBeVisible({ timeout: 10000 });
    await jobsTab.click();

    // The tab content should render - either a table or an empty state
    await expect(
      page.getByRole('table').or(page.getByText(/no migration/i)).or(page.getByText(/no jobs/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('Create Migration button is visible on Jobs tab', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /migration jobs/i }).click();
    await expect(page.getByRole('button', { name: /create migration/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Create Migration button exists on Jobs tab (may be disabled without connections)', async ({ page }) => {
    await page.getByRole('tablist').getByRole('tab', { name: /migration jobs/i }).click();
    const createBtn = page.getByRole('button', { name: /create migration/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });

    // Button may be disabled if no source connections are configured
    const isDisabled = await createBtn.isDisabled();
    if (isDisabled) {
      // That's expected - no source connections configured
      return;
    }

    // If enabled, try to click and verify dialog
    await createBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('no console errors on the page', async ({ page }) => {
    // Wait for page to fully load
    await expect(page.getByRole('heading', { name: /migration/i })).toBeVisible({ timeout: 10000 });

    // Filter out known non-critical errors (e.g., network resource loading)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('favicon') && !err.includes('net::') && !err.includes('Failed to load resource')
    );
    expect(criticalErrors).toEqual([]);
  });
});
