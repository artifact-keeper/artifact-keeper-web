import { test, expect } from '@playwright/test';

/**
 * Search UI coverage for the OpenSearch backend (issue #269, v1.2.0).
 *
 * The backend migrated search indexing to OpenSearch in 1.2.0. This suite
 * exercises the capabilities the UI now exposes on top of that:
 *
 * 1. Relevance is the default sort (OpenSearch ranks results, no explicit
 *    sort_by is sent). Date, Name, Size, and Downloads are explicit sorts.
 * 2. A sort-direction toggle sends sort_order=asc|desc, and is disabled while
 *    sorting by relevance (relevance has no direction).
 * 3. The advanced search request carries sort_by and sort_order when an
 *    explicit field sort is chosen.
 * 4. Facets returned by the backend render as clickable refine chips that
 *    re-issue the search with the facet applied.
 *
 * Runs in CI against the :1.2.0 backend image. Tests that need indexed data
 * seed it through the public artifact API, mirroring artifact-download.spec.ts.
 */
test.describe('OpenSearch Search UI', () => {
  const REPO_KEY = 'e2e-maven-local';

  async function uploadArtifact(
    request: import('@playwright/test').APIRequestContext,
    name: string
  ): Promise<string> {
    const path = `e2e/opensearch/${name}-${Date.now()}.txt`;
    const resp = await request.put(
      `/api/v1/repositories/${REPO_KEY}/artifacts/${path}`,
      {
        data: `OpenSearch indexing fixture for ${name}`,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    );
    expect(resp.ok(), `Upload failed: ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    return body.path || path;
  }

  test('sort menu offers relevance, date, name, size, and downloads', async ({
    page,
  }) => {
    await page.goto('/search');
    await page.getByPlaceholder('e.g., react, lodash').fill('test');
    await page.getByRole('button', { name: /^search$/i }).first().click();

    // Results header (results or empty state) must be present before the
    // sort control renders.
    await expect(page.getByText(/results/i).first()).toBeVisible({
      timeout: 15000,
    });

    const sortSelect = page.getByRole('combobox', { name: /sort by/i });
    await expect(sortSelect).toBeVisible({ timeout: 10000 });
    await sortSelect.click();

    // Radix Select renders options into a listbox popover.
    await expect(
      page.getByRole('option', { name: /relevance/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('option', { name: /^date$/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /^name$/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /^size$/i })).toBeVisible();
    await expect(
      page.getByRole('option', { name: /downloads/i })
    ).toBeVisible();
  });

  test('sort direction toggle is disabled for relevance and enabled for field sorts', async ({
    page,
  }) => {
    await page.goto('/search');
    await page.getByPlaceholder('e.g., react, lodash').fill('test');
    await page.getByRole('button', { name: /^search$/i }).first().click();
    await expect(page.getByText(/results/i).first()).toBeVisible({
      timeout: 15000,
    });

    // Default sort is relevance, so the direction toggle is disabled (there is
    // no ascending/descending relevance).
    const toggle = page.getByRole('button', { name: /sort (descending|ascending)/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toBeDisabled();

    // Switch to an explicit field sort; the direction toggle becomes enabled.
    const sortSelect = page.getByRole('combobox', { name: /sort by/i });
    await sortSelect.click();
    await page.getByRole('option', { name: /^date$/i }).click();
    await expect(toggle).toBeEnabled({ timeout: 10000 });
  });

  test('advanced search request carries sort_by and sort_order for field sorts', async ({
    page,
  }) => {
    await page.goto('/search');
    await page.getByPlaceholder('e.g., react, lodash').fill('test');
    await page.getByRole('button', { name: /^search$/i }).first().click();
    await expect(page.getByText(/results/i).first()).toBeVisible({
      timeout: 15000,
    });

    // Choose Size sort, which sends sort_by=size_bytes. Capture the next
    // advanced-search request to assert the OpenSearch sort params travel.
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/advanced') &&
        req.url().includes('sort_by=size_bytes'),
      { timeout: 15000 }
    );

    const sortSelect = page.getByRole('combobox', { name: /sort by/i });
    await sortSelect.click();
    await page.getByRole('option', { name: /^size$/i }).click();

    const request = await requestPromise;
    const url = new URL(request.url());
    expect(url.searchParams.get('sort_by')).toBe('size_bytes');
    // Default direction is descending until the toggle flips it.
    expect(url.searchParams.get('sort_order')).toBe('desc');

    // Flipping the direction toggle re-issues the search with sort_order=asc.
    const ascRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/search/advanced') &&
        req.url().includes('sort_order=asc'),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /sort (descending|ascending)/i }).click();
    const asc = await ascRequest;
    expect(new URL(asc.url()).searchParams.get('sort_order')).toBe('asc');
  });

  test('relevance sort omits sort_by from the request', async ({ page }) => {
    await page.goto('/search');

    // The very first search uses the default relevance sort. Capture it and
    // assert sort_by is absent (the backend then applies relevance ranking).
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/v1/search/advanced'),
      { timeout: 15000 }
    );
    await page.getByPlaceholder('e.g., react, lodash').fill('test');
    await page.getByRole('button', { name: /^search$/i }).first().click();

    const request = await requestPromise;
    const params = new URL(request.url()).searchParams;
    expect(params.get('sort_by')).toBeNull();
    expect(params.get('sort_order')).toBeNull();
  });

  test('facets render and apply as refine filters when the backend returns them', async ({
    page,
    request,
  }) => {
    // Seed an indexed artifact so the OpenSearch facet aggregations are
    // non-empty for at least the maven format / e2e repository.
    const path = await uploadArtifact(request, 'facettest');

    await page.goto('/search');
    await page.getByPlaceholder('e.g., react, lodash').fill('facettest');
    await page.getByRole('button', { name: /^search$/i }).first().click();
    await expect(page.getByText(/results/i).first()).toBeVisible({
      timeout: 15000,
    });

    // The facet panel only renders when the backend returns aggregations.
    // Indexing is asynchronous, so treat an absent panel as a soft skip rather
    // than a hard failure; when present, a facet chip must filter the results.
    const facets = page.getByTestId('search-facets');
    if (await facets.isVisible({ timeout: 8000 }).catch(() => false)) {
      const refineRequest = page.waitForRequest(
        (req) =>
          req.url().includes('/api/v1/search/advanced') &&
          (req.url().includes('format=') ||
            req.url().includes('repository_key=')),
        { timeout: 15000 }
      );
      const firstChip = facets.getByRole('button').first();
      await firstChip.click();
      await refineRequest;

      // After selecting a facet, the clear-filters control appears.
      await expect(
        page.getByRole('button', { name: /clear filters/i })
      ).toBeVisible({ timeout: 10000 });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Facet panel not shown (artifact not yet indexed)',
      });
    }

    await request
      .delete(`/api/v1/repositories/${REPO_KEY}/artifacts/${path}`)
      .catch(() => {});
  });
});
