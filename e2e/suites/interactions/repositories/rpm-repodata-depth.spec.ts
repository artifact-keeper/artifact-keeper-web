import { test, expect, navigateTo } from '../../../fixtures/test-fixtures';

/**
 * RPM Repodata Depth (#906, backend artifact-keeper#4230): the create dialog
 * offers the field on a Local RPM repository once the backend confirms
 * support through `GET /api/v1/repositories/_/capabilities`, the backend
 * stores the depth, and Settings and the Setup guide reflect it.
 */
test.describe('RPM Repodata Depth (#906)', () => {
  test('create a Local RPM repository with depth 1 and see it in Settings and Setup', async ({
    page,
    adminApi,
  }) => {
    const key = `e2e-rpm-depth-${Date.now().toString(36)}`;
    try {
      await navigateTo(page, '/repositories');
      await page.getByRole('button', { name: /create repository/i }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10000 });

      // First combobox = Format, second = Type.
      await dialog.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'RPM/YUM', exact: true }).click();
      await dialog.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'Local', exact: true }).click();
      await dialog.locator('#create-key').fill(key);
      await dialog.locator('#create-name').fill('E2E RPM Depth');

      // Enabled only once the backend's capability response is confirmed.
      const depth = dialog.getByLabel('Repodata Depth');
      await expect(depth).toBeEnabled({ timeout: 10000 });
      await expect(depth).toHaveValue('0');
      await depth.fill('1');
      await expect(dialog.getByText(`/rpm/${key}/build-a/repodata/repomd.xml`)).toBeVisible();

      const createRequest = page.waitForRequest(
        (req) => req.url().endsWith('/api/v1/repositories') && req.method() === 'POST',
        { timeout: 15000 },
      );
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      expect((await createRequest).postDataJSON()).toMatchObject({ repodata_depth: 1 });
      await expect(dialog).toBeHidden({ timeout: 15000 });

      const stored = await (await adminApi.get(`/repositories/${key}`)).json();
      expect(stored).toMatchObject({ repodata_depth: 1, repodata_depth_editable: true });

      await navigateTo(page, `/repositories/${key}`);
      await page.getByRole('tab', { name: 'Setup' }).click();
      await expect(
        page.getByRole('tabpanel', { name: 'Setup' }).getByText(`/rpm/${key}/build-a/repodata/repomd.xml`).first(),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole('tab', { name: 'Settings' }).click();
      const settingsDepth = page.getByRole('tabpanel', { name: 'Settings' }).getByLabel('Repodata Depth');
      await expect(settingsDepth).toHaveValue('1', { timeout: 10000 });
      await expect(settingsDepth).toBeEnabled();
    } finally {
      await adminApi.delete(`/repositories/${key}`).catch(() => {});
    }
  });
});
