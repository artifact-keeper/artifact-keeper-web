import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../fixtures/page-objects/LoginPage';

test.describe('Authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No pre-auth

  test('shows login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'wrongpassword');
    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', process.env.ADMIN_PASSWORD || 'TestRunner!2026secure');
    await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 10000 });
  });

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/profile');
    // Should redirect to login page or show login form
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test.describe('LDAP with local login disabled (#899)', () => {
    const ldap = (id: string, name: string) => ({
      id,
      name,
      provider_type: 'ldap',
      login_url: '',
    });

    // The backend under test has no LDAP provider and local login on, so
    // stub the two inputs the page decides from: the provider list and
    // `auth.local_login_enabled` from the (otherwise real) system config.
    async function stubAuthOptions(
      page: import('@playwright/test').Page,
      providers: ReturnType<typeof ldap>[],
    ) {
      await page.route('**/api/v1/auth/sso/providers', (route) =>
        route.fulfill({ json: providers }),
      );
      await page.route('**/api/v1/system/config', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.auth = { ...(body.auth ?? {}), local_login_enabled: false };
        await route.fulfill({ response, json: body });
      });
    }

    test('one LDAP provider: its form is shown directly, with no Local tab', async ({ page }) => {
      await stubAuthOptions(page, [ldap('ldap-1', 'Corp LDAP')]);
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(page.getByText('Sign in with your Corp LDAP account')).toBeVisible({
        timeout: 10000,
      });
      await expect(loginPage.usernameInput).toBeVisible();
      await expect(loginPage.ldapTabs).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Local' })).toHaveCount(0);
    });

    test('several LDAP providers: tabs for each, the first selected, no Local tab', async ({ page }) => {
      await stubAuthOptions(page, [
        ldap('ldap-1', 'Corp LDAP'),
        ldap('ldap-2', 'Partner LDAP'),
      ]);
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(loginPage.ldapTabs).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('tab')).toHaveText(['Corp LDAP', 'Partner LDAP']);
      await expect(page.getByRole('tab', { name: 'Corp LDAP' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    test('?fallback=local keeps the Local tab reachable, selected', async ({ page }) => {
      await stubAuthOptions(page, [ldap('ldap-1', 'Corp LDAP')]);
      await page.goto('/login?fallback=local');

      const local = page.getByRole('tab', { name: 'Local' });
      await expect(local).toBeVisible({ timeout: 10000 });
      await expect(local).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { name: 'Corp LDAP' })).toBeVisible();
    });
  });
});

