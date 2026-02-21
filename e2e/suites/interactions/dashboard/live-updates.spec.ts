import { test, expect } from '@playwright/test';

/**
 * Live data update tests: verifies that SSE events cause one browser tab
 * to see changes made by another tab without a manual page refresh.
 *
 * Run locally:
 *   ADMIN_PASSWORD=admin123 npx playwright test --config playwright-local.config.ts --headed
 */

const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin';

async function loginPage(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(ADMIN_USER);
  await page.getByLabel('Password').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 15000 });

  if (page.url().includes('change-password')) {
    await page.getByLabel(/new password/i).first().fill(ADMIN_PASS);
    await page.getByLabel(/confirm/i).fill(ADMIN_PASS);
    await page.getByRole('button', { name: /change|update|save/i }).click();
    await expect(page).toHaveURL(/\/$/);
  }
}

test.describe('Live Data Updates (SSE)', () => {
  test.use({ storageState: undefined });

  test('creating a user in one tab updates the users list in another tab', async ({
    browser,
    baseURL,
  }) => {
    const base = baseURL || 'http://localhost:3000';
    const ctxA = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: base });
    const ctxB = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: base });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await loginPage(pageA);
    await loginPage(pageB);

    // Window B: navigate to users page and wait for table
    await pageB.goto('/users');
    const table = pageB.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });

    // Give the SSE connection time to establish
    await pageB.waitForTimeout(3000);

    const initialRows = await table.locator('tbody tr').count();

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

    // Window B: wait for the new user to appear without a page refresh.
    // SSE fires entity.changed -> hook invalidates "users" queries -> TanStack refetches.
    await expect(async () => {
      const rows = await table.locator('tbody tr').count();
      expect(rows).toBeGreaterThan(initialRows);
    }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });

    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).toBeVisible({ timeout: 5000 });

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
    const ctxA = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: base });
    const ctxB = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: base });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await loginPage(pageA);
    await loginPage(pageB);

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

    // Window B: navigate to users page and wait for the new user
    await pageB.goto('/users');
    const table = pageB.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).toBeVisible({ timeout: 15000 });

    // Give SSE time to connect
    await pageB.waitForTimeout(3000);

    const rowsBeforeDelete = await table.locator('tbody tr').count();

    // Window A: delete the user
    const uid = createBody?.user?.id;
    expect(uid).toBeTruthy();
    const deleteResponse = await pageA.request.delete(`/api/v1/users/${uid}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // Window B: user should disappear without refresh
    await expect(async () => {
      const rows = await table.locator('tbody tr').count();
      expect(rows).toBeLessThan(rowsBeforeDelete);
    }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });

    await expect(
      table.getByRole('cell', { name: username, exact: true })
    ).not.toBeVisible({ timeout: 5000 });

    await ctxA.close();
    await ctxB.close();
  });
});
