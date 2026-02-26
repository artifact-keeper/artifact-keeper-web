import { test, expect } from '@playwright/test';

test.describe('License Policies Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/license-policies');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with License heading', async ({ page }) => {
    const heading = page.getByRole('heading').filter({ hasText: /license/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Create Policy button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /create policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create Policy opens dialog with fields', async ({ page }) => {
    const button = page.getByRole('button', { name: /create policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // Description
    const descInput = dialog.getByLabel(/description/i).or(dialog.getByPlaceholder(/description/i)).first();
    await expect(descInput).toBeVisible({ timeout: 10000 });

    // Allowed Licenses field
    const allowedField = dialog.getByLabel(/allowed/i).or(dialog.getByPlaceholder(/allowed/i)).first();
    await expect(allowedField).toBeVisible({ timeout: 10000 });

    // Denied Licenses field
    const deniedField = dialog.getByLabel(/denied/i).or(dialog.getByPlaceholder(/denied/i)).first();
    await expect(deniedField).toBeVisible({ timeout: 10000 });
  });

  test('dialog has Name, Description, and Action dropdown', async ({ page }) => {
    const button = page.getByRole('button', { name: /create policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i)).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // Description
    const descInput = dialog.getByLabel(/description/i).or(dialog.getByPlaceholder(/description/i)).first();
    await expect(descInput).toBeVisible({ timeout: 10000 });

    // Action dropdown (Allow/Warn/Block)
    const actionSelect = dialog.getByLabel(/action/i).or(
      dialog.locator('button').filter({ hasText: /allow|warn|block|action/i })
    ).first();
    await expect(actionSelect).toBeVisible({ timeout: 10000 });
  });

  test('cancel closes the create dialog', async ({ page }) => {
    const button = page.getByRole('button', { name: /create policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('table renders or shows empty state', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no.*polic|no.*data|no.*result|empty/i).first();

    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);

    expect(tableVisible || emptyVisible).toBeTruthy();

    if (tableVisible) {
      const headers = page.getByRole('columnheader');
      const headerTexts = await headers.allTextContents();
      const joined = headerTexts.join(' ').toLowerCase();
      expect(joined).toMatch(/name|action|status/i);
    }
  });

  test('no console errors on page load', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});
