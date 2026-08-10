import {
  test,
  expect,
  filterCriticalErrors,
  navigateTo,
} from '../../../fixtures/test-fixtures';
import type { Page } from '@playwright/test';

/**
 * npm scope-policy gating in the create-repository dialog (PR #746, backend
 * #2424): the policy lives on npm **remote** (proxy) repos only — the backend
 * rejects it for any other type — so the dialog only shows the scope-policy
 * fields for npm+remote, and creating an npm **virtual** repo must not send
 * the policy (the original bug made every npm virtual create fail).
 */

/** Open the create dialog and pick a format + repo type. */
async function openCreateDialog(page: Page, format: string, type: string) {
  await navigateTo(page, '/repositories');
  await page
    .getByRole('button', { name: /create repository/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // First combobox = Format, second = Type.
  await dialog.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: format, exact: true }).click();
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: type, exact: true }).click();
  return dialog;
}

test.describe('Create npm repository (#746)', () => {
  test('npm virtual does not show scope-policy fields', async ({ page }) => {
    const dialog = await openCreateDialog(page, 'NPM', 'Virtual');

    await expect(dialog.getByText('npm Scope Policy')).toHaveCount(0);
    await expect(dialog.getByLabel('Allowed scopes')).toHaveCount(0);
    await expect(dialog.getByLabel('Allowed name patterns')).toHaveCount(0);
    await expect(dialog.getByLabel('Allow unscoped names')).toHaveCount(0);

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });

  test('npm remote shows scope-policy fields', async ({ page }) => {
    const dialog = await openCreateDialog(page, 'NPM', 'Remote');

    await expect(dialog.getByText('npm Scope Policy')).toBeVisible({
      timeout: 10000,
    });
    await expect(dialog.getByLabel('Allowed scopes')).toBeVisible();
    await expect(dialog.getByLabel('Allowed name patterns')).toBeVisible();
    await expect(dialog.getByLabel('Allow unscoped names')).toBeVisible();

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });

  test('creating an npm virtual repository succeeds', async ({
    page,
    adminApi,
  }) => {
    const key = `e2e-npm-virt-${Date.now().toString(36)}`;
    try {
      const dialog = await openCreateDialog(page, 'NPM', 'Virtual');
      await dialog.locator('#create-key').fill(key);
      await dialog.locator('#create-name').fill('E2E NPM Virtual');

      // Virtual repos need at least one member (backend #1279/#1444 rejects an
      // explicit empty member_repos) — aggregate the seeded npm remote repo.
      await dialog
        .getByRole('checkbox', { name: /E2E NPM Remote/ })
        .check();

      // Capture the create payload: it must not carry any npm scope-policy
      // fields (the #746 bug — the backend rejects the policy on non-remote
      // repos, which used to make every npm virtual create fail).
      const createRequest = page.waitForRequest(
        (req) =>
          req.url().includes('/api/v1/repositories') && req.method() === 'POST',
        { timeout: 15000 }
      );
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      const payload = createRequest.then((r) => r.postDataJSON());

      // The backend accepts the payload and the dialog closes with a toast.
      await expect(dialog).toBeHidden({ timeout: 15000 });
      await expect(page.getByText('Repository created')).toBeVisible({
        timeout: 10000,
      });

      const body = await payload;
      expect(body.format).toBe('npm');
      expect(body.repo_type).toBe('virtual');
      expect(body).not.toHaveProperty('npm_allowed_scopes');
      expect(body).not.toHaveProperty('npm_allowed_name_patterns');
      expect(body).not.toHaveProperty('npm_allow_unscoped');
      expect(body).not.toHaveProperty('npm_scope_policy');

      // The new repo appears in the list.
      await expect(
        page.getByRole('button', { name: new RegExp(`^${key} `) })
      ).toBeVisible({ timeout: 10000 });
    } finally {
      // Clean up so reruns stay idempotent.
      await adminApi.delete(`/repositories/${key}`).catch(() => {});
    }
  });

  test('create dialog loads without console errors', async ({
    page,
    consoleErrors,
  }) => {
    const dialog = await openCreateDialog(page, 'NPM', 'Remote');
    await expect(dialog.getByText('npm Scope Policy')).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(1000);
    expect(filterCriticalErrors(consoleErrors)).toEqual([]);

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });
});
