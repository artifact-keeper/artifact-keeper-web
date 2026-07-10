import { test, expect } from '@playwright/test';
import { BlastRadiusPage } from '../../../fixtures/page-objects/BlastRadiusPage';

/**
 * CVE Blast-Radius view (issue #570, backend #2364).
 *
 * The page lives at /security/blast-radius and lets an admin ask "who is
 * exposed" to a CVE (or through an artifact): summary tiles, an
 * affected-repositories list that flags `access_scope=public` repos, and a
 * paginated downloaders table, backed by
 * `GET /api/v1/admin/security/cve/{cve_id}/blast-radius` and
 * `GET /api/v1/admin/security/artifact/{artifact_id}/blast-radius`.
 * The endpoints shipped with backend #2364; on an older backend the page
 * degrades to an "unavailable" alert instead of crashing, so the
 * data-dependent tests probe the endpoint and skip rather than fail when it
 * is absent.
 */

// A syntactically valid CVE id that will never have findings; the report for
// it is an empty (all-zero) blast radius, which still exercises the flow.
const PROBE_CVE = 'CVE-1970-0999';
const PROBE_URL = `/api/v1/admin/security/cve/${PROBE_CVE}/blast-radius?per_page=1`;

test.describe('Blast radius admin', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.goto('/security/blast-radius');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Blast Radius heading and target form', async ({ page }) => {
    const blast = new BlastRadiusPage(page);
    await expect(blast.heading).toBeVisible({ timeout: 15000 });
    await expect(blast.targetInput).toBeVisible();
    await expect(blast.analyzeButton).toBeVisible();
    await expect(blast.cveTab).toBeVisible();
    await expect(blast.artifactTab).toBeVisible();
  });

  test('malformed CVE id is rejected client-side', async ({ page }) => {
    const blast = new BlastRadiusPage(page);
    await blast.analyze('log4shell');

    await expect(blast.inputError).toHaveText(/enter a cve id/i, { timeout: 8000 });
  });

  test('malformed artifact id is rejected client-side', async ({ page }) => {
    const blast = new BlastRadiusPage(page);
    await blast.artifactTab.click();
    await blast.analyze('not-a-uuid');

    await expect(blast.inputError).toHaveText(/must be a uuid/i, { timeout: 8000 });
  });

  test('analyzing a CVE renders the summary tiles and exposure tables', async ({ page, request }) => {
    const probe = await request.get(PROBE_URL);
    test.skip(
      !probe.ok(),
      `Blast-radius endpoint not available (status ${probe.status()})`
    );

    const blast = new BlastRadiusPage(page);
    await blast.analyze(PROBE_CVE);

    // Even an all-zero report renders the five summary tiles and both
    // section tables (affected repositories + downloaders).
    await expect(blast.summaryTiles).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Total downloads', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Affected repositories' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Downloaders' })
    ).toBeVisible();
  });

  test('a ?cve= deep link prefills the target and runs the report', async ({ page, request }) => {
    const probe = await request.get(PROBE_URL);
    test.skip(
      !probe.ok(),
      `Blast-radius endpoint not available (status ${probe.status()})`
    );

    const blast = new BlastRadiusPage(page);
    await blast.goto(`?cve=${PROBE_CVE}`);

    await expect(blast.targetInput).toHaveValue(PROBE_CVE, { timeout: 15000 });
    await expect(blast.summaryTiles).toBeVisible({ timeout: 15000 });
  });

  test('flags public repositories in a real blast radius when one exists', async ({ page, request }) => {
    const probe = await request.get(PROBE_URL);
    test.skip(
      !probe.ok(),
      `Blast-radius endpoint not available (status ${probe.status()})`
    );

    // Find a CVE that actually has findings by walking recent scans; skip
    // when this backend has no completed scans with CVE findings.
    const scans = await request.get('/api/v1/security/scans?per_page=20');
    test.skip(!scans.ok(), 'Scan listing unavailable');
    const scanBody = await scans.json();
    const items: Array<{ id: string }> = scanBody.items ?? [];
    let cveId: string | null = null;
    for (const scan of items) {
      const findings = await request.get(
        `/api/v1/security/scans/${scan.id}/findings?per_page=50`
      );
      if (!findings.ok()) continue;
      const fBody = await findings.json();
      const withCve = (fBody.items ?? []).find(
        (f: { cve_id?: string | null }) => f.cve_id && /^CVE-/i.test(f.cve_id)
      );
      if (withCve) {
        cveId = withCve.cve_id;
        break;
      }
    }
    test.skip(!cveId, 'No CVE findings recorded on this backend yet');

    const report = await request.get(
      `/api/v1/admin/security/cve/${cveId}/blast-radius?per_page=5`
    );
    expect(report.ok()).toBeTruthy();
    const body = await report.json();

    const blast = new BlastRadiusPage(page);
    await blast.analyze(cveId!);
    await expect(blast.summaryTiles).toBeVisible({ timeout: 15000 });

    if (body.summary.anonymous_download_present) {
      await expect(blast.anonymousBadge.first()).toBeVisible();
    }
    const publicRepo = (body.affected_repos ?? []).find(
      (r: { access_scope: string }) => r.access_scope === 'public'
    );
    if (publicRepo) {
      await expect(
        page.getByText(/public — everyone exposed/i).first()
      ).toBeVisible();
    }
  });

  test('no uncaught console errors on load', async ({ page }) => {
    await page.waitForTimeout(1500);
    // The page is designed to degrade when the blast-radius endpoints are
    // absent (it renders an "unavailable" alert instead of crashing). A
    // backend without the endpoints answers 404, which the browser surfaces
    // as a "Failed to load resource" console error. Those are expected,
    // handled conditions, not application crashes, so they are filtered out
    // here exactly as the audit and downloads specs do.
    const fatal = consoleErrors.filter(
      (e) =>
        !/favicon|hydrat|ResizeObserver/i.test(e) &&
        !e.includes('net::') &&
        !e.includes('Failed to load resource')
    );
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  });
});
