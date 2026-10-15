import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash } from 'node:crypto';

/**
 * #951: the install command for an OCI image must address this registry
 * (`host/repo/name:tag`), not the bare name that `docker pull` resolves
 * against Docker Hub. Pushes a real one-layer image through `/v2` so the
 * package row comes from the backend, then reads the command the UI renders.
 */
const REPO_KEY = 'e2e-install-cmd-oci';
const IMAGE = 'e2e-tiny';
const TAG = '1.0.0';

const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

async function pushBlob(request: APIRequestContext, auth: Record<string, string>, body: Buffer) {
  const digest = sha256(body);
  const start = await request.post(`/v2/${REPO_KEY}/${IMAGE}/blobs/uploads/`, { headers: auth });
  expect(start.status(), await start.text()).toBe(202);
  const location = start.headers()['location'];
  const sep = location.includes('?') ? '&' : '?';
  const put = await request.put(`${location}${sep}digest=${encodeURIComponent(digest)}`, {
    headers: { ...auth, 'Content-Type': 'application/octet-stream' },
    data: body,
  });
  expect(put.status(), await put.text()).toBe(201);
  return { digest, size: body.length };
}

test.describe('Package install command names this registry (#951)', () => {
  let packageId: string;
  let host: string;

  test.beforeAll(async ({ request, baseURL }) => {
    host = new URL(baseURL!).host;
    // `/v2` does not read the session cookie, so send the same access token
    // as a Bearer, as a registry client would.
    const { cookies } = await request.storageState();
    const access_token = cookies.find((c) => c.name === 'ak_access_token')?.value;
    expect(access_token, 'admin storage state should hold an access token').toBeTruthy();
    const auth = { Authorization: `Bearer ${access_token}` };

    const repo = await request.post('/api/v1/repositories', {
      headers: auth,
      data: { key: REPO_KEY, name: 'E2E Install Command OCI', format: 'docker', repo_type: 'local' },
    });
    expect([200, 201, 409]).toContain(repo.status());

    const config = await pushBlob(
      request,
      auth,
      Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: [] } })),
    );
    const layer = await pushBlob(request, auth, Buffer.from('e2e-install-command-layer'));
    const manifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', ...config },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', ...layer }],
    };
    const put = await request.put(`/v2/${REPO_KEY}/${IMAGE}/manifests/${TAG}`, {
      headers: { ...auth, 'Content-Type': 'application/vnd.oci.image.manifest.v1+json' },
      data: Buffer.from(JSON.stringify(manifest)),
    });
    expect(put.status(), await put.text()).toBe(201);

    const list = await request.get(`/api/v1/packages?repository_key=${REPO_KEY}&per_page=50`, { headers: auth });
    const items: Array<{ id: string; name: string; repository_key?: string }> = (await list.json()).items ?? [];
    const pkg = items.find((p) => p.name === IMAGE && (p.repository_key ?? REPO_KEY) === REPO_KEY);
    expect(pkg, 'pushed image should appear as a package').toBeTruthy();
    packageId = pkg!.id;
  });

  test('package detail shows a pull command with host and repository', async ({ page }) => {
    await page.goto(`/packages/${packageId}`);
    await expect(page.getByText(`docker pull ${host}/${REPO_KEY}/${IMAGE}:${TAG}`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(`docker pull ${IMAGE}:${TAG}`, { exact: true })).toHaveCount(0);
  });
});
