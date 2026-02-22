import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';

test('Tutorial: Virtual Repositories', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '04-virtual-repositories',
    title: 'Virtual Repositories in Artifact Keeper',
    description: 'Create a virtual repository that aggregates local and remote sources behind a single endpoint for your builds.',
  });
  await tutorial.begin();

  // --- Chapter 1: What are Virtual Repos ---
  tutorial.chapter('What Are Virtual Repositories');

  await page.goto('/repositories');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Repository list', 'Virtual repositories give your teams a single URL that resolves packages from multiple sources. Local packages, proxied packages, and other virtual repos can all be combined.');
  await tutorial.pause(1500);

  // --- Chapter 2: Prerequisites ---
  tutorial.chapter('Prerequisites');

  tutorial.narrate('Before creating a virtual repository, you need at least one local and one remote repository of the same format. Let us check that we have NPM repositories ready.');
  await tutorial.pause(1500);

  // Show existing repos
  const searchInput = page.getByPlaceholder(/search/i);
  await searchInput.fill('npm');
  await tutorial.pause(1500);
  await tutorial.show('NPM repositories', 'We can see our local NPM repository and NPM proxy are already set up.');

  // Clear search
  await searchInput.clear();
  await tutorial.pause(800);

  // --- Chapter 3: Create the Virtual Repo ---
  tutorial.chapter('Create a Virtual Repository');

  tutorial.narrate('Now let us create a virtual repository that combines both NPM sources.');
  await page.getByRole('button', { name: /create repository/i }).first().click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/key|name/i).first().fill('npm-all');
  await tutorial.pause(800);

  const formatSelect = dialog.getByLabel(/format/i).or(dialog.getByRole('combobox').first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /npm/i }).first().click();
  await tutorial.pause(600);

  const typeSelect = dialog.getByLabel(/type/i).or(dialog.getByRole('combobox').nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /virtual/i }).first().click();
  await tutorial.pause(800);

  await tutorial.show('Virtual repo form', 'Set the type to virtual. The form will show options for adding source repositories.');

  await dialog.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('networkidle');
  await tutorial.pause(2000);
  await tutorial.step('Virtual repo created');

  // --- Chapter 4: View the Virtual Repo ---
  tutorial.chapter('How Resolution Works');

  await page.goto('/repositories');
  await page.waitForLoadState('networkidle');
  await tutorial.pause(1000);

  await page.getByText('npm-all').or(page.getByText('npm-virtual')).first().click();
  await page.waitForLoadState('networkidle');
  await tutorial.pause(2000);

  await tutorial.show('Virtual repo details', 'When a package is requested, Artifact Keeper checks local sources first, then falls back to remote proxies. This means your internal packages always take priority.');

  tutorial.narrate('Configure your npm client to use this virtual repository URL. Your teams do not need to know which packages are local and which come from the public registry. Artifact Keeper handles the routing.');
  await tutorial.pause(2000);

  await tutorial.finish();
});
