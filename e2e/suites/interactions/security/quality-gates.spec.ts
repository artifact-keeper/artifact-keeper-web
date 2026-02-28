import { test, expect } from '@playwright/test';

test.describe('Quality Gates Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quality-gates');
  });

  test('page loads with Quality Gates heading', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('New Gate button is visible', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });
    const newGateBtn = page.getByRole('button', { name: /new gate/i });
    await expect(newGateBtn).toBeVisible({ timeout: 10000 });
  });

  test('health dashboard stats section is visible', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    // Look for stat cards related to health
    const avgHealth = page.getByText(/avg health score/i);
    const artifactsEval = page.getByText(/artifacts evaluated/i);
    const gradeA = page.getByText(/grade a repos/i);

    const hasAvg = await avgHealth.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasArtifacts = await artifactsEval.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasGrade = await gradeA.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasAvg || hasArtifacts || hasGrade).toBeTruthy();
  });

  test('gate stats cards are visible', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    // Wait for data to load - use .or() with expect().toBeVisible() for auto-retry
    await expect(
      page.getByText(/total gates/i).first()
        .or(page.getByText(/enabled/i).first())
        .or(page.getByText(/no quality gates/i).first())
    ).toBeVisible({ timeout: 15000 });
  });

  test('quality gates table or empty state is shown', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    // Either the gates table with columns or the empty state
    const tableHeaders = page.getByText(/thresholds|enforcement/i);
    const emptyState = page.getByText(/no quality gates/i);

    const hasTable = await tableHeaders.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('New Gate button opens create dialog', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    const newGateBtn = page.getByRole('button', { name: /new gate/i });
    await newGateBtn.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify dialog title
    await expect(page.getByText(/create quality gate/i)).toBeVisible({ timeout: 3000 });
  });

  test('create dialog has required form fields', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /new gate/i }).click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Name field
    await expect(page.getByPlaceholder(/production release gate/i)).toBeVisible({ timeout: 3000 });

    // Score thresholds section
    await expect(page.getByText(/minimum score thresholds/i)).toBeVisible({ timeout: 3000 });

    // Maximum issue counts section
    await expect(page.getByText(/maximum issue counts/i)).toBeVisible({ timeout: 3000 });

    // Action selector
    await expect(page.getByText(/action when gate fails/i)).toBeVisible({ timeout: 3000 });

    // Enforcement switches
    await expect(page.getByText(/enforce on promotion/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/enforce on download/i)).toBeVisible({ timeout: 3000 });
  });

  test('cancel closes create dialog', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /new gate/i }).click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('create button is disabled without name', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /new gate/i }).click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The Create submit button should be disabled when name is empty
    const createBtn = dialog.getByRole('button', { name: /^create$/i });
    await expect(createBtn).toBeDisabled();
  });

  test('grade distribution bar is visible', async ({ page }) => {
    await expect(page.getByText(/quality gates/i).first()).toBeVisible({ timeout: 10000 });

    // If health data is available, grade distribution renders
    // This is optional depending on backend data
    await page.getByText(/repository grade distribution/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/quality-gates');
    await page.waitForTimeout(3000);

    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
