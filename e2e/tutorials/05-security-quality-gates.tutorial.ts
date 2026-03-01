import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';

test('Tutorial: Security Scanning and Quality Gates', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '05-security-quality-gates',
    title: 'Security Scanning and Quality Gates',
    description: 'View vulnerability scan results, understand severity levels, and create quality gate policies to enforce security standards.',
  });
  await tutorial.begin();

  // --- Chapter 1: Security Dashboard ---
  tutorial.chapter('Security Dashboard');

  await page.goto('/security');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);

  await tutorial.show('Security dashboard', 'The Security dashboard shows a summary of vulnerabilities found across all your artifacts. Artifact Keeper integrates with Trivy to scan packages automatically on upload.');

  tutorial.narrate('Severity cards at the top show counts of critical, high, medium, and low vulnerabilities. The chart below tracks trends over time.');
  await tutorial.pause(2000);
  await tutorial.step('Severity breakdown');

  // --- Chapter 2: Scan Results ---
  tutorial.chapter('Viewing Scan Results');

  tutorial.narrate('Scroll down to see individual scan results for each artifact.');
  await tutorial.pause(1500);
  await tutorial.step('Scan results table');

  // --- Chapter 3: Quality Gates ---
  tutorial.chapter('Quality Gates');

  await page.goto('/quality-gates');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);

  await tutorial.show('Quality gates page', 'Quality gates let you define policies that block or warn when artifacts fail security checks. This prevents vulnerable packages from reaching production.');

  // Create a quality gate
  tutorial.narrate('Let us create a quality gate that blocks artifacts with critical vulnerabilities.');
  const createBtn = page.getByRole('button', { name: /new gate|create/i }).first();
  await createBtn.click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole('dialog');
  await tutorial.step('Quality gate form');

  // Fill in the form fields
  const nameInput = dialog.getByPlaceholder('e.g., Production Release Gate');
  await nameInput.fill('staging-release-gate');
  await tutorial.pause(800);

  // Look for vulnerability threshold fields (type=number inputs have role spinbutton)
  const criticalInput = dialog.getByText('Critical', { exact: true }).locator('..').getByRole('spinbutton');
  if (await criticalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await criticalInput.fill('0');
    await tutorial.pause(600);
  }

  const highInput = dialog.getByText('High', { exact: true }).locator('..').getByRole('spinbutton');
  if (await highInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await highInput.fill('3');
    await tutorial.pause(600);
  }

  await tutorial.show('Gate configured', 'We set zero tolerance for critical issues and allow up to three high-severity findings. You can tune these thresholds to match your organization security posture.');

  // Submit
  await dialog.getByRole('button', { name: /create|save/i }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('Quality gate created');

  // --- Chapter 4: How Gates Work ---
  tutorial.chapter('How Gates Work');

  tutorial.narrate('When an artifact is uploaded, Artifact Keeper scans it and checks against your quality gates. If a gate fails, the artifact is blocked or flagged depending on the action you configured. This gives your security team confidence that nothing bypasses the checks.');
  await tutorial.pause(3000);

  await tutorial.finish();
});
