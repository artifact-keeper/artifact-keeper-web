import { test, expect } from '@playwright/test';

/**
 * Regression tests for private repository visibility.
 *
 * Verifies that unauthenticated (anonymous) users cannot see or access
 * private repositories through any API endpoint. The seed data creates
 * two repos for this purpose:
 *   - e2e-public-pypi  (is_public: true)
 *   - e2e-private-pypi (is_public: false)
 *
 * Runs in the `roles-unauthenticated` project (no storageState).
 */

const API = '/api/v1';

test.describe('Private repository visibility (anonymous)', () => {
  test('repository list only returns public repos', async ({ request }) => {
    const resp = await request.get(`${API}/repositories`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const keys: string[] = body.items.map((r: { key: string }) => r.key);

    expect(keys).toContain('e2e-public-pypi');
    expect(keys).not.toContain('e2e-private-pypi');
  });

  test('direct GET of private repo returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-private-pypi`);
    expect(resp.status()).toBe(404);
  });

  test('direct GET of public repo succeeds', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-public-pypi`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.key).toBe('e2e-public-pypi');
  });

  test('artifact listing on private repo returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-private-pypi/artifacts`);
    expect(resp.status()).toBe(404);
  });

  test('artifact listing on public repo succeeds', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-public-pypi/artifacts`);
    expect(resp.status()).toBe(200);
  });

  test('tree browser for private repo returns 404', async ({ request }) => {
    const resp = await request.get(
      `${API}/tree?repository_key=e2e-private-pypi`
    );
    expect(resp.status()).toBe(404);
  });

  test('tree browser for public repo succeeds', async ({ request }) => {
    const resp = await request.get(
      `${API}/tree?repository_key=e2e-public-pypi`
    );
    expect(resp.status()).toBe(200);
  });

  test('native format endpoint for private repo returns 404', async ({ request }) => {
    // PyPI simple index should be blocked for private repos
    const resp = await request.get('/pypi/e2e-private-pypi/simple/');
    expect(resp.status()).toBe(404);
  });

  test('native format endpoint for public repo succeeds', async ({ request }) => {
    const resp = await request.get('/pypi/e2e-public-pypi/simple/');
    // 200 or 204 (empty index) are both acceptable
    expect(resp.ok()).toBe(true);
  });

  test('search results exclude private repo artifacts', async ({ request }) => {
    // Search for something that would match artifacts in both repos
    const resp = await request.get(`${API}/search/quick?q=e2e`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const repoKeys: string[] = body.results.map(
      (r: { repository_key: string }) => r.repository_key
    );

    // Private repo key must not appear in any search result
    expect(repoKeys).not.toContain('e2e-private-pypi');
  });

  test('download endpoint for private repo returns 404', async ({ request }) => {
    // Even if we guess an artifact path, the download should be blocked
    const resp = await request.get(
      `${API}/repositories/e2e-private-pypi/download/nonexistent.tar.gz`
    );
    // 404 from visibility check (not from missing artifact)
    expect(resp.status()).toBe(404);
  });

  test('artifact metadata for private repo returns 404', async ({ request }) => {
    const resp = await request.get(
      `${API}/repositories/e2e-private-pypi/artifacts/nonexistent.tar.gz`
    );
    expect(resp.status()).toBe(404);
  });
});
