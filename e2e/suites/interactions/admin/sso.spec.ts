import { test, expect } from '@playwright/test';

test.describe('SSO Settings', () => {
  test('SSO page loads', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.getByText(/sso|single sign|authentication/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('OIDC tab visible and shows create button', async ({ page }) => {
    await page.goto('/settings/sso');
    await expect(page.getByText(/oidc/i).first()).toBeVisible({ timeout: 10000 });
    // Click the OIDC tab
    await page.locator('[role="tablist"] >> text=OIDC').first().click();
    await expect(
      page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('LDAP tab loads with create button', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=LDAP').first().click();
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('SAML tab loads with create button', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=SAML').first().click();
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('click Create OIDC opens dialog with form fields', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=OIDC').first().click();
    await page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // Check for form field labels/inputs
    await expect(page.getByText(/client id/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/client secret/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('OIDC dialog has all required inputs', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=OIDC').first().click();
    await page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // Verify key fields: Name, Issuer URL, Client ID, Client Secret
    await expect(dialog.getByRole('textbox', { name: 'Name' }).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/issuer url/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/client id/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/client secret/i)).toBeVisible({ timeout: 5000 });
    // Close
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('cancel closes OIDC dialog', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=OIDC').first().click();
    await page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('click Create LDAP opens dialog', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=LDAP').first().click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // LDAP-specific fields
    await expect(page.getByText(/server url|server/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/bind dn|bind/i).first()).toBeVisible({ timeout: 5000 });
    // Close
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('LDAP dialog has form fields', async ({ page }) => {
    await page.goto('/settings/sso');
    await page.locator('[role="tablist"] >> text=LDAP').first().click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /create.*provider|add.*provider|create/i }).first().click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // LDAP dialog should have form inputs
    const inputs = dialog.locator('input, textarea, select, [role="combobox"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);
    // Close
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('no console errors on SSO page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/settings/sso');
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
