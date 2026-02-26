import { test, expect } from '@playwright/test';

test.describe('Lifecycle Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/lifecycle');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Lifecycle heading', async ({ page }) => {
    const heading = page.getByRole('heading').filter({ hasText: /lifecycle/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('New Policy button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('Execute All button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /execute all/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('stat cards display policy information', async ({ page }) => {
    // Look for stat cards - labels may vary
    const totalPolicies = page.getByText(/total/i).first();
    const enabledPolicies = page.getByText(/enabled|active/i).first();
    const lastExecution = page.getByText(/last|execution|run/i).first();

    const hasTotal = await totalPolicies.isVisible({ timeout: 10000 }).catch(() => false);
    const hasEnabled = await enabledPolicies.isVisible({ timeout: 5000 }).catch(() => false);
    const hasLast = await lastExecution.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTotal || hasEnabled || hasLast).toBeTruthy();
  });

  test('clicking New Policy opens the create dialog', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
  });

  test('create dialog has form inputs', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Check for any input fields in the dialog
    const inputs = dialog.locator('input, textarea, select, [role="combobox"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);

    // Close dialog
    const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  });

  test('cancel closes the create dialog', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('policies table renders or shows empty state', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no.*polic|no.*data|no.*result|empty/i).first();

    await expect(table.or(emptyState)).toBeVisible();
  });

  test('no console errors on page load', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});
