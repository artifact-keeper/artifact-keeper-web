import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { TEST_ROLES } from '../../../setup/auth-states';

/**
 * Signed-in shell after the access cookie expires (#1084 / #1125).
 *
 * The backend sets two httpOnly cookies on sign-in (backend
 * `handlers/auth.rs`): `ak_access_token` (Path=/, lives as long as the access
 * token) and `ak_refresh_token` (Path=/api/v1/auth/refresh, lives longer).
 * Once the access cookie has expired, `/auth/me` answers 401 and the refresh
 * cookie is never sent to it, so the shell has to refresh on load. Before the
 * fix the header kept showing Sign In until a reload, although the page's data
 * requests recovered through the 401 interceptor.
 *
 * The test signs in as a throwaway user of its own: a refresh rotates the
 * refresh token, which must not touch the shared storage states, and the
 * backend's per-(username, IP) login budget is not spent on admin. It then
 * drops only the access cookie and loads a fresh page.
 */
test.describe('Session after the access cookie expires', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const USERNAME = `e2e-session-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const PASSWORD = `Session1!${randomBytes(12).toString('base64url')}`;
  let admin: APIRequestContext;
  let userId: string | undefined;

  test.beforeEach(async ({ baseURL }) => {
    admin = await playwrightRequest.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      storageState: TEST_ROLES.admin.storageStatePath,
    });
    const resp = await admin.post('/api/v1/users', {
      data: {
        username: USERNAME,
        password: PASSWORD,
        email: `${USERNAME}@test.local`,
        display_name: 'E2E Session',
        is_admin: false,
      },
    });
    expect(resp.ok(), `create user: ${resp.status()} ${await resp.text()}`).toBeTruthy();
    userId = (await resp.json()).user?.id;
    expect(userId).toBeTruthy();
  });

  test.afterEach(async () => {
    if (userId) await admin.delete(`/api/v1/users/${userId}`).catch(() => {});
    await admin.dispose();
  });

  test('#1084: a fresh load with only the refresh cookie is signed in', async ({
    page,
    context,
  }) => {
    const login = await page.request.post('/api/v1/auth/login', {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(login.ok(), `login: ${login.status()}`).toBeTruthy();

    const names = (await context.cookies()).map((c) => c.name);
    expect(names).toContain('ak_access_token');
    expect(names).toContain('ak_refresh_token');

    // What the browser holds once the access cookie's Max-Age has passed.
    await context.clearCookies({ name: 'ak_access_token' });
    const left = (await context.cookies()).map((c) => c.name);
    expect(left).not.toContain('ak_access_token');
    expect(left).toContain('ak_refresh_token');

    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('button', { name: 'User menu' })).toBeVisible({
      timeout: 15000,
    });
    await expect(header.getByRole('button', { name: 'Sign In' })).toHaveCount(0);
    // The refresh issued a new access cookie.
    expect((await context.cookies()).map((c) => c.name)).toContain('ak_access_token');
  });
});
