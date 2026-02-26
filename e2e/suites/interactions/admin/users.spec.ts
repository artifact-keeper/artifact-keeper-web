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
