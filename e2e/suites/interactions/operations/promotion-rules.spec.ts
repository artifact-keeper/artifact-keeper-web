import { test, expect, navigateTo, openDialog, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Promotion Rules (/promotion-rules). Built in artifact-keeper-web#509.
test.describe('Promotion Rules Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/promotion-rules');
  });

  test('page loads with Promotion Rules heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /promotion rules/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/staging to release repositories/i)).toBeVisible({ timeout: 10000 });
  });

  test('New Rule button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new rule/i })).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Rule opens a dialog with source/target and gate fields', async ({ page }) => {
    const dialog = await openDialog(page, /new rule/i);
    await expect(dialog.getByLabel(/source repository/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/target repository/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/max cve severity/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByLabel(/allowed licenses/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows rules, the empty state, or a load error (never blank)', async ({ page }) => {
    const settled = page
      .getByText(/no promotion rules yet/i)
      .or(page.getByText(/couldn't load promotion rules/i))
      .or(page.getByRole('button', { name: /^evaluate /i }).first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
