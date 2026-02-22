import { test } from '@playwright/test';
import { TutorialHelper } from './fixtures/tutorial-helper';
import { DashboardPage } from '../fixtures/page-objects';

test('Tutorial: Getting Started with Artifact Keeper', async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: '01-getting-started',
    title: 'Getting Started with Artifact Keeper',
    description: 'Log in to Artifact Keeper, explore the dashboard, and navigate the main sections of the UI.',
  });
  await tutorial.begin();

  // --- Chapter 1: Login ---
  tutorial.chapter('Login');

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Login page', 'Welcome to Artifact Keeper. Start by logging in with your credentials.');

  await page.getByLabel(/username/i).fill('admin');
  await tutorial.pause(600);
  await page.getByLabel(/password/i).fill('admin');
  await tutorial.pause(600);

  tutorial.narrate('Enter your username and password, then click Sign In.');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForLoadState('networkidle');
  await tutorial.pause(2000);

  // --- Chapter 2: Dashboard Overview ---
  tutorial.chapter('Dashboard Overview');

  await tutorial.show('Dashboard', 'This is the main dashboard. It shows system health, repository statistics, and recent activity.');

  const dashboard = new DashboardPage(page);
  await tutorial.pause(1500);

  tutorial.narrate('The health cards at the top show the status of your storage, database, and search engine.');
  await tutorial.step('Health cards');
  await tutorial.pause(1500);

  tutorial.narrate('Below that, you can see counts for repositories, artifacts, users, and total storage used.');
  await tutorial.step('Statistics');
  await tutorial.pause(1500);

  // --- Chapter 3: Navigation Tour ---
  tutorial.chapter('Navigating the UI');

  tutorial.narrate('The sidebar provides access to all sections. Let us walk through the main ones.');
  await tutorial.pause(1000);

  // Repositories
  await page.goto('/repositories');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Repositories page', 'The Repositories page shows all your local, remote, and virtual repositories in a split-panel layout.');
  await tutorial.pause(1500);

  // Packages
  await page.goto('/packages');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Packages page', 'The Packages page lets you browse and search all artifacts across repositories.');
  await tutorial.pause(1500);

  // Security
  await page.goto('/security');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Security dashboard', 'The Security dashboard gives you an overview of vulnerability scan results across all your artifacts.');
  await tutorial.pause(1500);

  // Users
  await page.goto('/users');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Users page', 'User management is where you create accounts, assign roles, and manage access.');
  await tutorial.pause(1500);

  // Settings
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await tutorial.show('Settings page', 'System settings let you configure storage, authentication, and other instance-wide options.');
  await tutorial.pause(2000);

  tutorial.narrate('That covers the basics. In the next video, we will create our first repositories.');

  await tutorial.finish();
});
