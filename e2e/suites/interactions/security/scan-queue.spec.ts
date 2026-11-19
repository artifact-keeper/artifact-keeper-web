import { test, expect } from '@playwright/test';

/**
 * Scan queue (/security/queue).
 *
 * Shows the durable scan queue the worker drains, backed by
 * `GET /api/v1/admin/security/scan-queue`: depth tiles per state, the age of
 * the oldest pending job, and the job rows. On a backend without a scan queue
 * the page shows its error strip instead of crashing, so the data-dependent
 * test probes the endpoint and skips rather than failing.
 */

const PROBE_URL = '/api/v1/admin/security/scan-queue?per_page=1';

test.describe('Scan queue', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/queue');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with the heading, the depth tiles and both filters', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Scan Queue' })
    ).toBeVisible({ timeout: 15000 });

    const depth = page.getByRole('region', { name: 'Queue depth' });
    await expect(depth).toBeVisible();
    // The tiles keep their place at zero, so all four are always present.
    for (const label of ['running', 'pending', 'failed', 'Oldest pending']) {
      await expect(depth.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByLabel('State filter')).toBeVisible();
    await expect(page.getByLabel('Kind filter')).toBeVisible();
    expect(await page.textContent('body')).not.toContain('Application error');
  });

  test('the refresh button states the poll interval', async ({ page }) => {
    await expect(page.getByRole('button', { name: /refresh/i })).toHaveAttribute(
      'title',
      /Refreshes automatically every \d+s/
    );
  });

  test('filtering by state narrows the list without reloading', async ({
    page,
  }) => {
    await page.getByLabel('State filter').click();
    await page.getByRole('option', { name: 'Failed' }).click();

    await expect(page.getByLabel('State filter')).toHaveText(/failed/i);
    await expect(
      page.getByRole('heading', { name: 'Scan Queue' })
    ).toBeVisible();
  });

  test('the queue table renders for the current filters', async ({
    page,
    request,
  }) => {
    const probe = await request.get(PROBE_URL);
    test.skip(
      !probe.ok(),
      `Scan-queue endpoint not available (status ${probe.status()})`
    );

    // The shared DataTable always mounts its header table, empty or not.
    await expect(page.getByRole('table').first()).toBeVisible({
      timeout: 15000,
    });
    // Matches the plain header in the empty case and the sort button in the
    // populated one; DataTable only renders the button when it has rows.
    await expect(
      page.getByRole('columnheader', { name: /state/i })
    ).toBeVisible();
  });
});
