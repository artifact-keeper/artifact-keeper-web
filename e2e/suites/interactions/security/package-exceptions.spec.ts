import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Request-and-grant, end to end: a user asks for a package a gate is
 * withholding, then a reviewer grants the exception from the queue.
 *
 * Skips wholesale on a backend that predates the exception queue, which is
 * what `/api/v1/exceptions/reviews` 404ing means. Vitest already covers the
 * rendering and the validation; what only a browser can prove is that the
 * form's fields reach the API and the row comes back on the queue.
 */

const REPO = 'e2e-npm-remote';
const PACKAGE = `e2e-exception-${Date.now()}`;
const VERSION = '0.0.1';

async function queueAvailable(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get('/api/v1/exceptions/reviews?per_page=1');
  return probe.ok();
}

test.describe('Package exceptions', () => {
  test('a user requests a package and a reviewer grants it', async ({ page, request }) => {
    test.skip(
      !(await queueAvailable(request)),
      'This backend has no package exception queue',
    );

    // --- ask ---------------------------------------------------------------
    // These are the query parameters the backend's refusal link carries, so
    // a blocked `npm install` lands here with the coordinate already filled.
    await page.goto(
      `/exceptions/request?repo=${REPO}&package=${PACKAGE}&version=${VERSION}&gate=scan`,
    );
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByLabel('Repository')).toHaveValue(REPO);
    await expect(page.getByLabel('Package')).toHaveValue(PACKAGE);
    await expect(page.getByLabel('Version')).toHaveValue(VERSION);

    const send = page.getByRole('button', { name: /send request/i });
    await expect(send).toBeDisabled();

    await page.getByLabel(/why do you need it/i).fill('e2e: the build needs it');
    await expect(send).toBeEnabled();
    await send.click();

    await expect(page.getByRole('heading', { name: /request sent/i })).toBeVisible({ timeout: 10000 });

    // --- grant -------------------------------------------------------------
    await page.goto('/exceptions');
    await page.waitForLoadState('domcontentloaded');

    const row = page.getByRole('row').filter({ hasText: PACKAGE });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText('e2e: the build needs it');
    await expect(row).toContainText(REPO);

    await row.getByRole('button', { name: new RegExp(`^Grant ${PACKAGE}`) }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // A grant is the one action that widens what the instance serves, so it
    // cannot be confirmed until the reason is recorded.
    const confirm = dialog.getByRole('button', { name: /confirm/i });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel(/expires after/i).fill('30');
    await expect(dialog.getByText(/serves the package for 30 days/i)).toBeVisible();
    await dialog.getByLabel(/^reason/i).fill('e2e: accepted for the test');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // --- and it is granted, with a window ----------------------------------
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Approved' }).click();

    const granted = page.getByRole('row').filter({ hasText: PACKAGE });
    await expect(granted).toBeVisible({ timeout: 10000 });
    await expect(granted).toContainText(/until /i);
  });

  test('the queue says so plainly when the backend has no exception queue', async ({
    page,
    request,
  }) => {
    test.skip(
      await queueAvailable(request),
      'This backend has the exception queue, so the degraded path is unreachable',
    );

    await page.goto('/exceptions');
    await page.waitForLoadState('domcontentloaded');

    // Degrade, never crash: the page is reachable from the sidebar on any
    // backend, so a missing endpoint has to read as a missing feature.
    await expect(
      page.getByText(/does not have the package exception queue/i),
    ).toBeVisible({ timeout: 10000 });
    expect(await page.textContent('body')).not.toContain('Application error');
  });
});
