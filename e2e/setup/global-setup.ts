import { test as setup, expect } from '@playwright/test';
import { TEST_ROLES } from './auth-states';
import { seedAll } from './seed-data';

/** Login as a user via the UI and save their storageState */
async function loginAndSaveState(
  page: import('@playwright/test').Page,
  username: string,
  password: string,
  storageStatePath: string,
) {
  // Pre-flight: test the login API directly to verify credentials and prime cookies
  const apiResponse = await page.request.post('/api/v1/auth/login', {
    data: { username, password },
  });
  console.log(`[setup] Direct API login for ${username}: ${apiResponse.status()}`);
  if (!apiResponse.ok()) {
    console.log(`[setup] Login API response: ${await apiResponse.text().catch(() => 'N/A')}`);
  }

  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);

  const loginPromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
    { timeout: 15000 },
  );

  await page.getByRole('button', { name: 'Sign In' }).click();

  const loginResponse = await loginPromise.catch(() => null);
  if (loginResponse) {
    console.log(`[setup] Login response for ${username}: ${loginResponse.status()}`);
    if (!loginResponse.ok()) {
      console.log(`[setup] Login body: ${await loginResponse.text().catch(() => 'N/A')}`);
    }
  }

  // Wait for redirect to dashboard or change-password
  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 15000 });

  // Handle first-login password change if needed
  if (page.url().includes('change-password')) {
    await page.getByLabel(/new password/i).first().fill(password);
    await page.getByLabel(/confirm/i).fill(password);
    await page.getByRole('button', { name: /change|update|save/i }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await page.context().storageState({ path: storageStatePath });
}

setup('authenticate and seed data', async ({ page }) => {
  // 1. Login as admin first
  const admin = TEST_ROLES.admin;
  await loginAndSaveState(page, admin.username, admin.password, admin.storageStatePath);

  // 2. Seed test data using admin's authenticated session
  await seedAll(page.request);

  // 3. Login as each non-admin role and save their auth state
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    // Clear cookies/state before logging in as next user
    await page.context().clearCookies();
    console.log(`[setup] Authenticating as ${roleName}...`);
    await loginAndSaveState(page, role.username, role.password, role.storageStatePath);
  }

  console.log('[setup] All roles authenticated and states saved.');
});
