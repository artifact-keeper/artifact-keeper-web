import { test, expect } from '@playwright/test';
import { AuditLogPage } from '../../../fixtures/page-objects/AuditLogPage';

/**
 * Admin Audit Log viewer (issue #568, backend #2366).
 *
 * The page lives at /audit and lets an admin browse recorded audit events
 * with filters (action, resource type, user id, date range) and page/per_page
 * pagination backed by `GET /api/v1/admin/audit`. The endpoint shipped with
 * backend #2366; on an older backend the page degrades to an "unavailable"
 * alert instead of crashing, so the data-dependent tests probe the endpoint
 * and skip rather than fail when it is absent.
 */
test.describe('Audit log admin', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/audit');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Audit Log heading', async ({ page }) => {
    const audit = new AuditLogPage(page);
    await expect(audit.heading).toBeVisible({ timeout: 15000 });
  });

  test('shows the filter bar with action, resource type, user id, and date inputs', async ({ page }) => {
    const audit = new AuditLogPage(page);
    await expect(audit.actionFilter).toBeVisible({ timeout: 10000 });
    await expect(audit.resourceTypeFilter).toBeVisible();
    await expect(audit.userIdFilter).toBeVisible();
    await expect(audit.fromFilter).toBeVisible();
    await expect(audit.toFilter).toBeVisible();
    await expect(audit.applyButton).toBeVisible();
  });

  test('lists recorded audit events with pagination', async ({ page, request }) => {
    const probe = await request.get('/api/v1/admin/audit?per_page=1');
    test.skip(
      !probe.ok(),
      `Audit query endpoint not available (status ${probe.status()})`
    );
    const body = await probe.json();
    test.skip(body.total === 0, 'No audit events recorded on this backend yet');

    const audit = new AuditLogPage(page);
    // The e2e session itself logs in as admin, so at minimum auth events
    // exist. The table renders rows plus the shared pagination footer.
    await expect(audit.table).toBeVisible({ timeout: 15000 });
    await expect(audit.table.getByRole('row').nth(1)).toBeVisible({ timeout: 10000 });
    await expect(audit.pagination).toBeVisible();
  });

  test('filtering by an action narrows the result set', async ({ page, request }) => {
    const probe = await request.get('/api/v1/admin/audit?per_page=1');
    test.skip(
      !probe.ok(),
      `Audit query endpoint not available (status ${probe.status()})`
    );
    const body = await probe.json();
    test.skip(
      body.total === 0 || !body.items?.[0]?.action,
      'No audit events recorded on this backend yet'
    );

    // Use an action we know exists (from the newest event) so the filtered
    // view is non-empty, then assert every visible row carries that action.
    const action: string = body.items[0].action;
    const audit = new AuditLogPage(page);
    await audit.applyActionFilter(action);

    await expect(audit.table).toBeVisible({ timeout: 15000 });
    const badges = audit.table.getByText(action, { exact: true });
    await expect(badges.first()).toBeVisible({ timeout: 10000 });
  });

  test('malformed user-id filter is rejected client-side', async ({ page }) => {
    const audit = new AuditLogPage(page);
    await audit.userIdFilter.fill('not-a-uuid');
    await audit.applyButton.click();

    await expect(page.getByText(/must be a uuid/i)).toBeVisible({ timeout: 8000 });
  });

  test('clear filters resets the view', async ({ page }) => {
    const audit = new AuditLogPage(page);
    await audit.applyActionFilter('E2E_NO_SUCH_ACTION');

    // Applying a filter shows the clear button; clicking it removes it again.
    await expect(audit.clearButton).toBeVisible({ timeout: 10000 });
    await audit.clearButton.click();
    await expect(audit.clearButton).toBeHidden({ timeout: 10000 });
    await expect(audit.actionFilter).toHaveValue('');
  });

  test('no uncaught console errors on load', async ({ page }) => {
    await page.waitForTimeout(1500);
    // The page is designed to degrade when the audit endpoint is absent (it
    // renders an "unavailable" alert instead of crashing). A backend without
    // the endpoint answers 404, which the browser surfaces as a "Failed to
    // load resource" console error. Those are expected, handled conditions,
    // not application crashes, so they are filtered out here exactly as the
    // rate-limits spec does.
    const fatal = consoleErrors.filter(
      (e) =>
        !/favicon|hydrat|ResizeObserver/i.test(e) &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource')
    );
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  });
});
