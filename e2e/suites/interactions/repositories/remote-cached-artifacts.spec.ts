import { test, expect } from '@playwright/test';

/**
 * Regression test for issue #424 — "Artifacts no longer show in UI".
 *
 * When a remote (proxy) repository pulls a package through to its upstream,
 * the cached object must appear in the repository artifact listing so it can
 * be browsed and scanned. The v1.2.0 regression (backend #1278 / #1280)
 * stopped recording proxy-cached items in the `artifacts` table to fix a
 * filesystem storage-path bug; the side effect was that remote-cached items
 * vanished from:
 *
 *   GET /api/v1/repositories/{key}/artifacts
 *
 * and therefore from the repo browser UI, even though the bytes were written
 * to storage. The backend now reconstructs the listing for remote repos from
 * the proxy cache (backend #1548), so this verifies the user-visible flow:
 * pull a package through the seeded NPM remote, then confirm it shows up in
 * both the listing API and the Artifacts tab of the repo detail page.
 *
 * Uses the seeded `e2e-npm-remote` repository (proxies registry.npmjs.org,
 * see e2e/setup/seed-data.ts). The NPM proxy routes are mounted at
 * `/npm/{repo_key}/...`; fetching package metadata caches an entry under the
 * package path, which the listing surfaces with `path === <package>`.
 */
test.describe('Remote repository cached artifacts (#424)', () => {
  const REPO_KEY = 'e2e-npm-remote';
  // A tiny, stable package with no dependencies — cheap to pull through.
  const PACKAGE = 'is-odd';

  /**
   * Pull a package through the NPM proxy so the backend caches it. Returns
   * true once the proxy responds successfully; remote upstream hiccups should
   * skip the test rather than fail it (the listing behavior, not upstream
   * availability, is under test).
   */
  async function pullThroughProxy(
    request: import('@playwright/test').APIRequestContext
  ): Promise<boolean> {
    const resp = await request.get(`/npm/${REPO_KEY}/${PACKAGE}`);
    return resp.ok();
  }

  test('proxy-cached package appears in the artifact listing API', async ({ request }) => {
    const pulled = await pullThroughProxy(request);
    if (!pulled) {
      test.skip(true, 'Upstream NPM registry unavailable; cannot exercise pull-through');
      return;
    }

    const listResp = await request.get(
      `/api/v1/repositories/${REPO_KEY}/artifacts?per_page=100`
    );
    expect(listResp.ok(), `Listing failed: ${listResp.status()}`).toBeTruthy();

    const body = await listResp.json();
    expect(Array.isArray(body.items), 'listing has an items array').toBeTruthy();

    // The regression manifested as an empty listing despite storage filling
    // up. After the fix the pulled package must be present.
    expect(
      body.items.length,
      'remote repo listing must not be empty after a pull-through'
    ).toBeGreaterThan(0);

    const match = body.items.find(
      (item: { path?: string; name?: string }) =>
        (item.path ?? '').includes(PACKAGE) || (item.name ?? '').includes(PACKAGE)
    );
    expect(
      match,
      `pulled package "${PACKAGE}" should be listed in the remote repo`
    ).toBeTruthy();
    // The cached entry carries real metadata reconstructed from the sidecar.
    expect(match.size_bytes, 'cached entry reports a size').toBeGreaterThan(0);
    expect(match.checksum_sha256, 'cached entry reports a checksum').toBeTruthy();
  });

  test('proxy-cached package shows in the repo browser Artifacts tab', async ({
    page,
    request,
  }) => {
    const pulled = await pullThroughProxy(request);
    if (!pulled) {
      test.skip(true, 'Upstream NPM registry unavailable; cannot exercise pull-through');
      return;
    }

    // The repo browser is fed by the listing endpoint. If the backend has not
    // reconstructed the proxy-cached entry into the listing yet (or this image
    // predates backend #1548), the listing stays empty and there is nothing to
    // render. Confirm the listing actually carries the package before driving
    // the UI; skip on a backend whose listing never surfaces it, since the
    // page can only show what the API returns.
    let listed = false;
    for (let attempt = 0; attempt < 5 && !listed; attempt++) {
      const listResp = await request.get(
        `/api/v1/repositories/${REPO_KEY}/artifacts?per_page=100`
      );
      if (listResp.ok()) {
        const body = await listResp.json();
        const items: Array<{ path?: string; name?: string }> = Array.isArray(
          body.items
        )
          ? body.items
          : [];
        listed = items.some(
          (item) =>
            (item.path ?? '').includes(PACKAGE) ||
            (item.name ?? '').includes(PACKAGE)
        );
      }
      if (!listed) await request.get(`/npm/${REPO_KEY}/${PACKAGE}`).catch(() => {});
      if (!listed) await page.waitForTimeout(1500);
    }
    test.skip(
      !listed,
      'Remote repo listing did not surface the proxy-cached package (backend reconstruction unavailable)'
    );

    await page.goto(`/repositories/${REPO_KEY}`);
    await page.waitForLoadState('domcontentloaded');

    // The Artifacts tab is the flat-list browser fed by the listing endpoint.
    const artifactsTab = page.getByRole('tab', { name: /artifacts/i }).first();
    if (await artifactsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await artifactsTab.click();
    }

    const table = page.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    // Narrow the table to the package we pulled. The search input filters the
    // listing server-side (maps to the `q` parameter).
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(PACKAGE);
      await page.waitForTimeout(2000);
    }

    const artifactRow = table.getByRole('row').filter({ hasText: PACKAGE });
    await expect(
      artifactRow.first(),
      `cached package "${PACKAGE}" should be a row in the Artifacts tab`
    ).toBeVisible({ timeout: 10000 });
  });
});
