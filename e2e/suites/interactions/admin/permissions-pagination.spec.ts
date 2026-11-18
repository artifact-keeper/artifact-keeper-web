import { test, expect } from '@playwright/test';

/**
 * The permissions list is paged on the server (#1181). The backend caps
 * `per_page` at 100, so the old single `per_page=1000` request showed at most
 * 100 permissions with no way to reach the rest.
 */
test('the permissions list is requested in pages the backend serves (#1181)', async ({ page, request }) => {
  const listed = page.waitForRequest((r) => /\/api\/v1\/permissions\?/.test(r.url()));
  await page.goto('/permissions');
  const url = new URL((await listed).url());
  expect(url.searchParams.get('page')).toBe('1');
  expect(Number(url.searchParams.get('per_page'))).toBeLessThanOrEqual(100);

  const probe = await request.get('/api/v1/permissions?per_page=1');
  expect(probe.ok()).toBeTruthy();
  const { pagination } = await probe.json();
  if (pagination.total > 100) {
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled({ timeout: 10000 });
  }
});
