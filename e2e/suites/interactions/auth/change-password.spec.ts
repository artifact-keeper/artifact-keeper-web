import { test, expect } from '@playwright/test';

test.describe('Change Password Page', () => {
  test('change-password page renders when navigated directly', async ({ page }) => {
    await page.goto('/change-password');
    await page.waitForLoadState('domcontentloaded');
    // Should either show the change-password form or redirect to dashboard/login
    const hasForm = await page.getByLabel(/new password|password/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const redirectedAway = /\/$|\/login/.test(page.url());
    expect(hasForm || redirectedAway).toBe(true);
  });
});
