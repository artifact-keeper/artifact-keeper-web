import { test, expect } from '@playwright/test';

test.describe('Profile', () => {
  test('loads profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('My Profile')).toBeVisible({ timeout: 10000 });
  });

  test('shows general tab with user info', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('Profile Information')).toBeVisible({ timeout: 10000 });
    // Username value is in an input field
    await expect(page.locator('input[value="admin"]')).toBeVisible();
  });

  test('API keys tab loads without crashing', async ({ page }) => {
    await page.goto('/profile');
    // Target the tab trigger, not sidebar
    await page.locator('[role="tablist"] >> text=API Keys').click();
    await page.waitForTimeout(2000);
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('is not a function');
    expect(pageContent).not.toContain('Application error');
  });

  test('access tokens tab loads without crashing', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[role="tablist"] >> text=Access Tokens').click();
    await page.waitForTimeout(2000);
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('is not a function');
    expect(pageContent).not.toContain('Application error');
  });

  test('security tab loads', async ({ page }) => {
    await page.goto('/profile');
    // Target the tab trigger, not the sidebar "Security" section
    await page.locator('[role="tablist"] >> text=Security').click();
    await page.waitForTimeout(2000);
    await expect(
      page.getByText(/change password|current password|new password|two-factor|2fa/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
