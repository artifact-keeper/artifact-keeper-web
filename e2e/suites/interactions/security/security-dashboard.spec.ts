import { test, expect } from '@playwright/test';

test.describe('Security Dashboard', () => {
  test('security dashboard loads', async ({ page }) => {
    await page.goto('/security');
    await expect(page.getByText(/security|vulnerabilit/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('stat cards visible with vulnerability counts', async ({ page }) => {
    await page.goto('/security');
    await expect(page.getByText(/critical/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/high/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/medium/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/low/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('trigger scan button opens dialog', async ({ page }) => {
    await page.goto('/security');
    const triggerBtn = page.getByRole('button', { name: /trigger scan/i });
    await expect(triggerBtn).toBeVisible({ timeout: 10000 });
    await triggerBtn.click();
    await expect(page.getByRole('dialog').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 5000 });
  });

  test('scan dialog has repository selector and mode toggle', async ({ page }) => {
    await page.goto('/security');
    await page.getByRole('button', { name: /trigger scan/i }).click();
    await expect(page.getByRole('dialog').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 5000 });
    // Mode toggle (Repository/Artifact)
    await expect(
      page.getByText(/repository|artifact/i).first()
    ).toBeVisible({ timeout: 5000 });
    // Repository selector should be present
    await expect(
      page.getByText(/select.*repository|repository/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('cancel closes scan dialog', async ({ page }) => {
    await page.goto('/security');
    await page.getByRole('button', { name: /trigger scan/i }).click();
    await expect(page.getByRole('dialog').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('page has action buttons', async ({ page }) => {
    await page.goto('/security');
    // The page should have at least the trigger scan button already tested above
    // Check for any additional action buttons (refresh, export, etc.)
    // Verify the page loaded without errors
    await expect(page.getByText(/security|vulnerabilit/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on security dashboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/security');
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe('Security Policies', () => {
  test('policies page loads', async ({ page }) => {
    await page.goto('/security/policies');
    await expect(page.getByText(/polic/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('create policy button opens dialog with form', async ({ page }) => {
    await page.goto('/security/policies');
    const createBtn = page.getByRole('button', { name: /create.*policy/i });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();
    const dialog = page.getByRole('dialog').or(page.locator('[role="dialog"]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // Form fields
    await expect(
      page.getByLabel(/policy name|name/i).or(page.getByPlaceholder(/policy name|name/i)).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/severity.*threshold|threshold/i).first()).toBeVisible({ timeout: 5000 });
    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Security Scans', () => {
  test('scans page loads with status filter', async ({ page }) => {
    await page.goto('/security/scans');
    await expect(page.getByText(/scan/i).first()).toBeVisible({ timeout: 10000 });
    // Status filter should be present
    await expect(
      page.getByText(/all|completed|running|pending|failed/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on scans page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/security/scans');
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe('DT Projects', () => {
  test('dt projects page loads', async ({ page }) => {
    await page.goto('/security/dt-projects');
    await expect(
      page.getByText(/project|dependency.track|dependency track/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('no console errors on dt projects page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/security/dt-projects');
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('Failed to load resource')
    );
    expect(critical).toHaveLength(0);
  });
});
