import { test, expect } from '@playwright/test';

test.describe('Users Management', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/users');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with User heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /user/i })).toBeVisible({ timeout: 10000 });
  });

  test('Create User button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create User opens dialog with form', async ({ page }) => {
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await expect(dialog.getByLabel(/username/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/display name/i)).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('dialog has Username, Email, Display Name, and Admin checkbox', async ({ page }) => {
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await expect(dialog.getByLabel(/username/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/display name/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/administrator/i)).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('Cancel closes the Create User dialog', async ({ page }) => {
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('users table shows admin user', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });
    await expect(table.getByRole('cell', { name: 'admin' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('admin user row shows Admin badge', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const adminRow = table.getByRole('row').filter({ hasText: 'admin' }).first();
    await expect(adminRow.getByText(/admin/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on page', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});

test.describe('Admin Token Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('domcontentloaded');
  });

  test('admin user row has View Tokens action', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Find the admin row and look for a tokens action
    const adminRow = table.getByRole('row').filter({ hasText: 'admin' }).first();
    const tokensButton = adminRow.getByRole('button', { name: /token/i });
    await expect(tokensButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking View Tokens opens token dialog', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const adminRow = table.getByRole('row').filter({ hasText: 'admin' }).first();
    await adminRow.getByRole('button', { name: /token/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/token/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('token dialog shows token list or empty state', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const adminRow = table.getByRole('row').filter({ hasText: 'admin' }).first();
    await adminRow.getByRole('button', { name: /token/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Wait for loading to finish before checking content
    await expect(dialog.getByText(/loading tokens/i)).not.toBeVisible({ timeout: 10000 });

    // Should show either token items (rendered as divs, not a table) or an empty state
    const hasTokens = await dialog.getByText(/revoke/i).first().isVisible().catch(() => false);
    const hasEmptyState = await dialog.getByText(/no.*token/i).isVisible().catch(() => false);
    expect(hasTokens || hasEmptyState).toBeTruthy();
  });

  test('token dialog can be closed', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const adminRow = table.getByRole('row').filter({ hasText: 'admin' }).first();
    await adminRow.getByRole('button', { name: /token/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Close the dialog
    const closeButton = dialog.getByRole('button', { name: /close|cancel|done/i });
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
