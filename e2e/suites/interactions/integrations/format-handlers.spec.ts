import { test, expect, navigateTo, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Format Handlers admin (/format-handlers). Built in artifact-keeper-web#510.
test.describe('Format Handlers Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/format-handlers');
  });

  test('page loads with Format Handlers heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /format handlers/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/built-in and WASM plugins/i)).toBeVisible({ timeout: 10000 });
  });

  test('filter input is visible', async ({ page }) => {
    await expect(page.getByLabel(/filter handlers/i)).toBeVisible({ timeout: 10000 });
  });

  test('lists handlers (or shows empty/error) and supports filtering', async ({ page }) => {
    const settled = page
      .getByText(/no format handlers/i)
      .or(page.getByText(/couldn't load format handlers/i))
      .or(page.getByRole('button', { name: /^test /i }).first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });

    // typing in the filter should not error
    await page.getByLabel(/filter handlers/i).fill('pypi');
    await page.waitForTimeout(500);
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
