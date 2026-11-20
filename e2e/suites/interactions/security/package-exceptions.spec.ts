import { test, expect, type APIRequestContext } from '@playwright/test';
import { backendAtLeast, EXCEPTIONS_MIN } from '../../../../src/lib/backend-version';

/**
 * Request-and-grant, end to end: a user asks for a package a gate is
 * withholding, then a reviewer grants the exception from the queue.
 *
 * The UI offers the queue only when `/health` reports backend 1.13.0 or later
 * (`EXCEPTIONS_MIN`), so the request-and-grant test skips unless both the
 * route answers and the version clears the gate; the other test checks the
 * notice shown when it does not. Vitest already covers the
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

/** Whether the UI will offer the queue: the same gate the app applies */
async function uiOffersQueue(request: APIRequestContext): Promise<boolean> {
  // Read the version whatever the status: a degraded backend answers 503
  // with the same body.
  const health = await request.get('/health');
  const body = (await health.json().catch(() => null)) as { version?: string } | null;
  return backendAtLeast(body?.version, EXCEPTIONS_MIN);
}

test.describe('Package exceptions', () => {
  test('a user requests a package and a reviewer grants it', async ({ page, request }) => {
    test.skip(
      !(await queueAvailable(request)) || !(await uiOffersQueue(request)),
      'This backend has no package exception queue, or reports a version below 1.13.0',
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

  test('the queue says so plainly when the backend is older than 1.13.0', async ({
    page,
    request,
  }) => {
    test.skip(
      await uiOffersQueue(request),
      'This backend reports 1.13.0 or later, so the version notice is unreachable',
    );

    await page.goto('/exceptions');
    await page.waitForLoadState('domcontentloaded');

    // Degrade, never crash: the sidebar hides the entry on such a backend,
    // but a bookmark or a refusal link still lands here, so the page has to
    // name the release it needs rather than call routes that 404.
    await expect(
      page.getByText(/requires backend 1\.13\.0 or later/i),
    ).toBeVisible({ timeout: 10000 });
    expect(await page.textContent('body')).not.toContain('Application error');
  });
});
