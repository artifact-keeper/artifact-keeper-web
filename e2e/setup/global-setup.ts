import { test as setup, expect } from '@playwright/test';
import { TEST_ROLES } from './auth-states';
import { seedAll } from './seed-data';

/**
 * The initial admin password set by ADMIN_PASSWORD env var in CI.
 * When this matches a well-known default, the backend forces a password
 * change on first login (must_change_password: true).
 */
const INITIAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestRunner!2026secure';

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

  await page.context().storageState({ path: storageStatePath });
}

/**
 * Handle first-login password change when the backend forces it.
 * The initial password (from ADMIN_PASSWORD env var) is typically a
 * well-known default like "admin" which the backend flags as insecure.
 * This changes it to the role's desired password.
 */
async function handlePasswordChangeIfNeeded(
  page: import('@playwright/test').Page,
  currentPassword: string,
  newPassword: string,
) {
  if (!page.url().includes('change-password')) return false;

  console.log('[setup] Password change required, completing setup...');
  await page.getByLabel(/current password/i).fill(currentPassword);
  await page.getByLabel(/new password/i).first().fill(newPassword);
  await page.getByLabel(/confirm/i).fill(newPassword);
  await page.getByRole('button', { name: /change|update|save/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  console.log('[setup] Password changed successfully');
  return true;
}

setup('authenticate and seed data', async ({ page }) => {
  const admin = TEST_ROLES.admin;

  // 1. Login as admin with the initial (possibly default) password
  const initialPassword = INITIAL_ADMIN_PASSWORD;
  console.log(`[setup] Logging in as admin with initial password...`);

  const apiResponse = await page.request.post('/api/v1/auth/login', {
    data: { username: admin.username, password: initialPassword },
  });
  console.log(`[setup] Direct API login for admin: ${apiResponse.status()}`);

  await page.goto('/login');
  await page.getByLabel('Username').fill(admin.username);
  await page.getByLabel('Password').fill(initialPassword);

  const loginPromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
    { timeout: 15000 },
  );

  await page.getByRole('button', { name: 'Sign In' }).click();

  const loginResponse = await loginPromise.catch(() => null);
  if (loginResponse) {
    console.log(`[setup] Login response for admin: ${loginResponse.status()}`);
  }

  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 15000 });

  // 2. Handle forced password change (initial password -> role password)
  const changed = await handlePasswordChangeIfNeeded(page, initialPassword, admin.password);

  if (changed) {
    // Re-login with the new password since the session may have changed
    await page.context().clearCookies();
    await loginAndSaveState(page, admin.username, admin.password, admin.storageStatePath);
  } else {
    await page.context().storageState({ path: admin.storageStatePath });
  }

  // 3. Seed test data using admin's authenticated session
  await seedAll(page.request);

  // 4. Login as each non-admin role and save their auth state
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    await page.context().clearCookies();
    console.log(`[setup] Authenticating as ${roleName}...`);
    await loginAndSaveState(page, role.username, role.password, role.storageStatePath);
  }

  console.log('[setup] All roles authenticated and states saved.');
});
