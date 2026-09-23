import { test, expect } from '../../../fixtures/test-fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * #900 — dialogs broke on long content.
 *
 * Asserted geometrically rather than by class name: the reports were "the table
 * sticks out of the modal" and "the buttons are under the window with no
 * scroll", and a box comparison is what actually holds those two down.
 */

// The backend prefixes `svc-`, so the stored username is `svc-<name>`.
const LONG_ACCOUNT = 'dialog-overflow-e2e';
const LONG_TOKEN_NAMES = [
  'pos-aggregated-restore-nightly-from-upstream-mirror',
  'pos-aggregated-promote-release-candidate-to-production',
];

/** Room for sub-pixel rounding and a scrollbar gutter. */
const SLACK = 2;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element must be laid out').not.toBeNull();
  return b!;
}

/** Create the account and its long-named tokens; tolerate re-runs. */
async function seedAccountWithLongTokens(page: Page): Promise<boolean> {
  const created = await page.request.post('/api/v1/service-accounts', {
    data: { name: LONG_ACCOUNT, description: '#900 dialog overflow fixture' },
  });
  if (!created.ok() && created.status() !== 400 && created.status() !== 409) return false;

  const list = await page.request.get('/api/v1/service-accounts?per_page=100');
  if (!list.ok()) return false;
  const account = ((await list.json()).items ?? []).find((a: { username: string }) =>
    a.username.includes(LONG_ACCOUNT)
  );
  if (!account) return false;

  const existing = await page.request.get(`/api/v1/service-accounts/${account.id}/tokens`);
  const have: string[] = existing.ok()
    ? ((await existing.json()).items ?? []).map((t: { name: string }) => t.name)
    : [];
  for (const name of LONG_TOKEN_NAMES) {
    if (have.includes(name)) continue;
    const token = await page.request.post(`/api/v1/service-accounts/${account.id}/tokens`, {
      data: {
        name,
        scopes: ['read:artifacts', 'write:artifacts'],
        expires_in_days: 30,
        repo_selector: { match_formats: ['nuget'], match_pattern: 'pos-aggregated-*' },
      },
    });
    // A token the API refused would leave the fixture without its long names:
    // skip rather than fail on setup.
    if (!token.ok()) return false;
  }
  return true;
}

/**
 * A repository whose key is long enough to overflow the Edit dialog's select,
 * plus a permission on it so the page has a row to edit. Returns false when the
 * fixture cannot be built, so the test skips rather than failing on setup.
 */
async function seedPermissionOnLongRepoKey(page: Page): Promise<boolean> {
  const repoKey = 'pos-aggregated-nuget-restore-mirror-e2e-900';
  const created = await page.request.post('/api/v1/repositories', {
    data: { key: repoKey, name: repoKey, repo_type: 'local', format: 'nuget' },
  });
  // 400/409 is "already exists" on a re-run; anything else is a real failure.
  if (!created.ok() && created.status() !== 400 && created.status() !== 409) return false;

  const repos = await page.request.get('/api/v1/repositories?per_page=100');
  if (!repos.ok()) return false;
  const repo = ((await repos.json()).items ?? []).find(
    (r: { key: string }) => r.key === repoKey
  );
  if (!repo) return false;

  const users = await page.request.get('/api/v1/users?per_page=50&is_service_account=false');
  if (!users.ok()) return false;
  const user = ((await users.json()).items ?? []).find(
    (u: { username: string }) => u.username === 'e2e-viewer'
  );
  if (!user) return false;

  // `target_id` is the repository's UUID, which is what the form itself sends.
  const grant = await page.request.post('/api/v1/permissions', {
    data: {
      principal_type: 'user',
      principal_id: user.id,
      target_type: 'repository',
      target_id: repo.id,
      actions: ['read'],
    },
  });
  if (grant.ok()) return true;
  const body = await grant.text();
  return grant.status() === 409 || body.includes('already exists');
}

test.describe('#900 dialogs with long content', () => {
  test('the token table stays inside the dialog', async ({ page }) => {
    test.skip(!(await seedAccountWithLongTokens(page)), 'could not seed the fixture account');

    await page.goto('/service-accounts');
    const row = page.getByRole('row', { name: new RegExp(LONG_ACCOUNT, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(LONG_TOKEN_NAMES[0]).first()).toBeVisible();

    const dialogBox = await box(dialog);
    const tableBox = await box(dialog.getByRole('table').first());
    const viewport = page.viewportSize()!;

    // The table used to extend past the dialog's right edge.
    expect(tableBox.x + tableBox.width).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + SLACK
    );
    // And the dialog itself must stay on screen.
    expect(dialogBox.x).toBeGreaterThanOrEqual(-SLACK);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + SLACK);
  });

  test('the Create Token footer stays reachable after a long preview', async ({ page }) => {
    test.skip(!(await seedAccountWithLongTokens(page)), 'could not seed the fixture account');

    // Small enough that the form plus a preview list exceeds it, which is the
    // reported case: the footer ended up below the window with no scroll.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/service-accounts');
    const row = page.getByRole('row', { name: new RegExp(LONG_ACCOUNT, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button').first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /create token/i }).first().click();
    await dialog.getByPlaceholder('libs-*').fill('*');
    await dialog.getByRole('button', { name: /preview matched repos/i }).click();
    await expect(dialog.getByText(/repositor(y|ies) matched/i)).toBeVisible({ timeout: 15000 });

    const viewport = page.viewportSize()!;
    const dialogBox = await box(dialog);
    expect(dialogBox.y).toBeGreaterThanOrEqual(-SLACK);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + SLACK);

    // The submit button is what the report said had become unreachable: it must
    // be scrollable into view inside the dialog and then clickable.
    const submit = dialog.getByRole('button', { name: /^create token$/i }).last();
    await submit.scrollIntoViewIfNeeded();
    const submitBox = await box(submit);
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(viewport.height + SLACK);
    await expect(submit).toBeVisible();
  });

  test('the permissions repository picker stays inside its dialog', async ({ page }) => {
    test.skip(!(await seedPermissionOnLongRepoKey(page)), 'could not seed a permission row');

    await page.goto('/permissions');
    // The row's action buttons are icon-only with no accessible name, so they
    // are reached positionally, as the other admin specs do. Edit is first.
    const row = page.getByRole('row', { name: /pos-aggregated-nuget-restore-mirror-e2e-900/ }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/edit permission/i)).toBeVisible();

    const dialogBox = await box(dialog);
    for (const combo of await dialog.getByRole('combobox').all()) {
      if (!(await combo.isVisible())) continue;
      const comboBox = await box(combo);
      expect(comboBox.x + comboBox.width).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width + SLACK
      );
    }
  });
});
