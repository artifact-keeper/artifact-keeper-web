import { test, expect } from '@playwright/test';
import { backendAtLeast, PROXY_AGE_POLICY_MIN } from '../../../../src/lib/backend-version';

/**
 * Configuration flow for the package age policy (issue #265, proxy gate #853).
 *
 * The repo Settings tab exposes a "Package Age Policy" section that holds
 * freshly published packages in quarantine for a cooldown window. Enabling it
 * sends `quarantine_enabled` + `quarantine_duration_minutes` to:
 *   PATCH /api/v1/repositories/{key}
 *
 * Backend 1.10.0 (artifact-keeper#3647) refused `quarantine_enabled: true` on
 * the proxying repository types with a 400. Backend main (artifact-keeper#4264,
 * ships in 1.11.0, and in the `:dev` image this suite runs against) accepts it
 * on remote repositories again — proxied content now carries a releasable,
 * release-date-aware hold — and still refuses it on virtual repositories,
 * which cache nothing themselves. Disabling stays accepted on every type.
 *
 * The API tests pin backend main. The UI test on the remote repository reads
 * `/health` and asserts whichever panel the web gate (`PROXY_AGE_POLICY_MIN`)
 * selects: `:dev` reports the last released version (1.10.0) until the
 * workspace is bumped, so it renders #863's read-only panel today.
 *
 * The hosted and remote repositories the policy is enabled on are created by
 * this spec rather than reusing seeded ones: enabling quarantine on a shared
 * repo would hold artifacts other suites upload or fetch through it.
 */
test.describe.serial('Repository - Package Age Policy', () => {
  /** Seeded remote: the disable path and the UI panel. */
  const REMOTE_KEY = 'e2e-npm-remote';
  /** Spec-owned remote: enabling is accepted here since artifact-keeper#4264. */
  const OWN_REMOTE_KEY = 'e2e-age-policy-remote';
  /** Seeded virtual: enabling is still refused. */
  const VIRTUAL_KEY = 'e2e-docker-virtual';
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
    await request.post('/api/v1/repositories', {
      data: {
        key: OWN_REMOTE_KEY,
        name: 'E2E Age Policy Remote',
        format: 'npm',
        repo_type: 'remote',
        upstream_url: 'https://registry.npmjs.org',
        is_public: true,
      },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${HOSTED_KEY}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${OWN_REMOTE_KEY}`).catch(() => {});
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

  test('enabling the age policy on a remote repository is accepted', async ({ request }) => {
    try {
      const resp = await request.fetch(`/api/v1/repositories/${OWN_REMOTE_KEY}`, {
        method: 'PATCH',
        data: { quarantine_enabled: true, quarantine_duration_minutes: 4320 },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(
        resp.status(),
        `Enabling the age policy on a remote failed: ${await resp.text()}`
      ).toBe(200);

      const get = await request.get(`/api/v1/repositories/${OWN_REMOTE_KEY}`);
      expect(get.status()).toBe(200);
      expect((await get.json()).quarantine_enabled).toBe(true);
    } finally {
      // Reset so the suite stays idempotent even when an assertion fails.
      await request
        .fetch(`/api/v1/repositories/${OWN_REMOTE_KEY}`, {
          method: 'PATCH',
          data: { quarantine_enabled: false, quarantine_duration_minutes: 4320 },
          headers: { 'Content-Type': 'application/json' },
        })
        .catch(() => {});
    }
  });

  test('enabling the age policy on a virtual repository is refused', async ({ request }) => {
    const resp = await request.fetch(`/api/v1/repositories/${VIRTUAL_KEY}`, {
      method: 'PATCH',
      data: { quarantine_enabled: true, quarantine_duration_minutes: 4320 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(resp.status()).toBe(400);

    // Match loosely: the wording is the backend's, but it has to be about the
    // virtual repository type rather than just the field name.
    const body = (await resp.text()).toLowerCase();
    expect(body).toMatch(/virtual|member|proxy|proxied/);
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
    // Against the hosted repo: on a remote the request can be refused for the
    // repository type (backend 1.10.0) before the duration is looked at, so
    // the duration rule itself would never be exercised.
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

  test('Settings tab gates the age policy on a remote repository by backend version', async ({
    page,
    request,
  }) => {
    const health = await (await request.get('/health')).json().catch(() => ({}));
    const proxyHolds = backendAtLeast(health?.version, PROXY_AGE_POLICY_MIN);

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

    await expect(
      page.getByRole('heading', { name: /package age policy/i })
    ).toBeVisible({ timeout: 5000 });

    if (proxyHolds) {
      // Backend >= 1.11.0 (artifact-keeper#4264): the editable form is back.
      await expect(page.getByLabel('Enable age policy')).toBeVisible();
      await expect(page.getByTestId('age-policy-proxy-note')).toHaveCount(0);
      return;
    }

    // Older backend: the section explains the restriction instead of
    // offering controls the backend would refuse (#853).

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
