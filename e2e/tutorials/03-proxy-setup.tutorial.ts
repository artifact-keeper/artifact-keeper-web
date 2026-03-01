import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';

test('Tutorial: Setting Up a Proxy Repository', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '03-proxy-setup',
    title: 'Setting Up a Proxy Repository',
    description: 'Configure an NPM proxy repository to cache packages from the public registry, reducing external downloads and improving build reliability.',
  });
  await tutorial.begin();

  // --- Chapter 1: Why Proxy ---
  tutorial.chapter('Why Use a Proxy Repository');

  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.show('Repositories overview', 'A proxy repository sits between your builds and the public registry. It caches downloaded packages locally, so repeated installs are fast and your builds work even if the upstream goes down.');

  // --- Chapter 2: Create NPM Proxy ---
  tutorial.chapter('Create the NPM Proxy');

  tutorial.narrate('Let us set up an NPM proxy that caches packages from npmjs.org.');
  await page.getByRole('button', { name: /create repository/i }).first().click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/key|name/i).first().fill('npm-proxy-demo');
  await tutorial.pause(800);

  const formatSelect = dialog.getByLabel(/format/i).or(dialog.getByRole('combobox').first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /npm/i }).first().click();
  await tutorial.pause(600);

  const typeSelect = dialog.getByLabel(/type/i).or(dialog.getByRole('combobox').nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page.getByRole('option', { name: /remote/i }).first().click();
  await tutorial.pause(600);

  const urlInput = dialog.getByLabel(/url|upstream/i).or(dialog.getByPlaceholder(/url/i));
  await urlInput.fill('https://registry.npmjs.org');
  await tutorial.pause(800);

  await tutorial.show('NPM proxy configuration', 'Set the key, format, type to remote, and the upstream URL to https://registry.npmjs.org.');

  await dialog.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('NPM proxy created');

  // --- Chapter 3: Explore the Proxy ---
  tutorial.chapter('Exploring the Proxy');

  tutorial.narrate('Click on the proxy repository to see its details.');
  await page.goto('/repositories');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1000);

  // Click on the proxy repo
  await page.getByText('npm-proxy-demo').first().click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.show('Proxy detail view', 'The detail panel shows repository settings, cached packages, and download statistics.');

  // --- Chapter 4: Using the Proxy ---
  tutorial.chapter('Configuring Your Client');

  tutorial.narrate('To use this proxy, configure your npm client to point to the proxy URL shown in the repository details. Packages are cached on first download and served locally after that.');
  await tutorial.pause(2000);
  await tutorial.step('Client configuration');

  tutorial.narrate('That is all it takes to set up a proxy. Your builds now go through Artifact Keeper, giving you caching, security scanning, and a single point of control.');
  await tutorial.pause(2000);

  await tutorial.finish();
});
