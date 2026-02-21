import { test, expect } from '@playwright/test';

test.describe('Groups Management', () => {
  test('page loads with Group heading', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.getByText(/group/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('Create Group button visible', async ({ page }) => {
    await page.goto('/groups');
    await expect(
      page.getByRole('button', { name: /create.*group/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('click Create opens dialog', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('button', { name: /create.*group/i }).first().click();
    await expect(
      page.getByRole('dialog').or(page.locator('[role="dialog"]'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('dialog has Name and Description fields', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('button', { name: /create.*group/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // Name field
    await expect(
      page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i)).first()
    ).toBeVisible({ timeout: 5000 });
    // Description field
    await expect(
      page.getByLabel(/description/i).or(page.getByPlaceholder(/description/i)).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('cancel closes dialog', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('button', { name: /create.*group/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('groups table renders or shows empty state', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForTimeout(3000);
    // Either a table with group rows or an empty state message
    const hasTable = await page.locator('table').or(page.locator('[role="table"]')).isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/no groups|empty|no.*found|get started/i).first().isVisible().catch(() => false);
    expect(hasTable || hasEmptyState).toBeTruthy();
  });

  test('no console errors on groups page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/groups');
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
