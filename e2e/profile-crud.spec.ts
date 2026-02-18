import { test, expect } from '@playwright/test';

test.describe('Profile General Tab', () => {
  test('general tab shows display name and email', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('My Profile').or(page.getByText(/profile/i).first())).toBeVisible({ timeout: 10000 });

    // Display Name input should be visible
    const displayNameInput = page.getByLabel('Display Name')
      .or(page.locator('input[placeholder="Your display name"]'));
    await expect(displayNameInput).toBeVisible({ timeout: 10000 });

    // Email field should be visible (may be disabled)
    const emailInput = page.getByLabel(/email/i).first()
      .or(page.locator('input[name="email"], input[type="email"]').first());
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test('can edit display name', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const displayNameInput = page.getByLabel('Display Name')
      .or(page.locator('input[placeholder="Your display name"]'));
    await expect(displayNameInput).toBeVisible({ timeout: 10000 });

    // Clear and type a new name
    await displayNameInput.clear();
    await displayNameInput.fill('Admin User');

    // Save Changes button should be visible
    const saveBtn = page.getByRole('button', { name: /save/i });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Profile API Keys Tab - Link Card', () => {
  test('API Keys tab shows link card to Access Tokens page', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[role="tablist"]').getByText(/API Keys/i).click();
    await page.waitForTimeout(1000);

    // Should show a message that tokens have moved
    await expect(
      page.getByText(/moved to their own page/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Should have a link to /access-tokens
    const link = page.getByRole('link', { name: /manage access tokens/i });
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveAttribute('href', '/access-tokens');
  });
});

test.describe('Profile Access Tokens Tab - Link Card', () => {
  test('Access Tokens tab shows link card to Access Tokens page', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[role="tablist"]').getByText(/Access Tokens/i).click();
    await page.waitForTimeout(1000);

    // Should show a message that tokens have moved
    await expect(
      page.getByText(/moved to their own page/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Should have a link to /access-tokens
    const link = page.getByRole('link', { name: /manage access tokens/i });
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveAttribute('href', '/access-tokens');
  });
});

test.describe('Profile Security Tab', () => {
  test('security tab shows password change form', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[role="tablist"]').getByText(/Security/i).click();
    await page.waitForTimeout(1000);

    // Password change fields
    await expect(
      page.getByText(/change password|current password|new password/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Current password input
    const currentPwInput = page.getByLabel(/current password/i).first()
      .or(page.locator('input[name="current_password"], input[name="currentPassword"]').first());
    await expect(currentPwInput).toBeVisible({ timeout: 5000 });

    // New password input
    const newPwInput = page.getByLabel(/new password/i).first()
      .or(page.locator('input[name="new_password"], input[name="newPassword"]').first());
    await expect(newPwInput).toBeVisible({ timeout: 5000 });

    // Change Password button
    const changeBtn = page.getByRole('button', { name: /change password|update password/i });
    await expect(changeBtn).toBeVisible({ timeout: 5000 });
  });

  test('security tab shows 2FA section', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[role="tablist"]').getByText(/Security/i).click();
    await page.waitForTimeout(1000);

    // 2FA / Two-Factor Authentication section
    await expect(
      page.getByText(/two-factor|2fa|authenticator|totp/i).first()
    ).toBeVisible({ timeout: 10000 });

    // The 2FA section should be visible
    const tfaSectionVisible = await page.getByText(/two-factor|2fa/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(tfaSectionVisible).toBeTruthy();
  });

  test('no console errors on profile page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/profile');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Navigate through all tabs
    const tabs = ['General', 'API Keys', 'Access Tokens', 'Security'];
    for (const tab of tabs) {
      const tabEl = page.locator('[role="tablist"]').getByText(new RegExp(tab, 'i'));
      const tabVisible = await tabEl.isVisible({ timeout: 3000 }).catch(() => false);
      if (tabVisible) {
        await tabEl.click();
        await page.waitForTimeout(1000);
      }
    }

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource') &&
        (e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read'))
    );
    expect(criticalErrors).toEqual([]);
  });
});
