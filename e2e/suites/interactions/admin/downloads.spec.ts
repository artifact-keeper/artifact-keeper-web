import { test, expect } from '@playwright/test';
import { DownloadsPage } from '../../../fixtures/page-objects/DownloadsPage';

/**
 * Download Attribution & Network-Topology dashboard (issue #569, backend #2365).
 *
 * The page lives at /downloads and lets an admin browse attributed download
 * events (who pulled what, from which client IP) with filters (artifact id,
 * user id, client IP, date range), page/per_page pagination, and grouped
 * By IP / Subnet and By User topology views, backed by
 * `GET /api/v1/admin/downloads` (+ /by-ip/{ip}, /by-user/{user_id}).
 * The endpoints shipped with backend #2365; on an older backend the page
 * degrades to an "unavailable" alert instead of crashing, so the
 * data-dependent tests probe the endpoint and skip rather than fail when it
 * is absent.
 */
test.describe('Downloads admin', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/downloads');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Downloads heading', async ({ page }) => {
    const downloads = new DownloadsPage(page);
    await expect(downloads.heading).toBeVisible({ timeout: 15000 });
  });

  test('shows the filter bar with artifact, user, IP, and date inputs', async ({ page }) => {
    const downloads = new DownloadsPage(page);
    await expect(downloads.artifactIdFilter).toBeVisible({ timeout: 10000 });
    await expect(downloads.userIdFilter).toBeVisible();
    await expect(downloads.ipFilter).toBeVisible();
    await expect(downloads.fromFilter).toBeVisible();
    await expect(downloads.toFilter).toBeVisible();
    await expect(downloads.applyButton).toBeVisible();
  });

  test('shows the Events / By IP / By User view tabs', async ({ page }) => {
    const downloads = new DownloadsPage(page);
    await expect(downloads.eventsTab).toBeVisible({ timeout: 10000 });
    await expect(downloads.byIpTab).toBeVisible();
    await expect(downloads.byUserTab).toBeVisible();
  });

  test('lists attributed download events with pagination', async ({ page, request }) => {
    const probe = await request.get('/api/v1/admin/downloads?per_page=1');
    test.skip(
      !probe.ok(),
      `Downloads attribution endpoint not available (status ${probe.status()})`
    );
    const body = await probe.json();
    test.skip(body.total === 0, 'No downloads recorded on this backend yet');

    const downloads = new DownloadsPage(page);
    await expect(downloads.table).toBeVisible({ timeout: 15000 });
    await expect(downloads.table.getByRole('row').nth(1)).toBeVisible({ timeout: 10000 });
    await expect(downloads.pagination).toBeVisible();
  });

  test('the by-IP topology view groups events by network location', async ({ page, request }) => {
    const probe = await request.get('/api/v1/admin/downloads?per_page=1');
    test.skip(
      !probe.ok(),
      `Downloads attribution endpoint not available (status ${probe.status()})`
    );
    const body = await probe.json();
    test.skip(body.total === 0, 'No downloads recorded on this backend yet');

    const downloads = new DownloadsPage(page);
    await downloads.byIpTab.click();
    // Grouped table renders with a subnet column header.
    await expect(downloads.table).toBeVisible({ timeout: 15000 });
    await expect(
      downloads.table.getByRole('columnheader', { name: /subnet/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('the by-IP endpoint answers for a recorded IP', async ({ request }) => {
    const probe = await request.get('/api/v1/admin/downloads?per_page=1');
    test.skip(
      !probe.ok(),
      `Downloads attribution endpoint not available (status ${probe.status()})`
    );
    const body = await probe.json();
    const ip: string | null = body.downloads?.[0]?.ip_address ?? null;
    test.skip(!ip, 'No download with a recorded client IP on this backend yet');

    const byIp = await request.get(
      `/api/v1/admin/downloads/by-ip/${encodeURIComponent(ip as string)}?per_page=5`
    );
    expect(byIp.ok()).toBeTruthy();
    const byIpBody = await byIp.json();
    expect(byIpBody.total).toBeGreaterThan(0);
    for (const row of byIpBody.downloads) {
      expect(row.ip_address).toBe(ip);
    }
  });

  test('malformed user-id filter is rejected client-side', async ({ page }) => {
    const downloads = new DownloadsPage(page);
    await downloads.userIdFilter.fill('not-a-uuid');
    await downloads.applyButton.click();

    await expect(page.getByText(/must be a uuid/i)).toBeVisible({ timeout: 8000 });
  });

  test('clear filters resets the view', async ({ page }) => {
    const downloads = new DownloadsPage(page);
    await downloads.applyIpFilter('203.0.113.99');

    // Applying a filter shows the clear button; clicking it removes it again.
    await expect(downloads.clearButton).toBeVisible({ timeout: 10000 });
    await downloads.clearButton.click();
    await expect(downloads.clearButton).toBeHidden({ timeout: 10000 });
    await expect(downloads.ipFilter).toHaveValue('');
  });

  test('no uncaught console errors on load', async ({ page }) => {
    await page.waitForTimeout(1500);
    // The page is designed to degrade when the downloads endpoints are absent
    // (it renders an "unavailable" alert instead of crashing). A backend
    // without the endpoints answers 404, which the browser surfaces as a
    // "Failed to load resource" console error. Those are expected, handled
    // conditions, not application crashes, so they are filtered out here
    // exactly as the rate-limits and audit specs do.
    const fatal = consoleErrors.filter(
      (e) =>
        !/favicon|hydrat|ResizeObserver/i.test(e) &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource')
    );
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  });
});
