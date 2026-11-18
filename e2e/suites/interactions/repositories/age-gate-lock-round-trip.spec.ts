import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Age gate lock round trip against the real backend (#1038 / #1126).
 *
 * `PUT /api/v1/repositories/{key}/age-gate` from an instance administrator
 * LOCKS the policy when the body leaves `instance_locked` out
 * (artifact-keeper#4238), so the Settings tab's Age Gate form used to re-lock
 * a policy that had been handed back the moment the minimum age was saved.
 *
 * The policy is handed back through the API, the minimum age is changed and
 * saved in the UI, then the policy is re-read through the API. The npm remote
 * is owned by this spec (the age gate is remote-only, and npm is a format the
 * backend can enforce it for).
 */

interface StoredAgeGate {
  enabled: boolean;
  min_age_days: number;
  instance_locked: boolean;
}

async function getAgeGate(request: APIRequestContext, key: string): Promise<StoredAgeGate> {
  const resp = await request.get(`/api/v1/repositories/${key}/age-gate`);
  expect(resp.ok(), `GET age-gate: ${resp.status()}`).toBeTruthy();
  return (await resp.json()) as StoredAgeGate;
}

test.describe('Age gate lock round trip', () => {
  const KEY = `e2e-age-gate-unlocked-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  test.beforeEach(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${KEY}`).catch(() => {});
    const resp = await request.post('/api/v1/repositories', {
      data: {
        key: KEY,
        name: KEY,
        format: 'npm',
        repo_type: 'remote',
        upstream_url: 'https://registry.npmjs.org',
        is_public: true,
      },
    });
    expect(resp.ok(), `create ${KEY}: ${resp.status()} ${await resp.text()}`).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${KEY}`).catch(() => {});
  });

  test('#1038: saving the minimum age keeps a handed-back policy unlocked', async ({
    page,
    request,
  }) => {
    const seed = await request.put(`/api/v1/repositories/${KEY}/age-gate`, {
      data: { enabled: true, min_age_days: 7, instance_locked: false },
    });
    expect(seed.ok(), `seed age gate: ${seed.status()} ${await seed.text()}`).toBeTruthy();
    expect((await seed.json()).instance_locked).toBe(false);

    await page.goto(`/repositories/${KEY}`);
    const main = page.getByRole('main');
    const tab = main.getByRole('tab', { name: 'Settings', exact: true });
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    const gate = main
      .getByRole('tabpanel', { name: 'Settings', exact: true })
      .getByRole('region', { name: 'Age Gate' });

    const days = gate.getByLabel('Minimum age (days)');
    await expect(days).toHaveValue('7');
    await days.fill('9');
    const put = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/v1/repositories/${KEY}/age-gate`) &&
        r.request().method() === 'PUT',
    );
    await gate.getByRole('button', { name: 'Save Age Gate Settings' }).click();
    expect((await put).ok()).toBeTruthy();

    const stored = await getAgeGate(request, KEY);
    expect(stored.min_age_days, 'the edited field was saved').toBe(9);
    expect(stored.enabled).toBe(true);
    expect(stored.instance_locked, 'the policy is still handed back').toBe(false);

    // The lock switch shows the stored state.
    await expect(gate.getByRole('switch', { name: 'Lock this policy' })).not.toBeChecked();
  });
});
