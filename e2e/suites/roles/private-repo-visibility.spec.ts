import { test, expect } from '@playwright/test';

/**
 * Regression tests for private repository visibility.
 *
 * Verifies that unauthenticated (anonymous) users cannot see or access
 * private repositories through any API endpoint. Metadata routes hide a
 * private repository behind a 404; the download route answers 401 with a
 * challenge, identically for private and nonexistent repositories. The seed data creates
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

  test('native format endpoint for private repo is blocked', async ({ request }) => {
    // PyPI simple index should be blocked for private repos.
    // Native format handlers authenticate before checking repo visibility,
    // so they return 401 (not 404) for unauthenticated requests.
    const resp = await request.get('/pypi/e2e-private-pypi/simple/');
    expect(resp.status()).toBe(401);
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

  // Since backend artifact-keeper#4654 the download route challenges a request
  // that carries no credential instead of hiding the repository behind a 404,
  // so curl/wget clients know to retry with Basic or Bearer auth. The answer is
  // the same for a private and a nonexistent repository, so it still reveals
  // nothing about which repositories exist (#999).
  async function anonymousDownload(
    request: import('@playwright/test').APIRequestContext,
    repoKey: string,
  ) {
    const resp = await request.get(
      `${API}/repositories/${repoKey}/download/nonexistent.tar.gz`
    );
    // Each challenge is its own header at the backend; the web proxy may fold
    // them into one comma-joined value, so compare the joined text.
    const challenges = resp
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'www-authenticate')
      .map((h) => h.value)
      .join(', ');
    return { status: resp.status(), challenges, body: await resp.text() };
  }

  test('download endpoint for private repo challenges with 401', async ({ request }) => {
    // Even if we guess an artifact path, the download is refused without a credential.
    const priv = await anonymousDownload(request, 'e2e-private-pypi');
    expect(priv.status).toBe(401);
    expect(priv.challenges).toContain('Basic realm="artifact-keeper"');
    expect(priv.challenges).toContain('Bearer realm="artifact-keeper"');
  });

  test('download endpoint answers a nonexistent repo exactly like a private one', async ({ request }) => {
    const priv = await anonymousDownload(request, 'e2e-private-pypi');
    const missing = await anonymousDownload(request, 'e2e-no-such-repo-999');
    expect(missing.status).toBe(priv.status);
    expect(missing.challenges).toEqual(priv.challenges);
    expect(missing.body).toBe(priv.body);
  });

  test('artifact metadata for private repo returns 404', async ({ request }) => {
    const resp = await request.get(
      `${API}/repositories/e2e-private-pypi/artifacts/nonexistent.tar.gz`
    );
    expect(resp.status()).toBe(404);
  });
});
