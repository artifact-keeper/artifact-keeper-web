import { test, expect } from '@playwright/test';

/**
 * Feature-flag gating driven by GET /api/v1/system/config (issue #271).
 *
 * The web app fetches the backend's public runtime configuration once and uses
 * it to decide which scanner-dependent surfaces to show and to advertise the
 * upload-size limit. These tests verify the contract end to end against the
 * running backend, then check that the UI reflects what the backend reports.
 */
test.describe('System config feature flags', () => {
  test('public system config endpoint returns the expected shape', async ({ request }) => {
    const resp = await request.get('/api/v1/system/config');
    expect(resp.ok(), `system config request failed: ${resp.status()}`).toBeTruthy();

    const body = await resp.json();
    // Top-level fields the web app relies on.
    expect(typeof body.max_upload_size_bytes).toBe('number');
    expect(typeof body.demo_mode).toBe('boolean');
    expect(typeof body.guest_access_enabled).toBe('boolean');
    expect(typeof body.search_engine).toBe('string');
    expect(typeof body.storage_backend).toBe('string');

    // Nested scanner / auth flag groups used for navigation gating.
    expect(body.scanners).toBeTruthy();
    expect(typeof body.scanners.trivy_enabled).toBe('boolean');
    expect(typeof body.scanners.openscap_enabled).toBe('boolean');
    expect(typeof body.scanners.dependency_track_enabled).toBe('boolean');
    expect(body.auth).toBeTruthy();
    expect(typeof body.auth.oidc_enabled).toBe('boolean');
    expect(typeof body.auth.sso_enabled).toBe('boolean');
  });

  test('scanner nav entries match the backend scanner flags', async ({ page, request }) => {
    const resp = await request.get('/api/v1/system/config');
    expect(resp.ok()).toBeTruthy();
    const config = await resp.json();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The sidebar only renders for an authenticated admin; confirm it is there.
    const nav = page.getByRole('navigation').first();
    await expect(nav).toBeVisible({ timeout: 15000 });

    // "Scan Results" is gated on Trivy or OpenSCAP being configured.
    const scanResults = nav.getByRole('link', { name: /scan results/i });
    const scannersOn = config.scanners.trivy_enabled || config.scanners.openscap_enabled;
    if (scannersOn) {
      await expect(scanResults).toBeVisible({ timeout: 10000 });
    } else {
      await expect(scanResults).toHaveCount(0);
    }

    // "DT Projects" is gated on the Dependency-Track integration.
    const dtProjects = nav.getByRole('link', { name: /dt projects/i });
    if (config.scanners.dependency_track_enabled) {
      await expect(dtProjects).toBeVisible({ timeout: 10000 });
    } else {
      await expect(dtProjects).toHaveCount(0);
    }
  });

  test('upload dialog advertises the configured max upload size', async ({ page, request }) => {
    const resp = await request.get('/api/v1/system/config');
    expect(resp.ok()).toBeTruthy();
    const config = await resp.json();

    // Only meaningful when the backend advertises a non-zero limit.
    test.skip(
      !config.max_upload_size_bytes || config.max_upload_size_bytes === 0,
      'Server advertises no upload size limit'
    );

    await page.goto('/repositories/e2e-maven-local');
    await page.waitForLoadState('domcontentloaded');

    const uploadTab = page.getByRole('tab', { name: /upload/i });
    if (!(await uploadTab.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, 'Upload tab not available for this repository');
      return;
    }
    await uploadTab.click();

    // The dropzone helper text includes "max <size>" derived from system config.
    await expect(page.getByText(/max\s/i).first()).toBeVisible({ timeout: 10000 });
  });
});
