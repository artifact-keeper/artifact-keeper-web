import { test, expect } from '@playwright/test';

/**
 * Configuration flow for the package age policy (issue #265).
 *
 * The repo Settings tab exposes a "Package Age Policy" section that holds
 * freshly published packages in quarantine for a cooldown window. Enabling it
 * sends `quarantine_enabled` + `quarantine_duration_minutes` to:
 *   PATCH /api/v1/repositories/{key}
 *
 * The age policy is most useful on remote (pull-through) repositories, so the
 * seeded `e2e-npm-remote` repo is used. Runs in CI against backend :1.2.0.
 */
test.describe('Repository - Package Age Policy', () => {
  const REPO_KEY = 'e2e-npm-remote';

  test('PATCH stores the age policy on the repository', async ({ request }) => {
    const resp = await request.fetch(`/api/v1/repositories/${REPO_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: 4320 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(
      resp.ok(),
      `Age policy update failed: ${resp.status()}`
    ).toBeTruthy();

    // Reset so the test is idempotent across runs.
    await request
      .fetch(`/api/v1/repositories/${REPO_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: false, quarantine_duration_minutes: 4320 },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});
  });

  test('rejects a negative cooldown duration', async ({ request }) => {
    const resp = await request.fetch(`/api/v1/repositories/${REPO_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: -10 },
      headers: { 'Content-Type': 'application/json' },
    });

    // The backend validates the duration is non-negative.
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test('Settings tab exposes the age policy controls and saves', async ({ page }) => {
    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const settingsTab = page.getByRole('tab', { name: /settings/i }).first();
    const hasSettings = await settingsTab
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    test.skip(!hasSettings, 'Settings tab not visible (non-admin or repo missing)');

    await settingsTab.click({ force: true });
    await page.waitForTimeout(1500);

    // The age policy section heading should be present.
    await expect(
      page.getByRole('heading', { name: /package age policy/i })
    ).toBeVisible({ timeout: 5000 });

    // The cooldown input starts disabled until the policy is enabled.
    const cooldown = page.getByLabel('Cooldown period');
    await expect(cooldown).toBeDisabled();

    // Enable the policy via the toggle.
    const enableToggle = page.getByLabel('Enable age policy');
    await enableToggle.click();

    await expect(cooldown).toBeEnabled({ timeout: 3000 });
    await cooldown.fill('5');

    // Save and confirm the request is accepted (toast or no error banner).
    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().includes(`/repositories/${REPO_KEY}`) &&
        r.request().method() === 'PATCH',
      { timeout: 10000 }
    );

    await page.getByRole('button', { name: /save age policy/i }).click();

    // The save must actually PATCH, and succeed. (review hardening #464)
    const saved = await saveResponse;
    expect(saved.status()).toBeLessThan(400);

    const body = await page.textContent('body');
    expect(body).not.toContain('Application error');

    // Reset to disabled so the suite stays idempotent.
    await page
      .request.fetch(`/api/v1/repositories/${REPO_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: false, quarantine_duration_minutes: 7200 },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});
  });
});
