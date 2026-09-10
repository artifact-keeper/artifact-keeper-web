import { test, expect } from '@playwright/test';

/**
 * Anonymous half of the `internal` repository visibility contract.
 *
 * `internal` means "readable by every authenticated principal, never by an
 * anonymous one". These tests pin the second half of that sentence, on every
 * surface a repository can be reached through. The authenticated half lives in
 * `internal-repo-visibility-authenticated.spec.ts`.
 *
 * Seed data (`e2e/setup/seed-data.ts`):
 *   - e2e-public-pypi      (visibility: public)
 *   - e2e-internal-pypi    (visibility: internal)
 *   - e2e-private-pypi     (visibility: private)
 *   - e2e-internal-docker  (visibility: internal)
 *
 * The load-bearing assertion is that `internal` is INDISTINGUISHABLE from
 * `private` here: same status codes, same absence from listings. A denial that
 * says "this exists but you may not see it" is an existence oracle over every
 * internal key, which is exactly what the private-repo contract already avoids.
 *
 * Runs in the `roles-unauthenticated` project (no storageState).
 */

const API = '/api/v1';

test.describe('Internal repository visibility (anonymous)', () => {
  test('repository list excludes internal repos', async ({ request }) => {
    const resp = await request.get(`${API}/repositories`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const keys: string[] = body.items.map((r: { key: string }) => r.key);

    expect(keys).toContain('e2e-public-pypi');
    expect(keys).not.toContain('e2e-internal-pypi');
    expect(keys).not.toContain('e2e-private-pypi');
  });

  test('direct GET of internal repo returns 404, same as private', async ({ request }) => {
    const internal = await request.get(`${API}/repositories/e2e-internal-pypi`);
    const priv = await request.get(`${API}/repositories/e2e-private-pypi`);
    expect(internal.status()).toBe(404);
    expect(internal.status()).toBe(priv.status());
  });

  test('artifact listing on internal repo returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-internal-pypi/artifacts`);
    expect(resp.status()).toBe(404);
  });

  test('tree browser for internal repo returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/tree?repository_key=e2e-internal-pypi`);
    expect(resp.status()).toBe(404);
  });

  test('native format endpoint for internal repo is blocked', async ({ request }) => {
    // Native handlers authenticate before checking visibility, so an
    // unauthenticated request is 401 — the same answer a private repo gives.
    const internal = await request.get('/pypi/e2e-internal-pypi/simple/');
    const priv = await request.get('/pypi/e2e-private-pypi/simple/');
    expect(internal.status()).toBe(401);
    expect(internal.status()).toBe(priv.status());
  });

  test('search results exclude internal repo artifacts', async ({ request }) => {
    const resp = await request.get(`${API}/search/quick?q=e2e`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const repoKeys: string[] = body.results.map(
      (r: { repository_key: string }) => r.repository_key
    );
    expect(repoKeys).not.toContain('e2e-internal-pypi');
  });

  /**
   * The gap that motivated the whole change.
   *
   * `/v2/*` is mounted on the top-level router, OUTSIDE the repo-visibility
   * middleware, and the guest-access guard allowlists it wholesale. Its own
   * anonymous gate was `is_anon && !repo.is_public`, so a repository that is
   * not anonymously readable had to be `is_public = false` for the pull to be
   * refused — which is precisely what the guest-access coercion used to
   * guarantee and no longer does.
   *
   * Note this runs with guest access ENABLED. The point is that visibility
   * alone refuses the pull, with no help from the server-wide policy.
   */
  test('anonymous OCI manifest GET against an internal repo is refused', async ({ request }) => {
    const resp = await request.get('/v2/e2e-internal-docker/manifests/latest');
    // 401 (auth challenge) or 404 (existence-hiding) — never 200.
    expect([401, 404]).toContain(resp.status());
  });

  test('anonymous OCI tag list against an internal repo is refused', async ({ request }) => {
    const resp = await request.get('/v2/e2e-internal-docker/tags/list');
    expect([401, 404]).toContain(resp.status());
  });
});
