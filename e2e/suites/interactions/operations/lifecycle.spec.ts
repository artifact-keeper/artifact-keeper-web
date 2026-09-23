import { test, expect } from '@playwright/test';

type LifecycleCreateRequest = {
  applies_to_all: boolean;
  repository_ids: string[];
  name?: string;
  policy_type?: string;
  config?: Record<string, unknown>;
};

function lifecyclePolicyStub(body: LifecycleCreateRequest) {
  const timestamp = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    repository_id: null,
    applies_to_all: body.applies_to_all,
    repository_ids: body.repository_ids,
    name: body.name ?? 'e2e lifecycle policy',
    description: null,
    enabled: true,
    policy_type: body.policy_type ?? 'max_versions',
    config: body.config ?? { keep: 1 },
    priority: 0,
    last_run_at: null,
    last_run_items_removed: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test.describe('Lifecycle Page', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.route('**/api/v1/admin/lifecycle/capabilities', (route) =>
      route.fulfill({ json: { explicit_repository_assignment: true } })
    );
    await page.goto('/lifecycle');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page loads with Lifecycle heading', async ({ page }) => {
    const heading = page.getByRole('heading').filter({ hasText: /lifecycle/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('New Policy button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('Execute All button is visible', async ({ page }) => {
    const button = page.getByRole('button', { name: /execute all/i });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test('stat cards display policy information or loading skeletons', async ({ page }) => {
    // The stats section shows skeletons while the query is in flight, then
    // stat cards once it resolves. Use expect().toBeVisible() which retries
    // (unlike isVisible() which is a one-shot snapshot check).
    const statCard = page.getByText('Total Policies');
    const skeleton = page.locator('[data-slot="skeleton"]').first();

    await expect(statCard.or(skeleton)).toBeVisible({ timeout: 15000 });
  });

  test('clicking New Policy opens the create dialog', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
  });

  test('create dialog has form inputs', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Check for any input fields in the dialog
    const inputs = dialog.locator('input, textarea, select, [role="combobox"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);

    // Close dialog
    const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  });

  test('cancel closes the create dialog', async ({ page }) => {
    const button = page.getByRole('button', { name: /new policy/i });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('creates Max Versions unassigned when the global checkbox is unchecked', async ({ page }) => {
    let createRequest: LifecycleCreateRequest | null = null;
    await page.route('**/api/v1/admin/lifecycle', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      createRequest = route.request().postDataJSON() as LifecycleCreateRequest;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(lifecyclePolicyStub(createRequest)),
      });
    });

    await page.getByRole('button', { name: /new policy/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^name$/i).fill('Keep the newest e2e version');

    await dialog.getByLabel('Policy Type').click();
    await page.getByRole('option', { name: 'Max Versions', exact: true }).click();

    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await expect(dialog.getByText(/created unassigned with no effect/i)).toBeVisible();
    await dialog.getByRole('button', { name: /^create$/i }).click();

    await expect.poll(() => createRequest).not.toBeNull();
    expect(createRequest).toMatchObject({
      applies_to_all: false,
      repository_ids: [],
      name: 'Keep the newest e2e version',
      policy_type: 'max_versions',
      config: { keep: 5 },
    });
    expect(createRequest).not.toHaveProperty('repository_id');
  });

  test('global scope checkbox remains visible and labelled on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: /new policy/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Policy Type').click();
    await page.getByRole('option', { name: 'Max Versions', exact: true }).click();

    const scopeCheckbox = dialog.getByRole('checkbox', { name: /automatically apply to all current and future repositories/i });
    await expect(scopeCheckbox).toBeVisible();
    await expect(scopeCheckbox).not.toBeChecked();
    await scopeCheckbox.focus();
    await page.keyboard.press('Space');
    await expect(scopeCheckbox).toBeChecked();
    await expect(dialog.getByText(/individual repositories cannot opt out/i)).toBeVisible();

    const bounds = await scopeCheckbox.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  });

  test('sends global scope only with explicit opt-in', async ({ page }) => {
    let createRequest: LifecycleCreateRequest | null = null;
    await page.route('**/api/v1/admin/lifecycle', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      createRequest = route.request().postDataJSON();
      await route.fulfill({ json: lifecyclePolicyStub(createRequest!) });
    });
    await page.getByRole('button', { name: /new policy/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^name$/i).fill('Global cleanup');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: /^create$/i }).click();
    await expect.poll(() => createRequest).toMatchObject({
      applies_to_all: true, repository_ids: [],
    });
  });

  test('blocks creation on an old backend even when there are no policies', async ({ page }) => {
    await page.route('**/api/v1/admin/lifecycle/capabilities', (route) =>
      route.fulfill({ status: 404, body: '' })
    );
    let writes = 0;
    await page.route('**/api/v1/admin/lifecycle', (route) => {
      if (route.request().method() === 'POST') writes++;
      return route.fulfill({ json: [] });
    });
    await page.reload();
    await expect(page.getByText('Cleanup policy assignment unavailable')).toBeVisible();
    await page.getByRole('button', { name: /new policy/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^name$/i).fill('Must stay safe');
    await expect(dialog.getByRole('button', { name: /^create$/i })).toBeDisabled();
    expect(writes).toBe(0);
  });

  test('repository settings attach and detach membership without deleting a shared policy', async ({ page }) => {
    const repositoryId = '00000000-0000-4000-8000-000000000010';
    const otherRepositoryId = '00000000-0000-4000-8000-000000000011';
    let assigned = false;
    const assignmentWrites: string[] = [];
    const shared = {
      ...lifecyclePolicyStub({ applies_to_all: false, repository_ids: [otherRepositoryId] }),
      name: 'Shared retention',
    };
    const global = {
      ...lifecyclePolicyStub({ applies_to_all: true, repository_ids: [] }),
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Inherited retention',
    };
    await page.route('**/api/v1/admin/lifecycle**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/capabilities')) {
        return route.fulfill({ json: { explicit_repository_assignment: true } });
      }
      if (url.pathname.endsWith(`/repositories/${repositoryId}`)) {
        assignmentWrites.push(request.method());
        assigned = request.method() === 'PUT';
        shared.repository_ids = assigned ? [otherRepositoryId, repositoryId] : [otherRepositoryId];
        return route.fulfill({ json: shared });
      }
      if (request.method() !== 'GET') {
        throw new Error(`Unexpected policy-wide write: ${request.method()} ${url.pathname}`);
      }
      return route.fulfill({
        json: url.searchParams.has('repository_id')
          ? [global, ...(assigned ? [shared] : [])]
          : [global, shared],
      });
    });
    await page.route('**/api/v1/repositories/cleanup-assignment-test', (route) =>
      route.fulfill({ json: {
        id: repositoryId, key: 'cleanup-assignment-test', name: 'Cleanup assignment test',
        format: 'generic', repo_type: 'local', is_public: true, description: null,
        storage_used_bytes: 0, quota_bytes: null, artifact_count: 0,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      } })
    );
    await page.route('**/api/v1/repositories/cleanup-assignment-test/artifacts*', (route) =>
      route.fulfill({ json: { items: [], pagination: { total: 0, page: 1, per_page: 20, total_pages: 0 } } })
    );
    await page.goto('/repositories/cleanup-assignment-test');
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    const cleanup = page.getByRole('region', { name: 'Cleanup Policies' });
    await expect(cleanup.getByText('Inherited retention')).toBeVisible();
    await expect(cleanup.getByRole('button', { name: /detach policy inherited/i })).toHaveCount(0);
    await expect(cleanup.getByRole('button', { name: /execute|preview|delete/i })).toHaveCount(0);
    await expect(cleanup.getByRole('link', { name: /Lifecycle administration/ })).toHaveAttribute('href', '/lifecycle');
    await cleanup.getByRole('combobox').click();
    await page.getByRole('option', { name: /Shared retention/ }).click();
    await cleanup.getByRole('button', { name: 'Attach policy', exact: true }).click();
    await expect(cleanup.getByRole('button', { name: 'Detach policy Shared retention' })).toBeVisible();
    await expect(cleanup.getByText('Selected - 2 repositories')).toBeVisible();
    await cleanup.getByRole('button', { name: 'Detach policy Shared retention' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(/runs already in progress may still clean up/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Detach policy', exact: true }).click();
    await expect.poll(() => assignmentWrites).toEqual(['PUT', 'DELETE']);
    await expect(dialog).toBeHidden();
    await expect(cleanup.getByRole('button', { name: 'Detach policy Shared retention' })).toHaveCount(0);
    expect(shared.repository_ids).toEqual([otherRepositoryId]);
  });

  test('policies table renders or shows empty state', async ({ page }) => {
    const table = page.getByRole('table');
    const emptyState = page.getByText(/no.*polic|no.*data|no.*result|empty/i).first();

    await expect(table.or(emptyState)).toBeVisible();
  });

  test('no console errors on page load', async () => {
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });
});
