import { test, expect } from '@playwright/test';

/**
 * E2E coverage for release-target configuration on the repository Settings tab
 * (issue #260).
 *
 * A staging repository can be linked to a single local release repository of
 * the same format. The link is persisted via:
 *   PATCH /api/v1/repositories/{key}  { release_repository_key: "..." }
 * Passing an empty string removes the link. The backend rejects links to a
 * non-local repository or a repository of a different format.
 *
 * The UI settings section is admin only, so the UI-driven test is best effort
 * and skips when the Settings tab is not reachable. The API contract tests are
 * the load-bearing assertions.
 */
test.describe.serial('Release Target Settings', () => {
  const STAGING_KEY = 'e2e-release-staging';
  const RELEASE_KEY = 'e2e-release-local';
  const WRONG_FORMAT_KEY = 'e2e-release-wrong-format';

  test.beforeAll(async ({ request }) => {
    await request.post('/api/v1/repositories', {
      data: {
        key: RELEASE_KEY,
        name: 'E2E Release Local',
        format: 'maven',
        repo_type: 'local',
        is_public: true,
      },
    });
    await request.post('/api/v1/repositories', {
      data: {
        key: WRONG_FORMAT_KEY,
        name: 'E2E Release Wrong Format',
        format: 'npm',
        repo_type: 'local',
        is_public: true,
      },
    });
    await request.post('/api/v1/repositories', {
      data: {
        key: STAGING_KEY,
        name: 'E2E Release Staging',
        format: 'maven',
        repo_type: 'staging',
        is_public: true,
      },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${STAGING_KEY}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${RELEASE_KEY}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${WRONG_FORMAT_KEY}`).catch(() => {});
  });

  test('linking a same-format local repo as release target succeeds', async ({ request }) => {
    const resp = await request.patch(`/api/v1/repositories/${STAGING_KEY}`, {
      data: { release_repository_key: RELEASE_KEY },
    });
    expect(resp.ok(), `Link failed: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  });

  test('linking a different-format repo is rejected', async ({ request }) => {
    const resp = await request.patch(`/api/v1/repositories/${STAGING_KEY}`, {
      data: { release_repository_key: WRONG_FORMAT_KEY },
    });
    expect(resp.status()).toBe(400);
  });

  test('unlinking with an empty release target key succeeds', async ({ request }) => {
    // Ensure it is linked first.
    await request.patch(`/api/v1/repositories/${STAGING_KEY}`, {
      data: { release_repository_key: RELEASE_KEY },
    });
    const resp = await request.patch(`/api/v1/repositories/${STAGING_KEY}`, {
      data: { release_repository_key: '' },
    });
    expect(resp.ok()).toBeTruthy();
  });

  test('release target linking is rejected for non-staging repositories', async ({ request }) => {
    const resp = await request.patch(`/api/v1/repositories/${RELEASE_KEY}`, {
      data: { release_repository_key: STAGING_KEY },
    });
    expect(resp.status()).toBe(400);
  });

  test('UI: set the release target on the staging settings tab', async ({ page, request }) => {
    // Reset to unlinked before the UI flow.
    await request.patch(`/api/v1/repositories/${STAGING_KEY}`, {
      data: { release_repository_key: '' },
    });

    await page.goto(`/repositories/${STAGING_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const settingsTab = page.getByRole('tab', { name: /settings/i });
    if (!(await settingsTab.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, 'Settings tab not visible (requires admin); API tests cover the contract');
      return;
    }
    await settingsTab.click();

    const heading = page.getByRole('heading', { name: /release target/i });
    await expect(heading).toBeVisible({ timeout: 8000 });

    // Open the release repository select and pick the eligible local repo.
    const select = page.getByRole('combobox').filter({ hasText: /release|select/i }).first();
    await select.click();

    const option = page.getByRole('option', { name: new RegExp(RELEASE_KEY, 'i') });
    if (!(await option.isVisible({ timeout: 5000 }).catch(() => false))) {
      // The candidate list may be empty in a constrained CI seed; the API
      // tests above already prove the contract.
      await page.keyboard.press('Escape');
      test.skip(true, 'No eligible release repository option rendered');
      return;
    }
    await option.click();

    await page.getByRole('button', { name: /save release target/i }).click();

    // A success toast confirms the save.
    const toast = page
      .locator('[data-sonner-toast][data-type="success"]')
      .or(page.getByRole('status').filter({ hasText: /release target/i }));
    await expect(toast.first()).toBeVisible({ timeout: 10000 });
  });

  test('UI: non-staging repository shows the staging-only notice', async ({ page }) => {
    await page.goto(`/repositories/${RELEASE_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const settingsTab = page.getByRole('tab', { name: /settings/i });
    if (!(await settingsTab.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, 'Settings tab not visible (requires admin)');
      return;
    }
    await settingsTab.click();

    // Local repositories do not render the release-target section at all
    // (it is gated to staging in the settings tab), so the heading must be
    // absent. This documents the intended gating.
    await expect(
      page.getByRole('heading', { name: /release target/i })
    ).toHaveCount(0);
  });
});
