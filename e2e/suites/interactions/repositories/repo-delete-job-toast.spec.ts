import { test, expect } from '@playwright/test';
import { RepositoriesPage } from '../../../fixtures/page-objects/RepositoriesPage';

/**
 * Repository delete job toasts (#1048 / #1184).
 *
 * From backend 1.12.0, `DELETE /api/v1/repositories/{key}` answers 202 with a
 * background `repository_delete` job. The list page has to say the deletion
 * has started, follow the job, and then say it finished. Before the fix it
 * showed "Repository deleted" straight away, whatever the job then did.
 *
 * The repository is a throwaway created by this test.
 */
test.describe('Repository delete job toast', () => {
  const KEY = `e2e-delete-toast-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const NAME = `E2E Delete Toast ${KEY}`;

  test.beforeEach(async ({ request }) => {
    const resp = await request.post('/api/v1/repositories', {
      data: { key: KEY, name: NAME, format: 'generic', repo_type: 'local', is_public: true },
    });
    expect(resp.ok(), `create ${KEY}: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    // Only does something when the UI delete did not happen.
    await request.delete(`/api/v1/repositories/${KEY}`).catch(() => {});
  });

  test('#1048: deleting a repository shows the started toast, then the completed one', async ({
    page,
    request,
  }) => {
    // No `?selected=`: the detail panel would add its own artifact search box.
    const repos = new RepositoriesPage(page);
    await repos.goto();
    await repos.search(KEY);
    const main = page.getByRole('main');

    const actions = main.getByRole('button', { name: `Repository actions for ${NAME}`, exact: true });
    await expect(actions).toBeVisible({ timeout: 15000 });
    const deleteItem = page.getByRole('menuitem', { name: 'Delete', exact: true });
    // A list refetch can re-render the row and close the menu; retry the open.
    await expect(async () => {
      await actions.click();
      await expect(deleteItem).toBeVisible({ timeout: 2000 });
      await deleteItem.click();
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });

    const confirm = page.getByRole('alertdialog');
    await confirm.getByPlaceholder(KEY).fill(KEY);
    const del = page.waitForResponse(
      (r) => r.url().endsWith(`/api/v1/repositories/${KEY}`) && r.request().method() === 'DELETE',
    );
    await confirm.getByRole('button', { name: 'Delete Repository' }).click();
    expect((await del).status(), 'the backend answers with a background job').toBe(202);

    const toasts = page.locator('[data-sonner-toast]');
    await expect(toasts.filter({ hasText: `Deleting repository "${KEY}"...` })).toBeVisible();
    await expect(toasts.filter({ hasText: 'The deletion has started and runs in the background.' })).toBeVisible();
    // The same toast is replaced by the outcome once the job finishes.
    await expect(toasts.filter({ hasText: `Repository "${KEY}" deleted` })).toBeVisible({
      timeout: 60000,
    });
    await expect(toasts.filter({ hasText: `Deleting repository "${KEY}"...` })).toHaveCount(0);

    // And the repository is gone.
    await expect
      .poll(async () => (await request.get(`/api/v1/repositories/${KEY}`)).status(), {
        timeout: 30000,
      })
      .toBe(404);
  });
});
