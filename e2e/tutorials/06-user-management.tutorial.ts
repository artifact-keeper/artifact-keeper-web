import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';

test('Tutorial: User Management and Access Control', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '06-user-management',
    title: 'User Management and Access Control',
    description: 'Create users, organize them into groups, assign permissions, and generate API access tokens.',
  });
  await tutorial.begin();

  // --- Chapter 1: Users ---
  tutorial.chapter('Creating Users');

  await page.goto('/users');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1500);

  await tutorial.show('Users page', 'The Users page lists all accounts on your instance. Artifact Keeper supports local users, LDAP, and SSO authentication.');

  tutorial.narrate('Let us create a new user for a developer on the team.');
  await page.getByRole('button', { name: /create user/i }).click();
  await page.waitForTimeout(1000);

  const userDialog = page.getByRole('dialog');
  await tutorial.step('Create user dialog');

  await userDialog.getByLabel(/username/i).first().fill('jane.smith');
  await tutorial.pause(600);
  await userDialog.getByLabel(/email/i).first().fill('jane.smith@example.com');
  await tutorial.pause(600);
  await userDialog.getByLabel(/display name/i).or(userDialog.getByLabel(/name/i)).first().fill('Jane Smith');
  await tutorial.pause(600);
  await userDialog.getByLabel(/password/i).first().fill('SecurePassword1!');
  await tutorial.pause(600);

  await tutorial.show('User form filled', 'Fill in the username, email, display name, and an initial password.');

  await userDialog.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('User created');

  // --- Chapter 2: Groups ---
  tutorial.chapter('Managing Groups');

  await page.goto('/groups');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1500);

  await tutorial.show('Groups page', 'Groups let you organize users into teams and assign permissions collectively instead of per-user.');

  tutorial.narrate('Let us create a group for the platform engineering team.');
  await page.getByRole('button', { name: /create group/i }).click();
  await page.waitForTimeout(1000);

  const groupDialog = page.getByRole('dialog');
  await groupDialog.getByLabel(/name/i).first().fill('platform-engineering');
  await tutorial.pause(600);

  const descInput = groupDialog.getByLabel(/description/i).or(groupDialog.getByPlaceholder(/description/i)).first();
  if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await descInput.fill('Platform engineering team with publish access');
    await tutorial.pause(600);
  }

  await tutorial.show('Group form', 'Give the group a name and optional description.');

  await groupDialog.getByRole('button', { name: /create$/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(2000);
  await tutorial.step('Group created');

  // --- Chapter 3: Permissions ---
  tutorial.chapter('Assigning Permissions');

  await page.goto('/permissions');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1500);

  await tutorial.show('Permissions page', 'Permission rules control who can read, write, or admin specific repositories. You can target individual users or entire groups.');

  tutorial.narrate('You can create permission rules that grant groups access to specific repositories or repository patterns. This keeps access management scalable as your team grows.');
  await tutorial.pause(2000);
  await tutorial.step('Permission rules');

  // --- Chapter 4: Access Tokens ---
  tutorial.chapter('API Access Tokens');

  await page.goto('/access-tokens');
  await page.waitForLoadState('domcontentloaded');
  await tutorial.pause(1500);

  await tutorial.show('Access tokens page', 'Access tokens let users authenticate API calls and CI pipelines without using passwords.');

  tutorial.narrate('Users can create personal access tokens from their profile, or admins can create tokens for service accounts. Tokens can be scoped and have expiration dates.');
  await tutorial.pause(2000);
  await tutorial.step('Token management');

  tutorial.narrate('That wraps up user management. With users, groups, permissions, and tokens, you have fine-grained control over who can access what in your artifact registry.');
  await tutorial.pause(2000);

  await tutorial.finish();
});
