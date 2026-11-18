import { test, expect, type Route } from '@playwright/test';

/**
 * The permissions list is paged on the server (#1181). The backend caps
 * `per_page` at 100, so the old single `per_page=1000` request showed at most
 * 100 permissions with no way to reach the rest.
 */
const LIST_URL = /\/api\/v1\/permissions\?/;

test('the permissions list is requested in pages the backend serves (#1181)', async ({ page }) => {
  const listed = page.waitForRequest(LIST_URL);
  await page.goto('/permissions');
  const url = new URL((await listed).url());
  expect(url.searchParams.get('page')).toBe('1');
  expect(Number(url.searchParams.get('per_page'))).toBeLessThanOrEqual(100);
});

/**
 * The E2E seed creates fewer than 100 rules, so paging never ran against it
 * (#1189). Serve 150 rules from a mocked list so Next page always has a
 * second page to reach.
 */
test('Next page loads the second page of rules (#1189)', async ({ page }) => {
  const TOTAL = 150;
  const requestedPages: string[] = [];

  await page.route(LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const url = new URL(route.request().url());
    const pageNo = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const perPage = Math.min(100, Number(url.searchParams.get('per_page') ?? '20'));
    requestedPages.push(String(pageNo));
    const start = (pageNo - 1) * perPage;
    const count = Math.max(0, Math.min(perPage, TOTAL - start));
    const items = Array.from({ length: count }, (_, i) => {
      const n = start + i + 1;
      return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        principal_type: 'user',
        principal_id: '00000000-0000-4000-8000-000000000aaa',
        principal_name: `e2e-paged-rule-${n}`,
        target_type: 'repository',
        target_id: '00000000-0000-4000-8000-000000000bbb',
        target_name: 'e2e-paged-repo',
        actions: ['read'],
        conditions: {},
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        pagination: {
          page: pageNo,
          per_page: perPage,
          total: TOTAL,
          total_pages: Math.ceil(TOTAL / perPage),
        },
      }),
    });
  });

  await page.goto('/permissions');
  await expect(page.getByText('e2e-paged-rule-1', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByText('e2e-paged-rule-101', { exact: true })).toHaveCount(0);

  const next = page.getByRole('button', { name: 'Next page' });
  await expect(next).toBeEnabled();
  await next.click();

  await expect(page.getByText('e2e-paged-rule-101', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('e2e-paged-rule-150', { exact: true })).toBeVisible();
  await expect(page.getByText('e2e-paged-rule-1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(next).toBeDisabled();
  expect(requestedPages).toContain('2');
});
