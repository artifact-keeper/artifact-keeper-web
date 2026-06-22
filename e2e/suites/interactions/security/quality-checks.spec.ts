import { test, expect, navigateTo, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Quality Checks results + issue suppression (/quality-checks). Built in artifact-keeper-web#511.
test.describe('Quality Checks Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/quality-checks');
  });

  test('page loads with Quality Checks heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /quality checks/i })).toBeVisible({ timeout: 10000 });
  });

  test('Run checks button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /run checks/i })).toBeVisible({ timeout: 10000 });
  });

  test('shows results, the empty state, or a load error (never blank)', async ({ page }) => {
    const settled = page
      .getByText(/no quality-check results/i)
      .or(page.getByText(/couldn't load quality checks/i))
      .or(page.getByRole('button', { name: /view issues/i }).first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
