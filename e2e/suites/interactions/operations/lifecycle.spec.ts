import { test, expect } from '@playwright/test';

type RepositoryListResponse = {
  items: Array<{ id: string; key: string }>;
};

type LifecycleCreateRequest = {
  repository_id?: string;
  name?: string;
  policy_type?: string;
  config?: Record<string, unknown>;
};

function lifecyclePolicyStub(body: LifecycleCreateRequest) {
  const timestamp = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    repository_id: body.repository_id ?? null,
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

  test('submits the selected repository ID for a Max Versions policy', async ({ page }) => {
    // Global setup seeds this repository. Reading its generated UUID makes the
    // assertion verify the exact ID selected in the UI rather than a key or a
    // value hard-coded in the test.
    const repositoriesResponse = await page.request.get(
      '/api/v1/repositories?per_page=1000'
    );
    expect(repositoriesResponse.ok()).toBe(true);
    const repositories = (await repositoriesResponse.json()) as RepositoryListResponse;
    const repository = repositories.items.find(
      (item) => item.key === 'e2e-maven-local'
    );
    expect(repository).toBeDefined();

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

    const repositoryPicker = dialog.getByRole('combobox', { name: 'Repository' });
    await expect(repositoryPicker).toHaveAccessibleName('Repository');
    await expect(repositoryPicker).toBeEnabled();
    await repositoryPicker.focus();
    await page.keyboard.press('Enter');
    const repositorySearch = page.getByLabel('Search repositories');
    await expect(repositorySearch).toHaveAccessibleName('Search repositories');
    await repositorySearch.fill(repository!.key);
    const repositoryOption = page
      .locator('[data-slot="command-item"]')
      .filter({ hasText: repository!.key });
    await expect(repositoryOption).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(repositoryPicker).toContainText(repository!.key);
    await dialog.getByRole('button', { name: /^create$/i }).click();

    await expect.poll(() => createRequest).not.toBeNull();
    expect(createRequest).toMatchObject({
      repository_id: repository!.id,
      name: 'Keep the newest e2e version',
      policy_type: 'max_versions',
      config: { keep: 5 },
    });
  });

  test('repository selector remains visible and labelled on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: /new policy/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Policy Type').click();
    await page.getByRole('option', { name: 'Max Versions', exact: true }).click();

    const repositoryPicker = dialog.getByRole('combobox', { name: 'Repository' });
    await expect(repositoryPicker).toBeVisible();
    await expect(repositoryPicker).toHaveAccessibleName('Repository');

    const bounds = await repositoryPicker.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
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
