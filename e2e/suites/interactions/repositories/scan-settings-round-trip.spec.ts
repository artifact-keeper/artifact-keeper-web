import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Scan settings round trips against the real backend (#1069 / #1122,
 * #1185 / #1186).
 *
 * Both repository forms that write `PUT /api/v1/repositories/{key}/security`
 * (Settings > Scanning & enforcement, and the Security tab) must leave the
 * fields the operator did not touch as the backend stored them:
 *
 * - #1069: a stored `proxy_scan_action: record_only` was parsed as
 *   `fail_open` and written back on the next save of any field.
 * - #1185: an instance administrator's PUT without `instance_locked` LOCKS
 *   the proxy scan policy (artifact-keeper#4363), so saving any field
 *   re-locked a policy that had been handed back (`instance_locked: false`).
 *
 * Each test seeds the stored row through the API, saves an unrelated field in
 * the UI, then re-reads the row through the API. The repositories are owned by
 * this spec: an npm remote, because npm is one of the formats whose proxy scan
 * the backend enforces, so the proxy scan controls are enabled.
 */

interface StoredScanConfig {
  scan_enabled: boolean;
  scan_on_upload: boolean;
  scan_on_proxy: boolean;
  block_on_policy_violation: boolean;
  severity_threshold: string;
  proxy_scan_action: string;
  instance_locked: boolean;
}

async function createNpmRemote(request: APIRequestContext, key: string): Promise<void> {
  // A leftover from an interrupted run would make the create 409.
  await request.delete(`/api/v1/repositories/${key}`).catch(() => {});
  const resp = await request.post('/api/v1/repositories', {
    data: {
      key,
      name: key,
      format: 'npm',
      repo_type: 'remote',
      upstream_url: 'https://registry.npmjs.org',
      is_public: true,
    },
  });
  expect(resp.ok(), `create ${key}: ${resp.status()} ${await resp.text()}`).toBeTruthy();
}

async function putScanConfig(
  request: APIRequestContext,
  key: string,
  body: Record<string, unknown>,
): Promise<StoredScanConfig> {
  const resp = await request.put(`/api/v1/repositories/${key}/security`, { data: body });
  expect(resp.ok(), `seed scan config: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  return (await resp.json()) as StoredScanConfig;
}

async function getScanConfig(request: APIRequestContext, key: string): Promise<StoredScanConfig> {
  const resp = await request.get(`/api/v1/repositories/${key}/security`);
  expect(resp.ok(), `GET security: ${resp.status()}`).toBeTruthy();
  const body = await resp.json();
  expect(body.config, 'the repository has a stored scan config').toBeTruthy();
  return body.config as StoredScanConfig;
}

/** Open a repository tab by name, inside <main> (#1184). */
async function openRepoTab(page: Page, key: string, tab: string) {
  await page.goto(`/repositories/${key}`);
  const main = page.getByRole('main');
  const trigger = main.getByRole('tab', { name: tab, exact: true });
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await trigger.click();
  const panel = main.getByRole('tabpanel', { name: tab, exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

function waitForSecurityPut(page: Page, key: string) {
  return page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/repositories/${key}/security`) &&
      r.request().method() === 'PUT',
  );
}

test.describe('Scan settings round trips', () => {
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  test('#1069: saving an unrelated scan field keeps a record_only proxy scan action', async ({
    page,
    request,
  }) => {
    const key = `e2e-scan-record-only-${RUN}`;
    await createNpmRemote(request, key);
    try {
      const seeded = await putScanConfig(request, key, {
        scan_enabled: true,
        scan_on_upload: false,
        scan_on_proxy: true,
        proxy_scan_action: 'record_only',
      });
      expect(seeded.proxy_scan_action).toBe('record_only');

      const settings = await openRepoTab(page, key, 'Settings');
      const scan = settings.getByRole('region', { name: 'Scanning & enforcement' });

      // Shown as stored, not as fail open.
      const action = scan.getByRole('combobox', { name: 'Proxy scan action' });
      await expect(action).toHaveText(/Record only/);
      await expect(scan.getByText(/^Record only: downloads are always served/)).toBeVisible();

      // Change an unrelated field and save.
      const onUpload = scan.getByRole('switch', { name: 'Scan on upload' });
      await expect(onUpload).not.toBeChecked();
      await onUpload.click();
      const put = waitForSecurityPut(page, key);
      await scan.getByRole('button', { name: 'Save Scanning Settings' }).click();
      expect((await put).ok()).toBeTruthy();
      await expect(page.getByText('Scanning & enforcement settings saved')).toBeVisible();

      const stored = await getScanConfig(request, key);
      expect(stored.scan_on_upload, 'the edited field was saved').toBe(true);
      expect(stored.proxy_scan_action, 'the untouched action is still record_only').toBe(
        'record_only',
      );

      // And a fresh load still shows it.
      const reloaded = await openRepoTab(page, key, 'Settings');
      await expect(
        reloaded
          .getByRole('region', { name: 'Scanning & enforcement' })
          .getByRole('combobox', { name: 'Proxy scan action' }),
      ).toHaveText(/Record only/);
    } finally {
      await request.delete(`/api/v1/repositories/${key}`).catch(() => {});
    }
  });

  test('#1185: saving the Scanning & enforcement settings keeps a handed-back policy unlocked', async ({
    page,
    request,
  }) => {
    const key = `e2e-scan-unlocked-settings-${RUN}`;
    await createNpmRemote(request, key);
    try {
      const seeded = await putScanConfig(request, key, {
        scan_enabled: true,
        scan_on_upload: false,
        scan_on_proxy: true,
        instance_locked: false,
      });
      expect(seeded.instance_locked).toBe(false);

      const settings = await openRepoTab(page, key, 'Settings');
      const scan = settings.getByRole('region', { name: 'Scanning & enforcement' });
      const onUpload = scan.getByRole('switch', { name: 'Scan on upload' });
      await expect(onUpload).not.toBeChecked();
      await onUpload.click();
      const put = waitForSecurityPut(page, key);
      await scan.getByRole('button', { name: 'Save Scanning Settings' }).click();
      expect((await put).ok()).toBeTruthy();
      await expect(page.getByText('Scanning & enforcement settings saved')).toBeVisible();

      const stored = await getScanConfig(request, key);
      expect(stored.scan_on_upload, 'the edited field was saved').toBe(true);
      expect(stored.instance_locked, 'the policy is still handed back').toBe(false);

      // The lock switch shows the stored state.
      await expect(scan.getByRole('switch', { name: 'Lock the proxy scan policy' })).not.toBeChecked();
    } finally {
      await request.delete(`/api/v1/repositories/${key}`).catch(() => {});
    }
  });

  test('#1185: saving the Security tab keeps a handed-back policy unlocked', async ({
    page,
    request,
  }) => {
    const key = `e2e-scan-unlocked-security-${RUN}`;
    await createNpmRemote(request, key);
    try {
      const seeded = await putScanConfig(request, key, {
        scan_enabled: true,
        scan_on_proxy: true,
        block_on_policy_violation: false,
        proxy_scan_action: 'record_only',
        instance_locked: false,
      });
      expect(seeded.instance_locked).toBe(false);

      const security = await openRepoTab(page, key, 'Security');
      const block = security.getByRole('switch', { name: 'Block on Violation' });
      await expect(block).not.toBeChecked();
      await block.click();
      const put = waitForSecurityPut(page, key);
      await security.getByRole('button', { name: 'Save Settings' }).click();
      expect((await put).ok()).toBeTruthy();
      await expect(page.getByText('Security settings saved')).toBeVisible();

      const stored = await getScanConfig(request, key);
      expect(stored.block_on_policy_violation, 'the edited field was saved').toBe(true);
      expect(stored.instance_locked, 'the policy is still handed back').toBe(false);
      // The Security tab form has no proxy scan action, so it must not move it.
      expect(stored.proxy_scan_action).toBe('record_only');
    } finally {
      await request.delete(`/api/v1/repositories/${key}`).catch(() => {});
    }
  });
});
