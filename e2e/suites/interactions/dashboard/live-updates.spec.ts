import { test, expect } from '@playwright/test';
import { TEST_ROLES } from '../../../setup/auth-states';

/**
 * Live data update tests: verifies that SSE events cause one browser tab
 * to see changes made by another tab without a manual page refresh.
 *
 * Both tabs are authenticated by *reusing the admin storageState* that
 * global-setup already produced, rather than driving the login form twice.
 * The old approach re-typed a hardcoded admin password into the UI in each
 * fresh context; global-setup rotates the initial admin password to the
 * role password (`Admin1234!`) on first login, so that stale password no
 * longer authenticates and the second context hung on `/login`. Loading the
 * saved cookies makes both tabs deterministically signed in.
 *
 * Run locally:
 *   npx playwright test --config playwright-local.config.ts --headed
 */

const ADMIN_STATE = TEST_ROLES.admin.storageStatePath;

test.describe('Live Data Updates (SSE)', () => {
  test('creating a user in one tab updates the users list in another tab', async ({
    browser,
    baseURL,
  }) => {
    const base = baseURL || 'http://localhost:3000';
    const ctxA = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: base,
      storageState: ADMIN_STATE,
    });
    const ctxB = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: base,
      storageState: ADMIN_STATE,
    });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Window B: navigate to users page and wait for table. Wait for the SSE
    // stream response (headers = EventSource opened) rather than a blind sleep,
    // so we don't trigger the change before tab B is actually listening.
    const sseConnected = pageB
      .waitForResponse(
        (r) => r.url().includes('/api/v1/events/stream') && r.status() === 200,
        { timeout: 20000 }
      )
      .catch(() => null);
    await pageB.goto('/users');
    const table = pageB.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
    await sseConnected;

    // Window A: create a new user via the API
    const username = `sse-test-${Date.now()}`;
    const createResponse = await pageA.request.post('/api/v1/users', {
      data: {
        username,
        email: `${username}@test.local`,
        display_name: 'SSE Live Test User',
        password: 'TestPass123',
        is_admin: false,
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    // Window B: the new user must appear without a manual refresh — SSE fires
    // `user.created` -> the hook invalidates the "users" query -> TanStack
    // refetches. Assert on the specific username cell rather than an absolute
    // row-count delta, so a user created/removed by a concurrent test can't
    // offset the count and mask (or fake) the result.
    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).toBeVisible({ timeout: 30000 });

    // Cleanup
    const body = await createResponse.json();
    const uid = body?.user?.id;
    if (uid) await pageA.request.delete(`/api/v1/users/${uid}`);

    await ctxA.close();
    await ctxB.close();
  });

  test('deleting a user in one tab updates the users list in another tab', async ({
    browser,
    baseURL,
  }) => {
    const base = baseURL || 'http://localhost:3000';
    const ctxA = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: base,
      storageState: ADMIN_STATE,
    });
    const ctxB = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL: base,
      storageState: ADMIN_STATE,
    });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Create a user first
    const username = `sse-del-${Date.now()}`;
    const createResponse = await pageA.request.post('/api/v1/users', {
      data: {
        username,
        email: `${username}@test.local`,
        display_name: 'SSE Delete Test',
        password: 'TestPass123',
        is_admin: false,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();

    // Window B: navigate to users page and wait for the new user. Wait for the
    // SSE stream to open (headers received) so the deletion below isn't missed.
    const sseConnected = pageB
      .waitForResponse(
        (r) => r.url().includes('/api/v1/events/stream') && r.status() === 200,
        { timeout: 20000 }
      )
      .catch(() => null);
    await pageB.goto('/users');
    const table = pageB.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).toBeVisible({ timeout: 15000 });
    await sseConnected;

    // Window A: delete the user
    const uid = createBody?.user?.id;
    expect(uid).toBeTruthy();
    const deleteResponse = await pageA.request.delete(`/api/v1/users/${uid}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // Window B: the user should disappear without a refresh. Assert on the
    // specific username cell rather than an absolute row-count delta, so a
    // concurrent test mutating the list can't offset the count.
    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).toBeHidden({ timeout: 30000 });

    await ctxA.close();
    await ctxB.close();
  });
});
