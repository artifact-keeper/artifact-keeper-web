import { test, expect } from '@playwright/test';

/**
 * Accessibility regression tests for the repository create/edit dialogs
 * (issues #410, #411, #412, #413). These assert the concrete WCAG 2.2 AA
 * behaviours that automated scanners miss:
 *
 *  - #411: the create-dialog "key already taken" error has role="alert" and
 *          is referenced by the input's aria-describedby (and aria-invalid).
 *  - #412: toggling the upstream-auth view <-> edit moves focus to the first
 *          control of the newly-revealed view (no focus dumped on <body>).
 *  - #410: saving upstream auth announces the outcome via an in-dialog live
 *          region (role="status" / aria-live).
 *  - #413: required inputs expose aria-required; the edit auth-type select has
 *          a programmatic label.
 *
 * Runs against the 1.2.0 backend image. The suite is serial so the seeded
 * repos are created, exercised, and torn down in order.
 */
test.describe.serial('Repository Dialog Accessibility', () => {
  const REMOTE_KEY = 'e2e-a11y-remote';
  const EXISTING_KEY = 'e2e-a11y-existing';

  test.beforeAll(async ({ request }) => {
    // A remote repo whose edit dialog exposes the upstream-auth section.
    await request.post('/api/v1/repositories', {
      data: {
        key: REMOTE_KEY,
        name: 'E2E A11y Remote',
        description: 'a11y test fixture',
        format: 'npm',
        repo_type: 'remote',
        is_public: true,
        upstream_url: 'https://registry.npmjs.org',
      },
    }).catch(() => {});

    // A second repo whose key we will collide with in the create dialog.
    await request.post('/api/v1/repositories', {
      data: {
        key: EXISTING_KEY,
        name: 'E2E A11y Existing',
        format: 'generic',
        repo_type: 'local',
        is_public: true,
      },
    }).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${REMOTE_KEY}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${EXISTING_KEY}`).catch(() => {});
  });

  test('#411 create dialog duplicate-key error is role=alert and linked via aria-describedby', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('domcontentloaded');

    const createBtn = page.getByRole('button', { name: /create repository/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const keyInput = dialog.locator('#create-key');
    await expect(keyInput).toBeVisible({ timeout: 5000 });

    // Type the key of an existing repo to trigger the "already taken" state.
    await keyInput.fill(EXISTING_KEY);

    // The error message must be an alert so screen readers announce it.
    const alert = dialog.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText(/already taken/i);

    // The input must mark itself invalid and point at the alert.
    await expect(keyInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await keyInput.getAttribute('aria-describedby');
    expect(describedBy, 'key input should reference the error via aria-describedby').toBeTruthy();
    const errorId = await alert.getAttribute('id');
    expect(describedBy).toBe(errorId);

    // #413: required inputs expose aria-required.
    await expect(dialog.locator('#create-name')).toHaveAttribute('aria-required', 'true');

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  async function openRemoteEditDialog(page: import('@playwright/test').Page) {
    await page.goto(`/repositories?selected=${REMOTE_KEY}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Target the REMOTE repo's actions trigger specifically: the upstream-auth
    // section only exists on a remote repo's edit dialog. NOTE: the whole repo
    // row is itself a <button> whose accessible name CONCATENATES the nested
    // actions button label ("e2e-a11y-remote E2E A11y Remote npm · remote · 0 B
    // Repository actions for E2E A11y Remote"), so a substring match would also
    // hit the row card and `.first()` would pick it (clicking it just selects
    // the repo, never opening the menu). Use an exact name to bind only to the
    // actual DropdownMenu trigger (aria-label in repo-list-item.tsx).
    const actionsBtn = page.getByRole('button', {
      name: 'Repository actions for E2E A11y Remote',
      exact: true,
    });
    await expect(actionsBtn).toBeVisible({ timeout: 10000 });

    // Open the menu and choose Edit. Retry the whole open: a background list
    // refetch can re-render the row and dismiss the Radix dropdown before the
    // Edit item is clicked, which otherwise surfaces as "menuitem not found".
    const editItem = page.getByRole('menuitem', { name: /^edit$/i }).first();
    const dialog = page.getByRole('dialog');
    await expect(async () => {
      await actionsBtn.click();
      await expect(editItem).toBeVisible({ timeout: 2000 });
      await editItem.click();
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    return dialog;
  }

  test('#412 + #413 toggling upstream-auth view to edit moves focus to the labelled auth-type select', async ({ page }) => {
    const dialog = await openRemoteEditDialog(page);

    // The remote repo has no auth configured -> the view shows a Configure button.
    const toggleBtn = dialog.locator('#edit-upstream-auth-toggle');
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    await toggleBtn.click();

    // After toggling, focus must land on the first control of the edit view:
    // the auth-type select trigger, which must carry a programmatic label. The
    // component moves focus on the next animation frame (it targets the
    // newly-mounted control by id once it exists in the DOM), so wait for the
    // control to mount, then poll for focus rather than checking once. The
    // `toBeFocused` timeout absorbs the rAF latency.
    const authTypeSelect = dialog.locator('#edit-upstream-auth-type');
    await expect(authTypeSelect).toBeVisible({ timeout: 5000 });
    await expect(authTypeSelect).toBeFocused({ timeout: 10000 });

    // #413: the select has an associated label (it is a labelable control id).
    const label = dialog.locator('label[for="edit-upstream-auth-type"]');
    await expect(label).toBeVisible();

    await dialog.getByRole('button', { name: /^cancel$/i }).first().click();
  });

  test('#410 saving upstream auth announces the outcome via an in-dialog live region', async ({ page }) => {
    const dialog = await openRemoteEditDialog(page);

    // The live region exists and is wired as an aria-live status region.
    const liveRegion = dialog.getByTestId('upstream-auth-status');
    await expect(liveRegion).toHaveAttribute('aria-live', /polite|assertive/);

    // Configure -> choose bearer -> enter a token -> Save Authentication.
    await dialog.locator('#edit-upstream-auth-toggle').click();

    const authTypeSelect = dialog.locator('#edit-upstream-auth-type');
    await expect(authTypeSelect).toBeVisible({ timeout: 5000 });
    await authTypeSelect.click();
    await page.getByRole('option', { name: /bearer/i }).click();

    const tokenInput = dialog.locator('#edit-upstream-token');
    await expect(tokenInput).toBeVisible({ timeout: 5000 });
    await tokenInput.fill('e2e-a11y-token');

    await dialog.getByRole('button', { name: /save authentication/i }).click();

    // The live region must receive announced text (success or, if the backend
    // rejects, an error) - either way the screen reader hears the outcome.
    await expect(liveRegion).not.toBeEmpty({ timeout: 15000 });
    await expect(liveRegion).toHaveText(/updated|fail|error/i, { timeout: 15000 });

    await page.keyboard.press('Escape');
  });
});
