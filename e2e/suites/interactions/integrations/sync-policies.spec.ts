import { test, expect, navigateTo, openDialog, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Replication Sync Policies (/sync-policies). Built in artifact-keeper-web#508.
test.describe('Sync Policies Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/sync-policies');
  });

  test('page loads with Sync Policies heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sync policies/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/which artifacts replicate/i)).toBeVisible({ timeout: 10000 });
  });

  test('New Policy button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new policy/i })).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Policy opens a dialog with Name and Mode', async ({ page }) => {
    const dialog = await openDialog(page, /new policy/i);
    await expect(dialog.getByLabel(/^name$/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/filter glob/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows policies, the empty state, or a load error (never blank)', async ({ page }) => {
    const settled = page
      .getByText(/no sync policies yet/i)
      .or(page.getByText(/couldn't load sync policies/i))
      .or(page.getByRole('switch').first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
