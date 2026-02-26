import { test, expect } from '@playwright/test';

test.describe('Permissions Management', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto('/permissions');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Permission heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /permission/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Create Permission button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /create permission/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create Permission opens dialog', async ({ page }) => {
    await page.getByRole('button', { name: /create permission/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('dialog has Principal Type and Target Type selectors', async ({ page }) => {
    await page.getByRole('button', { name: /create permission/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await expect(dialog.getByText(/principal type/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/target type/i)).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('dialog has action checkboxes for Read, Write, Delete, Admin', async ({ page }) => {
    await page.getByRole('button', { name: /create permission/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await expect(dialog.getByLabel(/read/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/write/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/delete/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel(/admin/i)).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('Cancel closes the Create Permission dialog', async ({ page }) => {
    await page.getByRole('button', { name: /create permission/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('permissions table renders or shows empty state', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no permission/i);

    await expect(table.or(emptyState)).toBeVisible();
  });

  test('no console errors on page', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});
