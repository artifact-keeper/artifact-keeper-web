import { test, expect } from '@playwright/test';

/**
 * Configuration flow for the package age policy (issue #265, proxy gate #853).
 *
 * The repo Settings tab exposes a "Package Age Policy" section that holds
 * freshly published packages in quarantine for a cooldown window. Enabling it
 * sends `quarantine_enabled` + `quarantine_duration_minutes` to:
 *   PATCH /api/v1/repositories/{key}
 *
 * Backend 1.10.0 (artifact-keeper#3647) refuses `quarantine_enabled: true` on
 * the proxying repository types with a 400 — quarantine state is keyed on rows
 * a remote/virtual repository never writes, so the hold would have no release
 * path. Disabling stays accepted on every type. The policy is therefore
 * exercised against a hosted repository, and the seeded `e2e-npm-remote` repo
 * is used to pin the refusal and the read-only panel the UI now renders there.
 *
 * The hosted repository is created by this spec rather than reusing a seeded
 * one: enabling quarantine on a shared repo would hold artifacts other suites
 * upload into it.
 */
test.describe.serial('Repository - Package Age Policy', () => {
  /** Proxying type: enabling is refused by the backend. */
  const REMOTE_KEY = 'e2e-npm-remote';
  /** Hosted type: the policy is configurable here. */
  const HOSTED_KEY = 'e2e-age-policy-local';

  test.beforeAll(async ({ request }) => {
    await request.post('/api/v1/repositories', {
      data: {
        key: HOSTED_KEY,
        name: 'E2E Age Policy Local',
        format: 'maven',
        repo_type: 'local',
        is_public: true,
      },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${HOSTED_KEY}`).catch(() => {});
  });

  test('PATCH stores the age policy on a hosted repository', async ({ request }) => {
    const resp = await request.fetch(`/api/v1/repositories/${HOSTED_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: 4320 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(
      resp.ok(),
      `Age policy update failed: ${resp.status()} ${await resp.text()}`
    ).toBeTruthy();

    // Reset so the test is idempotent across runs.
    await request
      .fetch(`/api/v1/repositories/${HOSTED_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: false, quarantine_duration_minutes: 4320 },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});
  });

  test('enabling the age policy on a remote repository is refused', async ({ request }) => {
    const resp = await request.fetch(`/api/v1/repositories/${REMOTE_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: 4320 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(resp.status()).toBe(400);

    // Match loosely: the wording is the backend's, but it has to name why the
    // hold cannot work on proxied content rather than just the field name.
    const body = (await resp.text()).toLowerCase();
    expect(body).toMatch(/proxy|proxied|release/);
  });

  test('disabling the age policy on a remote repository is still accepted', async ({
    request,
  }) => {
    // The escape hatch the read-only panel's Disable action depends on: a repo
    // enabled before the gate existed must still be turnable off.
    const resp = await request.fetch(`/api/v1/repositories/${REMOTE_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: false, quarantine_duration_minutes: 4320 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(
      resp.ok(),
      `Disabling the age policy failed: ${resp.status()} ${await resp.text()}`
    ).toBeTruthy();
  });

  test('rejects a negative cooldown duration', async ({ request }) => {
    // Against the hosted repo: on a remote the request would be refused for
    // the repository type before the duration is looked at, so the duration
    // rule itself would never be exercised.
    const resp = await request.fetch(`/api/v1/repositories/${HOSTED_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: -10 },
      headers: { 'Content-Type': 'application/json' },
    });

    // The backend validates the duration is non-negative.
    expect(resp.status()).toBeGreaterThanOrEqual(400);
  });

  test('Settings tab exposes the age policy controls and saves', async ({ page, request }) => {
    // Ensure the age policy is disabled before the UI flow so the cooldown
    // input starts in a known disabled state regardless of previous tests.
    await request
      .fetch(`/api/v1/repositories/${HOSTED_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: false, quarantine_duration_minutes: 4320 },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});

    await page.goto(`/repositories/${HOSTED_KEY}`);
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
        r.url().includes(`/repositories/${HOSTED_KEY}`) &&
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
      .request.fetch(`/api/v1/repositories/${HOSTED_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: false, quarantine_duration_minutes: 7200 },
        headers: { 'Content-Type': 'application/json' },
      })
      .catch(() => {});
  });

  test('Settings tab renders the age policy read-only on a remote repository', async ({
    page,
  }) => {
    await page.goto(`/repositories/${REMOTE_KEY}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const settingsTab = page.getByRole('tab', { name: /settings/i }).first();
    const hasSettings = await settingsTab
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    test.skip(!hasSettings, 'Settings tab not visible (non-admin or repo missing)');

    await settingsTab.click({ force: true });
    await page.waitForTimeout(1500);

    // The section is still there, but explains the restriction instead of
    // offering controls the backend would refuse (#853).
    await expect(
      page.getByRole('heading', { name: /package age policy/i })
    ).toBeVisible({ timeout: 5000 });

    const note = page.getByTestId('age-policy-proxy-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText(
      /not supported on remote \(proxy\) or virtual repositories/i
    );

    // No way to enable it, and no save action to send the refused PATCH.
    await expect(page.getByLabel('Enable age policy')).toHaveCount(0);
    await expect(page.getByLabel('Cooldown period')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /save age policy/i })
    ).toHaveCount(0);
  });
});
