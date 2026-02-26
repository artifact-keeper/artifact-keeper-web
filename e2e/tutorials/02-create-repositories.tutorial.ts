import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';
test('Tutorial: Creating Repositories', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '02-create-repositories',
    title: 'Creating Repositories in Artifact Keeper',
    description: 'Learn how to create local, remote, and virtual repositories for different package formats.',
  });
  await tutorial.begin();

  // --- Chapter 1: Overview ---
  tutorial.chapter('Repository Types');

  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.show('Repositories list', 'Artifact Keeper supports three repository types: local for your own artifacts, remote for proxying external registries, and virtual for combining multiple sources.');

  // --- Chapter 2: Create Local Repo ---
  tutorial.chapter('Create a Local Repository');

  tutorial.narrate('Let us create a local Maven repository for our release builds.');
  await page.getByRole('button', { name: /create repository/i }).first().click();
  await page.waitForTimeout(1000);
  await tutorial.step('Create dialog open');

  // Fill in the form
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/key|name/i).first().fill('maven-releases');
  await tutorial.pause(800);

  // Select format
  const formatSelect = dialog.getByLabel(/format/i).or(dialog.getByRole('combobox').first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /maven/i }).first().click();
  await tutorial.pause(800);

  // Select type
  const typeSelect = dialog.getByLabel(/type/i).or(dialog.getByRole('combobox').nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /local/i }).first().click();
  await tutorial.pause(800);

  await tutorial.show('Local repo form filled', 'We have named it maven-releases, selected Maven format, and local type.');

  // Submit
  tutorial.narrate('Click Create to set up the repository.');
  await dialog.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('Local repo created');

  // --- Chapter 3: Create Remote Repo ---
  tutorial.chapter('Create a Remote Repository');

  tutorial.narrate('Now let us create a remote repository that proxies the public NPM registry.');
  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1000);

  await page.getByRole('button', { name: /create repository/i }).first().click();
  await page.waitForTimeout(1000);

  const dialog2 = page.getByRole('dialog');
  await dialog2.getByLabel(/key|name/i).first().fill('npmjs-proxy');
  await tutorial.pause(800);

  const formatSelect2 = dialog2.getByLabel(/format/i).or(dialog2.getByRole('combobox').first());
  await formatSelect2.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /npm/i }).first().click();
  await tutorial.pause(800);

  const typeSelect2 = dialog2.getByLabel(/type/i).or(dialog2.getByRole('combobox').nth(1));
  await typeSelect2.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /remote/i }).first().click();
  await tutorial.pause(800);

  // Fill upstream URL
  const urlInput = dialog2.getByLabel(/url|upstream/i).or(dialog2.getByPlaceholder(/url/i));
  await urlInput.fill('https://registry.npmjs.org');
  await tutorial.pause(800);

  await tutorial.show('Remote repo form', 'For a remote repository, you also provide the upstream URL to proxy.');

  tutorial.narrate('Click Create to set up the proxy.');
  await dialog2.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('Remote repo created');

  // --- Chapter 4: Create Virtual Repo ---
  tutorial.chapter('Create a Virtual Repository');

  tutorial.narrate('Finally, a virtual repository aggregates multiple sources behind a single URL.');
  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1000);

  await page.getByRole('button', { name: /create repository/i }).first().click();
  await page.waitForTimeout(1000);

  const dialog3 = page.getByRole('dialog');
  await dialog3.getByLabel(/key|name/i).first().fill('npm-virtual');
  await tutorial.pause(800);

  const formatSelect3 = dialog3.getByLabel(/format/i).or(dialog3.getByRole('combobox').first());
  await formatSelect3.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /npm/i }).first().click();
  await tutorial.pause(800);

  const typeSelect3 = dialog3.getByLabel(/type/i).or(dialog3.getByRole('combobox').nth(1));
  await typeSelect3.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /virtual/i }).first().click();
  await tutorial.pause(800);

  await tutorial.show('Virtual repo form', 'A virtual repository combines local and remote sources. Your teams use one URL and Artifact Keeper resolves packages from all sources in priority order.');

  await dialog3.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('Virtual repo created');

  // --- Wrap up ---
  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1500);
  await tutorial.show('All repos created', 'We now have a local Maven repository, an NPM proxy, and an NPM virtual repository. In the next video, we will dive deeper into proxy configuration.');

  await tutorial.finish();
});
