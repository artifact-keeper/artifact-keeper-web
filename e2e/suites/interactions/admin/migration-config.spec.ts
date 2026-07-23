import { test, expect } from '../../../fixtures/test-fixtures';
import type { CreateMigrationRequest, MigrationConfig } from '@/types/migration';

/**
 * Full MigrationConfig form -> request payload parity (task #543). The
 * migration admin page's "Create Migration" dialog surfaces the complete
 * `MigrationConfig` surface (include/exclude repos + paths, the content
 * toggles, conflict resolution, transfer tuning, and the incremental-only
 * date window). This spec drives every control to a non-default value and
 * asserts the outgoing `POST /api/v1/migrations` body maps 1:1 to the
 * `CreateMigrationRequest` / `MigrationConfig` shape in `types/migration.ts`.
 *
 * Runs in the `interactions` project (admin storageState).
 *
 * Assertion strategy: outgoing-request payload capture (backend-agnostic,
 * CI-stable). The create POST is intercepted and stub-fulfilled so the test
 * doesn't depend on the backend actually running a migration against a
 * (nonexistent) source registry. A real source connection is seeded first via
 * the API so the dialog's connection picker is populated — connection creation
 * stores the record without contacting the source, so it is offline-safe.
 */

const MIGRATIONS_PATH = '**/api/v1/migrations';
const RUN_ID = `e2e-mig-${Date.now().toString(36)}`;
const NOW = new Date().toISOString();

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function jobStub(body: CreateMigrationRequest) {
  return {
    id: 'e2e-mig-stub',
    source_connection_id: body.source_connection_id,
    status: 'pending',
    job_type: body.job_type ?? 'full',
    config: body.config ?? {},
    total_items: 0,
    completed_items: 0,
    failed_items: 0,
    skipped_items: 0,
    total_bytes: 0,
    transferred_bytes: 0,
    progress_percent: 0,
    created_at: NOW,
  };
}

test.describe('Migration config form -> payload parity (#543)', () => {
  let connectionId: string | null = null;
  const connectionName = `${RUN_ID}-conn`;

  test.beforeEach(async ({ adminApi }) => {
    // Seed a source connection so the "Create Migration" dialog is enabled and
    // its connection picker has an option. Offline-safe: no source contact.
    const resp = await adminApi.post('/migrations/connections', {
      name: connectionName,
      url: 'https://artifactory.e2e.example.com',
      auth_type: 'api_token',
      source_type: 'artifactory',
      credentials: { token: 'e2e-token' },
    });
    test.skip(
      !resp.ok(),
      `backend rejected source-connection seed (${resp.status()})`,
    );
    const conn = (await resp.json()) as { id: string };
    connectionId = conn.id;
  });

  test.afterEach(async ({ adminApi }) => {
    if (connectionId) {
      await adminApi
        .delete(`/migrations/connections/${connectionId}`)
        .catch(() => {});
      connectionId = null;
    }
  });

  test('every MigrationConfig control maps to the create request body', async ({
    page,
  }) => {
    let body: CreateMigrationRequest | null = null;

    // Intercept only the create POST; let the list GET (same path) reach the
    // backend so the jobs tab renders.
    await page.route(MIGRATIONS_PATH, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      body = route.request().postDataJSON() as CreateMigrationRequest;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(jobStub(body)),
      });
    });

    await page.goto('/migration');
    await page
      .getByRole('tablist')
      .getByRole('tab', { name: /migration jobs/i })
      .click();

    const openBtn = page.getByRole('button', { name: /create migration/i }).first();
    await expect(openBtn).toBeEnabled({ timeout: 10000 });
    await openBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Source Connection + Job Type are unlabeled Radix selects; address them by
    // their combobox order within the dialog. Conflict Resolution has a proper
    // label association and is addressed by name.
    const comboboxes = dialog.getByRole('combobox');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: connectionName }).click();

    await comboboxes.nth(1).click();
    await page.getByRole('option', { name: 'Incremental' }).click();

    // Exclude lists (comma-separated -> string[]).
    await dialog.getByLabel(/exclude repositories/i).fill('repo-a, repo-b');
    await dialog.getByLabel(/exclude paths/i).fill('**/snapshots/**');

    // Content toggles — flip each away from its default.
    await dialog.getByLabel('Users', { exact: true }).uncheck(); // true -> false
    // Groups left checked (default true) to prove an untouched toggle persists.
    await dialog.getByLabel('Permissions', { exact: true }).uncheck(); // true -> false
    await dialog.getByLabel('Cached remote artifacts').check(); // false -> true
    await dialog.getByLabel('Verify checksums').uncheck(); // true -> false
    await dialog.getByLabel('Dry run (simulate without transferring)').check(); // false -> true

    // Transfer tuning.
    await dialog.getByLabel(/conflict resolution/i).click();
    await page.getByRole('option', { name: 'Overwrite' }).click();
    await dialog.getByLabel(/concurrent transfers/i).fill('8');
    await dialog.getByLabel(/throttle delay/i).fill('250');

    // Incremental-only date window (renders because Job Type = Incremental).
    await dialog.getByLabel(/date from/i).fill('2025-01-01T00:00');
    await dialog.getByLabel(/date to/i).fill('2025-06-30T23:59');

    await dialog.getByRole('button', { name: /create migration/i }).click();

    await expect.poll(() => body).not.toBeNull();
    const payload = body as unknown as CreateMigrationRequest;
    const config = payload.config as MigrationConfig;

    expect(payload.source_connection_id).toBe(connectionId);
    expect(payload.job_type).toBe('incremental');

    expect(config.exclude_repos).toEqual(['repo-a', 'repo-b']);
    expect(config.exclude_paths).toEqual(['**/snapshots/**']);
    // No source repos loaded (fake registry) -> allowlist stays empty.
    expect(config.include_repos).toEqual([]);

    expect(config.include_users).toBe(false);
    expect(config.include_groups).toBe(true);
    expect(config.include_permissions).toBe(false);
    expect(config.include_cached_remote).toBe(true);
    expect(config.verify_checksums).toBe(false);
    expect(config.dry_run).toBe(true);

    expect(config.conflict_resolution).toBe('overwrite');
    expect(config.concurrent_transfers).toBe(8);
    expect(config.throttle_delay_ms).toBe(250);

    // Incremental branch emits RFC3339 timestamps (TZ-normalized, so assert
    // shape rather than an exact value).
    expect(config.date_from).toMatch(ISO_8601);
    expect(config.date_to).toMatch(ISO_8601);
  });
});
