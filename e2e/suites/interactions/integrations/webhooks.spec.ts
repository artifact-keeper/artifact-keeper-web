import { test, expect } from '@playwright/test';

test.describe('Webhooks Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/webhooks');
  });

  test('page loads with Webhooks heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Webhooks', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('Create Webhook button is visible', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create webhook/i }).first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking Create Webhook opens dialog', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create webhook/i }).first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('Create Webhook dialog has required form fields', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create webhook/i }).first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Name input
    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i));
    await expect(nameInput.first()).toBeVisible({ timeout: 5000 });

    // Payload URL input
    const urlInput = dialog.getByLabel(/url/i).or(dialog.getByPlaceholder(/url/i));
    await expect(urlInput.first()).toBeVisible({ timeout: 5000 });

    // Event checkboxes
    const artifactUploaded = dialog.getByText(/artifact uploaded/i).or(dialog.getByLabel(/artifact uploaded/i));
    const artifactDeleted = dialog.getByText(/artifact deleted/i).or(dialog.getByLabel(/artifact deleted/i));
    const repoCreated = dialog.getByText(/repository created/i).or(dialog.getByLabel(/repository created/i));

    const hasArtifactUploaded = await artifactUploaded.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasArtifactDeleted = await artifactDeleted.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasRepoCreated = await repoCreated.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasArtifactUploaded || hasArtifactDeleted || hasRepoCreated).toBeTruthy();

    // Secret input (optional field)
    const secretInput = dialog.getByLabel(/secret/i).or(dialog.getByPlaceholder(/secret/i));
    await expect(secretInput.first()).toBeVisible({ timeout: 3000 });
  });

  test('Cancel button closes Create Webhook dialog', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create webhook/i }).first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click Cancel to close dialog
    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    // Dialog should be closed
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('stats cards are visible', async ({ page }) => {
    const total = page.getByText(/total/i);
    const active = page.getByText(/active/i);
    const disabled = page.getByText(/disabled/i);

    await expect(total.first()).toBeVisible({ timeout: 10000 });
    await expect(active.first()).toBeVisible({ timeout: 10000 });
    await expect(disabled.first()).toBeVisible({ timeout: 10000 });
  });

  test('webhooks table renders or empty state shown', async ({ page }) => {
    await page.waitForTimeout(2000);

    const webhooksTable = page.locator('table');
    const emptyState = page.getByText(/no webhooks/i).or(page.getByText(/no results/i)).or(page.getByText(/create your first/i));

    const hasTable = await webhooksTable.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();

    // If table exists, check for expected column headers
    if (hasTable) {
      const nameHeader = page.getByText(/name/i);
      const urlHeader = page.getByText(/url/i);
      const eventsHeader = page.getByText(/events/i);
      const statusHeader = page.getByText(/status/i);

      const hasName = await nameHeader.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasUrl = await urlHeader.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasEvents = await eventsHeader.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasStatus = await statusHeader.first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasName || hasUrl || hasEvents || hasStatus).toBeTruthy();
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/webhooks');
    await page.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(criticalErrors).toEqual([]);
  });
});
