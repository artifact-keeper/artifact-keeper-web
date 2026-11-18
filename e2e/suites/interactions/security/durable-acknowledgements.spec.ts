import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Durable acknowledgements and the proxy enforcement preview (web #1072, backend
 * artifact-keeper#5224 and #5238).
 *
 * The scenarios need a promoted copy of a scan and a partial revoke, which a seed
 * cannot produce without a scanner, so the API is stubbed at the network layer and
 * the assertions are on what the browser actually sends and shows.
 */

const SOURCE_SCAN = '00000000-0000-4000-8000-000000000001';
const FINDING = '00000000-0000-4000-8000-000000000002';
const DEV_REPO = '00000000-0000-4000-8000-0000000000d1';
const PROD_REPO = '00000000-0000-4000-8000-0000000000d2';
const PROD_ARTIFACT = '00000000-0000-4000-8000-0000000000a2';
const COPY_LINK = `/security/scans/${SOURCE_SCAN}?artifact_id=${PROD_ARTIFACT}&repository_id=${PROD_REPO}`;

const SCAN = {
  id: SOURCE_SCAN,
  artifact_id: '00000000-0000-4000-8000-0000000000a1',
  artifact_name: 'lib.jar',
  artifact_version: '1.0',
  repository_id: DEV_REPO,
  scan_type: 'grype',
  status: 'completed',
  findings_count: 1,
  critical_count: 0,
  high_count: 1,
  medium_count: 0,
  low_count: 0,
  info_count: 0,
  is_reused: false,
  started_at: '2026-11-01T00:00:00Z',
  completed_at: '2026-11-01T00:01:00Z',
  created_at: '2026-11-01T00:00:00Z',
};

function finding(over: Record<string, unknown> = {}) {
  return {
    id: FINDING,
    scan_result_id: SOURCE_SCAN,
    artifact_id: PROD_ARTIFACT,
    severity: 'high',
    title: 'Bad thing',
    cve_id: 'CVE-2024-1',
    affected_component: 'openssl',
    affected_version: '1.1',
    source: 'grype',
    is_acknowledged: false,
    created_at: '2026-11-01T00:00:00Z',
    finding_class: 'vulnerability',
    ...over,
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stubScanPage(page: Page, acknowledged: boolean) {
  await page.route('**/api/v1/security/scans/*/findings**', (route) =>
    json(route, { items: [finding({ is_acknowledged: acknowledged })], total: 1 }),
  );
  await page.route(`**/api/v1/security/scans/${SOURCE_SCAN}`, (route) => json(route, SCAN));
  await page.route('**/api/v1/security/acknowledgements**', (route) =>
    json(route, { code: 'AUTHORIZATION_ERROR', message: 'no' }, 403),
  );
}

test.describe('Acknowledging a finding on a copy of a scan', () => {
  test('lists the copy and names its repository on acknowledge', async ({ page }) => {
    await stubScanPage(page, false);
    let body: Record<string, unknown> | null = null;
    await page.route(`**/api/v1/security/findings/${FINDING}/acknowledge`, async (route) => {
      body = route.request().postDataJSON();
      await json(route, finding({ is_acknowledged: true }));
    });
    const list = page.waitForRequest((r) => r.url().includes(`/scans/${SOURCE_SCAN}/findings`));

    await page.goto(COPY_LINK);
    expect(new URL((await list).url()).searchParams.get('artifact_id')).toBe(PROD_ARTIFACT);
    await expect(page.getByTestId('scan-copy-notice')).toBeVisible();

    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(body).toMatchObject({ reason: 'risk_accepted', repository_id: PROD_REPO });
  });

  test('explains a 409 and keeps the dialog open', async ({ page }) => {
    await stubScanPage(page, false);
    await page.route(`**/api/v1/security/findings/${FINDING}/acknowledge`, (route) =>
      json(
        route,
        {
          code: 'CONFLICT',
          message:
            "This finding's scan has copies in other repositories; say which one is meant with repository_id",
        },
        409,
      ),
    );
    await page.goto(COPY_LINK);
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await expect(page.getByText(/copied into other repositories/i)).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('a partial revoke says the risk remains accepted elsewhere', async ({ page }) => {
    await stubScanPage(page, true);
    let revokeUrl = '';
    await page.route(`**/api/v1/security/findings/${FINDING}/acknowledge**`, async (route) => {
      revokeUrl = route.request().url();
      await json(route, finding({ acknowledgements_left_effective: 2 }));
    });
    await page.goto(COPY_LINK);
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revoke', exact: true })
      .click();
    await expect(page.getByText(/remains accepted elsewhere/i)).toBeVisible();
    await expect(page.getByText('Acknowledgment revoked.')).toHaveCount(0);
    expect(new URL(revokeUrl).searchParams.get('repository_id')).toBe(PROD_REPO);
  });
});

test.describe('Proxy Blocked preview', () => {
  test('the toggle asks for would_block and shows counts as upper bounds', async ({ page }) => {
    const seen: string[] = [];
    await page.route('**/api/v1/security/proxy-blocked**', (route) => {
      const wouldBlock = new URL(route.request().url()).searchParams.get('would_block');
      seen.push(wouldBlock ?? 'absent');
      return json(route, {
        items: [],
        pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
        ...(wouldBlock
          ? {
              would_block_summary: {
                would_block_digests: 3,
                no_verdict: 12,
                stale_verdict: 4,
                clean_graded_nothing: 5,
              },
            }
          : {}),
      });
    });

    await page.goto('/security/proxy-blocked');
    await expect(page.getByRole('heading', { name: 'Proxy Blocked' })).toBeVisible();
    await expect(page.getByTestId('would-block-summary')).toHaveCount(0);

    await page.getByRole('switch', { name: 'Preview enforcement' }).click();
    const summary = page.getByTestId('would-block-summary');
    await expect(summary).toBeVisible();
    await expect(page.getByTestId('would-block-no-verdict')).toContainText('Up to 12');
    await expect(summary).toContainText('not a count of refusals');
    expect(seen).toEqual(['absent', 'true']);
  });
});

test.describe('Acknowledgements page', () => {
  test('revokes by id and reports what stayed in force', async ({ page }) => {
    await page.route('**/api/v1/security/acknowledgements?**', (route) =>
      json(route, {
        items: [
          {
            id: 'decision-1',
            lineage_id: 'decision-1',
            repository_id: null,
            checksum_sha256: 'a'.repeat(64),
            finding_class: 'vulnerability',
            advisory: 'CVE-2024-1',
            component: 'openssl',
            component_version: '1.1',
            max_severity: 'high',
            reason: 'risk_accepted',
            acknowledged_at: '2026-11-01T00:00:00Z',
            created_via: 'api',
            state: 'active',
          },
        ],
        total: 1,
      }),
    );
    await page.route('**/api/v1/security/acknowledgements/decision-1', (route) =>
      json(route, { revoked: 1, left_effective: 1 }),
    );

    await page.goto('/security/acknowledgements');
    await expect(page.getByText('Every repository')).toBeVisible();
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revoke', exact: true })
      .click();
    await expect(page.getByText(/the risk remains accepted/i)).toBeVisible();
  });
});
