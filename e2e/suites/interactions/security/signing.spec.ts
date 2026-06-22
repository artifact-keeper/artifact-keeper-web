import { test, expect, navigateTo, openDialog, assertNoAppErrors } from '../../../fixtures/test-fixtures';

// Artifact Signing keys admin page (/signing). Built in artifact-keeper-web#506.
test.describe('Signing Keys Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/signing');
  });

  test('page loads with Signing Keys heading and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /signing keys/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/GPG and RSA keys/i)).toBeVisible({ timeout: 10000 });
  });

  test('New Key button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new key/i })).toBeVisible({ timeout: 10000 });
  });

  test('clicking New Key opens the create dialog with Name and Type', async ({ page }) => {
    const dialog = await openDialog(page, /new key/i);
    await expect(dialog.getByLabel(/^name$/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/private key never leaves the server/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows either a key list, the empty state, or a load error (never blank)', async ({ page }) => {
    const settled = page
      .getByText(/no signing keys yet/i)
      .or(page.getByText(/couldn't load signing keys/i))
      .or(page.getByRole('button', { name: /view public key/i }).first());
    await expect(settled.first()).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await assertNoAppErrors(page);
  });
});
