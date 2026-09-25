import { test, expect } from '../../../fixtures/test-fixtures';
import type { Route } from '@playwright/test';

/**
 * A migration that finished with some failed items renders as finished
 * (#886). Since artifact-keeper#3521 the backend ends such a job as
 * `completed_with_errors`; the web mapped that unknown status to `pending`,
 * so the job read as "Pending" at "~100%" and its reconciliation report was
 * never fetched, because the report query only runs for terminal statuses.
 *
 * Runs in the `interactions` project (admin storageState).
 *
 * Assertion strategy: the job list, its report and its items are
 * stub-fulfilled, because producing a real `completed_with_errors` job needs a
 * source registry that fails some transfers. Source connections are left to
 * the backend.
 */

const JOB_ID = '0e2e0886-0000-4000-8000-000000000886';
const NOW = new Date().toISOString();

// Matches the list endpoint with or without a query string, but not
// `/migrations/connections` or `/migrations/{id}/...`.
const JOBS_LIST = /\/api\/v1\/migrations(\?.*)?$/;
const REPORT = new RegExp(`/api/v1/migrations/${JOB_ID}/report(\\?.*)?$`);
const ITEMS = new RegExp(`/api/v1/migrations/${JOB_ID}/items(\\?.*)?$`);

// The job from the issue: 145,129 of 145,144 artifacts moved, 15 failed.
const job = {
  id: JOB_ID,
  source_connection_id: '0e2e0886-0000-4000-8000-00000000c0de',
  status: 'completed_with_errors',
  job_type: 'full',
  config: {},
  total_items: 145144,
  completed_items: 145129,
  failed_items: 15,
  skipped_items: 0,
  total_bytes: 181_000_000_000,
  transferred_bytes: 181_000_000_000,
  progress_percent: 99.99,
  started_at: NOW,
  finished_at: NOW,
  created_at: NOW,
};

const report = {
  id: '0e2e0886-0000-4000-8000-0000000e5e57',
  job_id: JOB_ID,
  generated_at: NOW,
  summary: {
    duration_seconds: 3600,
    artifacts: { total: 145144, migrated: 145129, failed: 15, skipped: 0 },
    total_bytes_transferred: 181_000_000_000,
  },
  warnings: [],
  errors: [
    {
      code: 'MIGRATION_FAILED',
      message: 'checksum mismatch',
      item_path: 'maven-releases/com/acme/lib/1.0/lib-1.0.jar',
    },
  ],
  recommendations: [],
};

function fulfillJson(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('Migration job finished with errors (#886)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(JOBS_LIST, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await fulfillJson(route, {
        items: [job],
        pagination: { page: 1, per_page: 100, total: 1, total_pages: 1 },
      });
    });
    await page.route(REPORT, (route) => fulfillJson(route, report));
    await page.route(ITEMS, (route) =>
      fulfillJson(route, {
        items: [],
        pagination: { page: 1, per_page: 100, total: 0, total_pages: 0 },
      }),
    );

    await page.goto('/migration');
    await page
      .getByRole('tablist')
      .getByRole('tab', { name: /migration jobs/i })
      .click();
  });

  test('the job row reads as finished, not pending', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: JOB_ID.slice(0, 8) });
    await expect(row).toBeVisible({ timeout: 10000 });

    await expect(row).toContainText('completed with errors');
    await expect(row).not.toContainText(/pending/i);
    // Finished jobs show an exact 100%; the "~" marks a still-enumerating job.
    await expect(row.getByText('100%', { exact: true })).toBeVisible();
    await expect(row).not.toContainText('~');
    await expect(row).toContainText('145129/145144');
    await expect(row).toContainText('(15 failed)');
  });

  test('the detail dialog fetches and shows the reconciliation report', async ({
    page,
  }) => {
    const reportRequest = page.waitForRequest(REPORT);
    await page
      .getByRole('button', { name: `${JOB_ID.slice(0, 8)}...` })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await reportRequest;

    await expect(dialog).toContainText('completed with errors');
    await expect(dialog.getByText('Reconciliation Report')).toBeVisible();
    // Both render only once the report query has resolved.
    await expect(dialog.getByRole('button', { name: 'HTML' })).toBeVisible();
  });
});
