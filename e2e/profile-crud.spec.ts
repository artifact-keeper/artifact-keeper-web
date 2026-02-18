import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
  switchTab,
  getDisplayNameInput,
} from './helpers/test-fixtures';

test.describe('Profile General Tab', () => {
  test('general tab shows display name and email', async ({ page }) => {
    await navigateTo(page, '/profile');

    await expect(getDisplayNameInput(page)).toBeVisible({ timeout: 10000 });

    const emailInput = page.getByLabel(/email/i).first()
      .or(page.locator('input[name="email"], input[type="email"]').first());
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test('can edit display name', async ({ page }) => {
    await navigateTo(page, '/profile');

    const displayNameInput = getDisplayNameInput(page);
    await expect(displayNameInput).toBeVisible({ timeout: 10000 });

    await displayNameInput.clear();
    await displayNameInput.fill('Admin User');

    const saveBtn = page.getByRole('button', { name: /save/i });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });
});

for (const tabName of ['API Keys', 'Access Tokens']) {
  test(`Profile ${tabName} Tab shows link card to Access Tokens page`, async ({ page }) => {
    await navigateTo(page, '/profile');
    await switchTab(page, new RegExp(tabName, 'i'));

    await expect(
      page.getByText(/moved to their own page/i).first()
    ).toBeVisible({ timeout: 10000 });

    const link = page.getByRole('link', { name: /manage access tokens/i });
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveAttribute('href', '/access-tokens');
  });
}

test.describe('Profile Security Tab', () => {
  test('security tab shows password change form', async ({ page }) => {
    await navigateTo(page, '/profile');
    await switchTab(page, /Security/i);

    await expect(
      page.getByText(/change password|current password|new password/i).first()
    ).toBeVisible({ timeout: 10000 });

    const currentPwInput = page.getByLabel(/current password/i).first()
      .or(page.locator('input[name="current_password"], input[name="currentPassword"]').first());
    await expect(currentPwInput).toBeVisible({ timeout: 5000 });

    const newPwInput = page.getByLabel(/new password/i).first()
      .or(page.locator('input[name="new_password"], input[name="newPassword"]').first());
    await expect(newPwInput).toBeVisible({ timeout: 5000 });

    const changeBtn = page.getByRole('button', { name: /change password|update password/i });
    await expect(changeBtn).toBeVisible({ timeout: 5000 });
  });

  test('security tab shows 2FA section', async ({ page }) => {
    await navigateTo(page, '/profile');
    await switchTab(page, /Security/i);

    await expect(
      page.getByText(/two-factor|2fa|authenticator|totp/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on profile page', async ({ page, consoleErrors }) => {
    await navigateTo(page, '/profile');

    const tabs = ['General', 'API Keys', 'Access Tokens', 'Security'];
    for (const tab of tabs) {
      const tabEl = page.locator('[role="tablist"]').getByText(new RegExp(tab, 'i'));
      const tabVisible = await tabEl.isVisible({ timeout: 3000 }).catch(() => false);
      if (tabVisible) {
        await tabEl.click();
        await page.waitForTimeout(1000);
      }
    }

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
