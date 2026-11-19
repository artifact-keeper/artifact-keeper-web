import { test, expect, navigateTo } from '../../../fixtures/test-fixtures';
import type { Page, Route } from '@playwright/test';

/**
 * Instance-wide storage and monthly transfer quotas.
 *
 * The backend reports them in `GET /api/v1/admin/stats` (administrators) and
 * `GET /api/v1/system/quota` (everyone else), and refuses an upload over a
 * quota with a JSON body. The E2E backend has no quota configured, so these
 * tests stub those responses with `page.route`; the "absent" cases strip the
 * fields so they also hold against a backend that predates quotas.
 */

const GiB = 1024 ** 3;
const ADMIN_STATS = /\/api\/v1\/admin\/stats(\?|$)/;
const SYSTEM_QUOTA = /\/api\/v1\/system\/quota(\?|$)/;
const DISMISS_KEY = 'ak.quota-banner.dismissed';

const QUOTA_FIELDS = ['storage_quota', 'transfer_quota', 'max_upload_bytes', 'quota_help_url'];

function storageQuota(state: 'ok' | 'warning' | 'exceeded', percent: number) {
  return {
    enabled: true,
    quota_bytes: 10 * GiB,
    used_bytes: Math.round((percent / 100) * 10 * GiB),
    percent,
    warn_percent: 80,
    state,
  };
}

function transferQuota(state: 'ok' | 'warning' | 'over' | 'refusing', percent: number) {
  return {
    enabled: true,
    quota_bytes: 50 * GiB,
    used_bytes: Math.round((percent / 100) * 50 * GiB),
    percent,
    warn_percent: 80,
    grace_percent: 25,
    hard_limit_bytes: Math.round(62.5 * GiB),
    state,
    period_start: '2026-11-01T00:00:00Z',
    period_end: '2026-12-01T00:00:00Z',
  };
}

/** Serve the real admin stats with the quota fields replaced. */
async function stubAdminStats(page: Page, quota: Record<string, unknown> | null) {
  await page.unroute(ADMIN_STATS);
  await page.route(ADMIN_STATS, async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    for (const field of QUOTA_FIELDS) delete body[field];
    await route.fulfill({ response, json: { ...body, ...(quota ?? {}) } });
  });
}

// A quota refetch can still be in flight when a test ends; its handler would
// then fail on a disposed response. Drop the stubs without waiting for it.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.describe('Instance quotas (administrator)', () => {
  test('older backend: no banner and no Quotas section', async ({ page }) => {
    await stubAdminStats(page, null);
    await navigateTo(page, '/');
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('quota-banner')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Quotas' })).toHaveCount(0);
  });

  test('dashboard cards and banner for a nearly full storage quota and refused downloads', async ({ page }) => {
    await stubAdminStats(page, {
      storage_quota: storageQuota('warning', 82),
      transfer_quota: transferQuota('refusing', 126),
      max_upload_bytes: 2 * GiB,
      quota_help_url: 'https://example.com/quotas',
    });
    await navigateTo(page, '/');

    const storageNotice = page.getByTestId('quota-banner-storage');
    await expect(storageNotice).toBeVisible({ timeout: 15000 });
    await expect(storageNotice).toHaveAttribute('role', 'status');
    await expect(storageNotice).toContainText('Storage is at 82% of the quota (8.2 GiB / 10 GiB).');

    const transferNotice = page.getByTestId('quota-banner-transfer');
    await expect(transferNotice).toHaveAttribute('role', 'alert');
    await expect(transferNotice).toContainText('downloads are refused until Dec 1, 2026');
    await expect(transferNotice.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      'https://example.com/quotas',
    );

    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible();
    const storageCard = page.getByTestId('quota-card-storage');
    await expect(storageCard).toContainText('8.2 GiB / 10 GiB');
    await expect(storageCard).toContainText('82%');
    await expect(storageCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '82');
    const transferCard = page.getByTestId('quota-card-transfer');
    await expect(transferCard).toContainText('Transfer this month');
    await expect(transferCard).toContainText('resets Dec 1, 2026');
  });

  test('a dismissed notice stays hidden until its state gets worse', async ({ page }) => {
    await stubAdminStats(page, { storage_quota: storageQuota('warning', 82) });
    await navigateTo(page, '/');
    const storageNotice = page.getByTestId('quota-banner-storage');
    await expect(storageNotice).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Dismiss storage quota notice' }).click();
    await expect(storageNotice).toHaveCount(0);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), DISMISS_KEY)).toBe('{"storage":1}');

    // Same state after a reload: still dismissed for this session.
    await page.reload();
    await expect(page.getByTestId('quota-card-storage')).toBeVisible({ timeout: 15000 });
    await expect(storageNotice).toHaveCount(0);

    // The quota fills up: the notice comes back as an alert.
    await stubAdminStats(page, { storage_quota: storageQuota('exceeded', 100) });
    await page.reload();
    await expect(storageNotice).toBeVisible({ timeout: 15000 });
    await expect(storageNotice).toHaveAttribute('role', 'alert');
    await expect(storageNotice).toContainText(
      'Storage quota reached: new uploads are refused; downloads still work. Delete artifacts or raise the quota.',
    );
  });

  test('an upload refused for the storage quota shows the server message', async ({ page }) => {
    await page.route(/\/api\/v1\/repositories\/e2e-generic-versioned\/artifacts$/, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 403,
        json: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: 'Storage quota of 10 GiB reached: new uploads are refused.',
          scope: 'instance',
          limit_bytes: 10 * GiB,
          used_bytes: 10 * GiB,
          help_url: 'https://example.com/quotas',
        },
      });
    });
    await navigateTo(page, '/repositories/e2e-generic-versioned');
    const uploadTab = page.getByRole('tab', { name: /Upload/ });
    const hasUploadTab = await uploadTab
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasUploadTab, 'Seeded generic repository not available');
    await uploadTab.click();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'quota-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('quota'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Storage quota of 10 GiB reached' });
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).not.toContainText('Upload failed');
    await expect(alert.getByRole('link', { name: /Learn more/ })).toHaveAttribute('href', 'https://example.com/quotas');
  });
});

test.describe('Instance quotas (non-administrator)', () => {
  test.use({ storageState: 'e2e/.auth/developer.json' });

  test('reads /system/quota and shows the transfer grace notice', async ({ page }) => {
    await page.route(SYSTEM_QUOTA, (route) =>
      route.fulfill({
        json: {
          storage_quota: { enabled: false, quota_bytes: null, used_bytes: 0, percent: null, warn_percent: 80, state: 'ok' },
          transfer_quota: transferQuota('over', 110),
          max_upload_bytes: 2 * GiB,
          quota_help_url: null,
        },
      }),
    );
    await navigateTo(page, '/');
    const notice = page.getByTestId('quota-banner-transfer');
    await expect(notice).toBeVisible({ timeout: 15000 });
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toContainText('Downloads still work for now, but will be refused after 62.5 GiB until Dec 1, 2026');
    await expect(page.getByTestId('quota-card-transfer')).toContainText('55 GiB / 50 GiB');
    await expect(page.getByTestId('quota-card-storage')).toHaveCount(0);
  });

  test('older backend (404): no banner and no Quotas section', async ({ page }) => {
    await page.route(SYSTEM_QUOTA, (route) => route.fulfill({ status: 404, body: '' }));
    await navigateTo(page, '/');
    await expect(page.getByText('Recent Repositories')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('quota-banner')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Quotas' })).toHaveCount(0);
  });
});
