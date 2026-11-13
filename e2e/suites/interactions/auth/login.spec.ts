import { test, expect } from '@playwright/test';
import { LoginPage } from '../../../fixtures/page-objects/LoginPage';
import { TEST_ROLES } from '../../../setup/auth-states';

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

  // artifact-keeper#5484: LDAP login and the OIDC/SAML code exchange answer a
  // TOTP-enrolled account with a challenge (`totp_required` + `totp_token`, no
  // cookies) instead of a session. The stack under test has no directory or
  // IdP, so the challenge is stubbed; `POST /auth/totp/verify` is answered
  // with a REAL session (the viewer's password login, relayed with its
  // Set-Cookie) so the run ends signed in for real, not against a stub.
  test.describe('TOTP step after LDAP / OIDC / SAML sign-in (artifact-keeper#5484)', () => {
    const challenge = {
      access_token: '',
      refresh_token: '',
      token_type: 'Bearer',
      expires_in: 0,
      totp_required: true,
      totp_token: 'e2e-pending-totp-token',
    };

    /** Answer TOTP verify with a real session; returns the bodies the UI sent. */
    async function stubTotpVerify(page: import('@playwright/test').Page) {
      const sent: unknown[] = [];
      await page.route('**/api/v1/auth/totp/verify', async (route) => {
        sent.push(route.request().postDataJSON());
        const viewer = TEST_ROLES.viewer;
        const response = await route.fetch({
          url: new URL('/api/v1/auth/login', route.request().url()).toString(),
          postData: JSON.stringify({ username: viewer.username, password: viewer.password }),
        });
        await route.fulfill({ response });
      });
      return sent;
    }

    async function enterTotpCode(page: import('@playwright/test').Page) {
      await expect(page.getByText('Two-Factor Authentication')).toBeVisible({ timeout: 10000 });
      await page.getByPlaceholder('000000').fill('123456');
      await page.getByRole('button', { name: 'Verify' }).click();
    }

    async function expectSignedInAsViewer(page: import('@playwright/test').Page) {
      await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 10000 });
      const me = await page.request.get('/api/v1/auth/me');
      expect(me.status()).toBe(200);
      expect((await me.json()).username).toBe(TEST_ROLES.viewer.username);
    }

    test('LDAP sign-in for a TOTP account asks for the code, then signs in', async ({ page }) => {
      await page.route('**/api/v1/auth/sso/providers', (route) =>
        route.fulfill({
          json: [{ id: 'ldap-1', name: 'Corp LDAP', provider_type: 'ldap', login_url: '' }],
        }),
      );
      await page.route('**/api/v1/auth/sso/ldap/ldap-1/login', (route) =>
        route.fulfill({ json: { ...challenge, expires_in: 1800, must_change_password: false } }),
      );
      const sent = await stubTotpVerify(page);

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.getByRole('tab', { name: 'Corp LDAP' }).click();
      await loginPage.login('alice', 'directory-password');
      await enterTotpCode(page);

      await expectSignedInAsViewer(page);
      expect(sent).toEqual([{ totp_token: challenge.totp_token, code: '123456' }]);
    });

    test('OIDC/SAML callback for a TOTP account asks for the code, then signs in', async ({ page }) => {
      const exchanged: unknown[] = [];
      await page.route('**/api/v1/auth/sso/exchange', (route) => {
        exchanged.push(route.request().postDataJSON());
        return route.fulfill({ json: challenge });
      });
      const sent = await stubTotpVerify(page);

      // Where the backend's OIDC callback / SAML ACS redirect lands.
      await page.goto('/callback?code=e2e-exchange-code');
      await expect(page).toHaveURL(/\/login$/, { timeout: 10000 });
      await enterTotpCode(page);

      await expectSignedInAsViewer(page);
      // `toContainEqual`, not an exact list: `next dev` runs effects twice
      // (React Strict Mode), so a local dev-server run exchanges twice.
      expect(exchanged).toContainEqual({ code: 'e2e-exchange-code' });
      expect(sent).toEqual([{ totp_token: challenge.totp_token, code: '123456' }]);
    });
  });
});
