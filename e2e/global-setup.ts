import { test as setup, expect } from '@playwright/test';

setup('authenticate as admin', async ({ page }) => {
  // First, test the login API directly to verify credentials work
  const apiResponse = await page.request.post('/api/v1/auth/login', {
    data: { username: 'admin', password: 'admin' },
  });
  console.log(`Direct API login: ${apiResponse.status()}`);
  if (!apiResponse.ok()) {
    console.log(`Login API response: ${await apiResponse.text()}`);
  }

  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');

  // Listen for the login API response
  const loginPromise = page.waitForResponse(
    resp => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
    { timeout: 15000 }
  );

  await page.getByRole('button', { name: 'Sign In' }).click();

  const loginResponse = await loginPromise.catch(() => null);
  if (loginResponse) {
    console.log(`Login response status: ${loginResponse.status()}`);
    if (!loginResponse.ok()) {
      console.log(`Login response body: ${await loginResponse.text().catch(() => 'N/A')}`);
    }
  }

  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 15000 });

  // Handle first-login password change if needed
  if (page.url().includes('change-password')) {
    await page.getByLabel(/new password/i).first().fill('admin');
    await page.getByLabel(/confirm/i).fill('admin');
    await page.getByRole('button', { name: /change|update|save/i }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
