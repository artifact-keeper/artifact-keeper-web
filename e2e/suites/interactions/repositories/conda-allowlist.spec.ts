import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the package allowlist of a virtual conda repository
 * (issue #971, backend artifact-keeper#4576).
 *
 *   GET    /api/v1/repositories/{key}/allowlist
 *   PUT    /api/v1/repositories/{key}/allowlist   { enabled, entries: [...] }
 *   DELETE /api/v1/repositories/{key}/allowlist
 *
 * The list is repository-admin only and exists on virtual conda repositories
 * only. The UI flow enables a two-entry list from the Settings tab, checks the
 * overview summary line, then disables it again.
 *
 * Backend 1.11.9 (artifact-keeper#5055) adds `scope` (`all_members`, the
 * default, or `remote_only`); the scope tests skip on a backend that does not
 * report it.
 */
test.describe.serial('Conda virtual allowlist', () => {
  const REPO_KEY = 'e2e-conda-allowlist-virtual';
  const api = `/api/v1/repositories/${REPO_KEY}/allowlist`;

  test.beforeAll(async ({ request }) => {
    // Ignore conflicts so reruns are stable.
    await request.post('/api/v1/repositories', {
      data: {
        key: REPO_KEY,
        name: 'E2E Conda Allowlist Virtual',
        format: 'conda',
        repo_type: 'virtual',
        is_public: false,
      },
    });
    await request.delete(api).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    await request.delete(api).catch(() => {});
    await request.delete(`/api/v1/repositories/${REPO_KEY}`).catch(() => {});
  });

  test('allowlist API round-trips set, get, and delete', async ({ request }) => {
    const empty = await request.get(api);
    if (empty.status() === 404) {
      test.skip(true, 'Backend predates the conda allowlist (artifact-keeper#4576)');
      return;
    }
    expect(empty.ok()).toBeTruthy();
    expect(await empty.json()).toMatchObject({ enabled: false, entry_count: 0 });

    const entries = [
      { name: 'numpy', version: '>=2,<3', subdirs: ['linux-64'] },
      { name: 'tzdata' },
    ];
    const put = await request.put(api, { data: { enabled: true, entries } });
    expect(put.ok(), `PUT failed: ${put.status()}`).toBeTruthy();
    const saved = await put.json();
    expect(saved).toMatchObject({ repository_key: REPO_KEY, enabled: true, entry_count: 2 });
    expect(saved.entries).toEqual(entries);

    const del = await request.delete(api);
    expect(del.ok()).toBeTruthy();
    expect((await (await request.get(api)).json()).entry_count).toBe(0);
  });

  test('an invalid entry is rejected and named', async ({ request }) => {
    if ((await request.get(api)).status() === 404) {
      test.skip(true, 'Backend predates the conda allowlist (artifact-keeper#4576)');
      return;
    }
    const resp = await request.put(api, {
      data: { enabled: true, entries: [{ name: 'numpy' }, { name: 'pandas', version: '>=>2' }] },
    });
    expect(resp.status()).toBe(400);
    expect(await resp.text()).toContain('entries[1]');
  });

  test('UI: enable with two entries, see the summary, disable', async ({ page, request }) => {
    if ((await request.get(api)).status() === 404) {
      test.skip(true, 'Backend predates the conda allowlist (artifact-keeper#4576)');
      return;
    }
    await request.delete(api).catch(() => {});

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    const summary = page.getByTestId('allowlist-summary');
    // `isVisible` does not wait; the summary appears once the list loads.
    const shown = await summary
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      test.skip(true, 'Allowlist summary not shown (requires admin and backend 1.11.0)');
      return;
    }
    await expect(summary).toHaveText(/Allowlist: off/);

    // The summary line opens the Settings tab at the Allowlist section.
    await summary.getByRole('button').click();
    await expect(page.getByRole('tab', { name: /settings/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: /^allowlist/i })).toBeVisible({ timeout: 8000 });

    await page.getByLabel('Paste entries').fill('numpy >=2,<3 linux-64\ntzdata');
    await page.getByRole('button', { name: /add lines/i }).click();
    await expect(page.getByLabel('Entry 2 name')).toHaveValue('tzdata');

    const toggle = page.getByRole('switch', { name: /enforce the allowlist/i });
    await toggle.click();
    await page.getByRole('button', { name: /save allowlist/i }).click();

    await expect(async () => {
      const body = await (await request.get(api)).json();
      expect(body.enabled).toBe(true);
      expect(body.entries).toEqual([
        { name: 'numpy', version: '>=2,<3', subdirs: ['linux-64'] },
        { name: 'tzdata' },
      ]);
    }).toPass({ timeout: 10000 });

    await page.reload();
    await expect(page.getByTestId('allowlist-summary')).toHaveText(/Allowlist: on, 2 entries/, {
      timeout: 10000,
    });

    // Disable: the entries are kept, the merge is unfiltered.
    await page.getByTestId('allowlist-summary').getByRole('button').click();
    await page.getByRole('switch', { name: /enforce the allowlist/i }).click();
    await page.getByRole('button', { name: /save allowlist/i }).click();
    await expect(async () => {
      const body = await (await request.get(api)).json();
      expect(body.enabled).toBe(false);
      expect(body.entry_count).toBe(2);
    }).toPass({ timeout: 10000 });

    await page.reload();
    await expect(page.getByTestId('allowlist-summary')).toHaveText(/Allowlist: off, 2 entries/, {
      timeout: 10000,
    });
  });

  test('scope: stored, kept when omitted, and switched back from the UI', async ({ page, request }) => {
    const probe = await request.get(api);
    if (probe.status() === 404 || !('scope' in (await probe.json()))) {
      test.skip(true, 'Backend predates the allowlist scope (artifact-keeper#5055, 1.11.9)');
      return;
    }
    await request.delete(api).catch(() => {});

    const entries = [{ name: 'tzdata' }];
    const optOut = await request.put(api, { data: { enabled: true, scope: 'remote_only', entries } });
    expect(optOut.ok(), `PUT failed: ${optOut.status()}`).toBeTruthy();
    expect(await optOut.json()).toMatchObject({ scope: 'remote_only' });

    // A PUT without `scope` (an older client) keeps the stored scope.
    const kept = await request.put(api, { data: { enabled: true, entries } });
    expect(kept.ok()).toBeTruthy();
    expect(await kept.json()).toMatchObject({ scope: 'remote_only', entry_count: 1 });

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');
    const summary = page.getByTestId('allowlist-summary');
    const shown = await summary
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      test.skip(true, 'Allowlist summary not shown (requires admin)');
      return;
    }
    await expect(summary).toHaveText(/Allowlist: on, 1 entry, remote members only/);

    await summary.getByRole('button').click();
    const remoteOnly = page.getByRole('radio', { name: /remote members only/i });
    const all = page.getByRole('radio', { name: /all members \(default\)/i });
    await expect(remoteOnly).toBeChecked({ timeout: 8000 });
    await all.check();
    await page.getByRole('button', { name: /save allowlist/i }).click();

    await expect(async () => {
      const body = await (await request.get(api)).json();
      expect(body.scope).toBe('all_members');
      expect(body.entries).toEqual(entries);
    }).toPass({ timeout: 10000 });

    await page.reload();
    await expect(page.getByTestId('allowlist-summary')).toHaveText(/Allowlist: on, 1 entry$/, {
      timeout: 10000,
    });
  });
});
