import { test, expect } from '@playwright/test';

/**
 * Authenticated half of the `internal` repository visibility contract.
 *
 * Runs as `e2e-restricted`, the seeded user with the fewest grants, and that is
 * the whole point: the user holds NO grant on `e2e-internal-pypi` or
 * `e2e-internal-docker`. Every read below must succeed on the strength of the
 * repository's visibility alone.
 *
 * The paired negatives matter as much as the positives. `internal` confers a
 * READ baseline and nothing else, so the same grant-less user must still be
 * refused a write, and must still be refused a read of the PRIVATE repository —
 * otherwise the tests would pass just as well against a broken build that made
 * everything readable.
 *
 * Runs in the `roles-restricted` project.
 */

const API = '/api/v1';

test.describe('Internal repository visibility (authenticated, no grant)', () => {
  test('repository list includes internal but not private', async ({ request }) => {
    const resp = await request.get(`${API}/repositories`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const keys: string[] = body.items.map((r: { key: string }) => r.key);

    expect(keys).toContain('e2e-internal-pypi');
    expect(keys).toContain('e2e-public-pypi');
    // The control: visibility did not simply open everything.
    expect(keys).not.toContain('e2e-private-pypi');
  });

  test('direct GET of internal repo succeeds', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-internal-pypi`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.key).toBe('e2e-internal-pypi');
    // The authoritative field is reported, and the legacy mirror reads false —
    // an internal repository is not anonymously readable.
    expect(body.visibility).toBe('internal');
    expect(body.is_public).toBe(false);
  });

  test('direct GET of private repo still returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-private-pypi`);
    expect(resp.status()).toBe(404);
  });

  test('artifact listing on internal repo succeeds', async ({ request }) => {
    const resp = await request.get(`${API}/repositories/e2e-internal-pypi/artifacts`);
    expect(resp.status()).toBe(200);
  });

  test('tree browser for internal repo succeeds', async ({ request }) => {
    const resp = await request.get(`${API}/tree?repository_key=e2e-internal-pypi`);
    expect(resp.status()).toBe(200);
  });

  test('native format endpoint for internal repo succeeds', async ({ request }) => {
    const resp = await request.get('/pypi/e2e-internal-pypi/simple/');
    expect(resp.ok()).toBe(true);
  });

  test('OCI read against an internal repo succeeds', async ({ request }) => {
    // The tag list is the cheapest authenticated read that exercises the
    // `/v2` gate; an empty repository still answers 200 with an empty list.
    const resp = await request.get('/v2/e2e-internal-docker/tags/list');
    expect(resp.status()).toBe(200);
  });

  test('search returns internal repo artifacts', async ({ request }) => {
    const resp = await request.get(`${API}/search/quick?q=e2e`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const repoKeys: string[] = body.results.map(
      (r: { repository_key: string }) => r.repository_key
    );
    expect(repoKeys).not.toContain('e2e-private-pypi');
  });

  /**
   * Visibility confers READ and nothing else (#2603 G1). Without this, a bug
   * that folded `internal` into the write pre-gate's public short-circuit would
   * pass every test above.
   */
  test('internal confers no write: upload is refused', async ({ request }) => {
    const resp = await request.post(
      `${API}/repositories/e2e-internal-pypi/artifacts`,
      {
        multipart: {
          file: {
            name: 'probe.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('probe'),
          },
        },
      }
    );
    expect(resp.ok()).toBe(false);
    expect([401, 403, 404]).toContain(resp.status());
  });

  test('internal confers no repository administration', async ({ request }) => {
    const resp = await request.patch(`${API}/repositories/e2e-internal-pypi`, {
      data: { description: 'should not be writable' },
    });
    expect(resp.ok()).toBe(false);
    expect([401, 403, 404]).toContain(resp.status());
  });
});
