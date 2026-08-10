import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';

/**
 * Migration UI overhaul (PR #743): job rows are labelled by their repository
 * scope ("All repositories" or "repo and N other repos") with a truncated job
 * id subtitle, the Create Migration dialog offers per-repo "rename to" mapping
 * inputs, and completion totals render defensively (completed/effective-total).
 *
 * A source connection is seeded via the API (offline-safe: creation stores the
 * record without contacting the source). Migration jobs are created as
 * assessment jobs directly via the API — they never reach a real source — and
 * deleted afterwards. The source-repositories endpoint does contact the source
 * registry, so it is route-intercepted for the rename-inputs test (precedent:
 * admin/migration-config.spec.ts).
 */

const RUN_ID = `e2e-mig743-${Date.now().toString(36)}`;

/** Seed a source connection; returns its id. */
async function seedConnection(
  adminApi: { post: (p: string, d?: unknown) => Promise<{ ok(): boolean; json(): Promise<{ id: string }> }> },
  name: string
): Promise<string> {
  const resp = await adminApi.post('/migrations/connections', {
    name,
    url: 'https://artifactory.e2e.example.com',
    auth_type: 'api_token',
    source_type: 'artifactory',
    credentials: { token: 'e2e-token' },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()).id;
}

test.describe('Migration page (#743)', () => {
  test('job list shows scope labels, truncated id, and completion totals', async ({
    page,
    adminApi,
  }) => {
    const connectionId = await seedConnection(adminApi, `${RUN_ID}-list`);
    const jobIds: string[] = [];
    try {
      // Unscoped job -> "All repositories" row label.
      const unscoped = await adminApi.post('/migrations', {
        source_connection_id: connectionId,
        job_type: 'assessment',
        config: { include_repos: [] },
      });
      expect(unscoped.ok()).toBeTruthy();
      jobIds.push((await unscoped.json()).id);

      // Scoped job -> "alpha-repo and 1 other repo" row label.
      const scoped = await adminApi.post('/migrations', {
        source_connection_id: connectionId,
        job_type: 'assessment',
        config: { include_repos: ['alpha-repo', 'beta-repo'] },
      });
      expect(scoped.ok()).toBeTruthy();
      jobIds.push((await scoped.json()).id);

      await navigateTo(page, '/migration');
      await page
        .getByRole('tablist')
        .getByRole('tab', { name: /migration jobs/i })
        .click();

      // Scope labels distinguish the two jobs at a glance.
      await expect(
        page.getByRole('button', { name: /All repositories/ })
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole('button', { name: /alpha-repo and 1 other repo/ })
      ).toBeVisible({ timeout: 10000 });

      // Truncated job id subtitle under each scope label.
      await expect(
        page.getByText(/^[0-9a-f]{8}\.\.\.$/).first()
      ).toBeVisible();

      // Completion totals render as completed/total per row.
      const rows = page.getByRole('row');
      await expect(
        rows.filter({ hasText: 'All repositories' })
      ).toContainText(/\d+\/\d+/);
      await expect(
        rows.filter({ hasText: 'alpha-repo and 1 other repo' })
      ).toContainText(/\d+\/\d+/);
    } finally {
      for (const id of jobIds) {
        await adminApi.delete(`/migrations/${id}`).catch(() => {});
      }
      await adminApi
        .delete(`/migrations/connections/${connectionId}`)
        .catch(() => {});
    }
  });

  test('create dialog shows per-repo "rename to" mapping inputs', async ({
    page,
    adminApi,
  }) => {
    const connectionName = `${RUN_ID}-dialog`;
    const connectionId = await seedConnection(adminApi, connectionName);
    try {
      // The backend resolves source repos by contacting the source registry,
      // which is unreachable in e2e — stub the listing instead.
      await page.route(
        '**/api/v1/migrations/connections/*/repositories',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { key: 'alpha-repo', package_type: 'maven' },
              { key: 'beta-repo', package_type: 'npm' },
            ]),
          })
      );

      await navigateTo(page, '/migration');
      await page
        .getByRole('tablist')
        .getByRole('tab', { name: /migration jobs/i })
        .click();
      await page
        .getByRole('button', { name: /create migration/i })
        .first()
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10000 });

      // Pick the seeded connection so its repositories load.
      await dialog.getByRole('combobox').first().click();
      await page
        .getByRole('option', { name: connectionName })
        .click();

      // Both stubbed repos are offered for inclusion.
      const alphaInclude = dialog.locator('#include-repo-alpha-repo');
      const betaInclude = dialog.locator('#include-repo-beta-repo');
      await expect(alphaInclude).toBeVisible({ timeout: 10000 });
      await expect(betaInclude).toBeVisible();

      // No rename inputs until a repo is included.
      await expect(dialog.locator('#rename-repo-alpha-repo')).toHaveCount(0);
      await expect(dialog.locator('#rename-repo-beta-repo')).toHaveCount(0);

      // Including a repo reveals its "rename to" mapping input.
      await alphaInclude.check();
      const renameInput = dialog.locator('#rename-repo-alpha-repo');
      await expect(renameInput).toBeVisible();
      await expect(dialog.getByText('rename to')).toBeVisible();
      await expect(renameInput).toHaveAttribute('placeholder', 'alpha-repo');
      await renameInput.fill('alpha-renamed');
      await expect(renameInput).toHaveValue('alpha-renamed');

      // Excluded repos still have no rename input.
      await expect(dialog.locator('#rename-repo-beta-repo')).toHaveCount(0);

      // Un-hiding toggles back off.
      await alphaInclude.uncheck();
      await expect(dialog.locator('#rename-repo-alpha-repo')).toHaveCount(0);

      await dialog.getByRole('button', { name: /cancel/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10000 });
    } finally {
      await page.unroute('**/api/v1/migrations/connections/*/repositories');
      await adminApi
        .delete(`/migrations/connections/${connectionId}`)
        .catch(() => {});
    }
  });

  test('migration page loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    await navigateTo(page, '/migration');
    await expect(
      page.getByRole('heading', { name: /migration/i })
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    expect(filterCriticalErrors(consoleErrors)).toEqual([]);
  });
});
