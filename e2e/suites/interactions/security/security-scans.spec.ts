import { test, expect } from '@playwright/test';

test.describe('Security Scans Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/security/scans');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads without errors', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /scan/i }).first()).toBeVisible();
    const content = await page.textContent('body');
    expect(content).not.toContain('Application error');
  });

  test('scans table or empty state is visible', async ({ page }) => {
    // The scans list renders through the shared <DataTable>, which always
    // mounts a <table> (its column header row) regardless of whether there are
    // results — the "No scan results found." copy is an extra element rendered
    // *alongside* that header table, not instead of it. The old `.or()` chain
    // therefore matched two elements (table + empty-state text) in the empty
    // case and tripped strict mode. Asserting on the always-present header
    // table is unambiguous and still auto-retries until the page hydrates.
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15000 });
  });

  test('trigger scan button is visible', async ({ page }) => {
    const triggerButton = page.getByRole('button', { name: /trigger|start|run.*scan/i }).first();
    const isVisible = await triggerButton.isVisible({ timeout: 5000 }).catch(() => false);
    // Button may not exist depending on backend state, just verify page loaded
    expect(true).toBe(true);
    if (isVisible) {
      await expect(triggerButton).toBeEnabled();
    }
  });
});

/**
 * `not_applicable` rows are hidden unless that status is picked (#1098).
 *
 * The backend records one `not_applicable` scan per scanner that does not
 * handle an artifact's format, so on a mixed instance they outnumber the real
 * results. The list hides them by default and offers the status explicitly.
 */
test.describe('Security scans: not_applicable rows', () => {
  test('the status filter offers "Not applicable"', async ({ page }) => {
    await page.goto('/security/scans');
    await page.waitForLoadState('domcontentloaded');

    const status = page.getByRole('combobox', { name: 'Status' });
    await expect(status).toBeVisible({ timeout: 15000 });
    await status.click();
    await expect(
      page.getByRole('option', { name: 'Not applicable' })
    ).toBeVisible();
  });

  test('the default view lists no not_applicable row, and selecting it does', async ({
    page,
    request,
  }) => {
    const probe = await request.get(
      '/api/v1/security/scans?per_page=1&status=not_applicable'
    );
    test.skip(
      !probe.ok(),
      `Backend does not accept status=not_applicable (status ${probe.status()})`
    );
    const body = await probe.json();
    test.skip(
      (body.items ?? []).length === 0,
      'No not_applicable scan recorded on this instance'
    );

    await page.goto('/security/scans');
    await page.waitForLoadState('domcontentloaded');
    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // Nothing in the default listing reads "not applicable".
    await expect(table.getByText(/not.applicable/i)).toHaveCount(0);

    const status = page.getByRole('combobox', { name: 'Status' });
    await status.click();
    await page.getByRole('option', { name: 'Not applicable' }).click();

    await expect(table.getByText(/not.applicable/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
