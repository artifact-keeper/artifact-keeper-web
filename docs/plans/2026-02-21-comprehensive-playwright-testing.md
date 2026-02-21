# Comprehensive Playwright E2E Test Suite - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve 100% Playwright E2E coverage across interactions, RBAC roles, and visual regression, with a docs screenshot export pipeline.

**Architecture:** Three independent test suites (interactions, roles, visual) sharing a common infrastructure layer (data seeding, auth states, page objects). Tests run against a real docker-compose backend stack. Screenshots export to the Astro docs site via a manifest-driven pipeline.

**Tech Stack:** Playwright 1.58+, TypeScript, Next.js 15 App Router, docker-compose for E2E stack, GitHub Actions CI

**Design doc:** `docs/plans/2026-02-21-comprehensive-playwright-testing-design.md`

---

## Phase 1: Infrastructure

### Task 1: Create directory structure

**Files:**
- Create: `e2e/setup/` (directory)
- Create: `e2e/fixtures/page-objects/` (directory)
- Create: `e2e/suites/interactions/{auth,dashboard,repositories,packages,staging,admin,security,operations,integrations}/` (directories)
- Create: `e2e/suites/roles/` (directory)
- Create: `e2e/suites/visual/{pages,components,states}/` (directories)
- Create: `e2e/screenshots/{pages,components,states}/` (directories)
- Create: `e2e/docs-export/` (directory)

**Step 1: Create all directories**

```bash
cd /Users/khan/ak/artifact-keeper-web
mkdir -p e2e/setup
mkdir -p e2e/fixtures/page-objects
mkdir -p e2e/suites/interactions/{auth,dashboard,repositories,packages,staging,admin,security,operations,integrations}
mkdir -p e2e/suites/roles
mkdir -p e2e/suites/visual/{pages,components,states}
mkdir -p e2e/screenshots/{pages,components,states}
mkdir -p e2e/docs-export
```

**Step 2: Add .gitkeep files so empty directories are tracked**

```bash
find e2e/screenshots -type d -empty -exec touch {}/.gitkeep \;
touch e2e/docs-export/.gitkeep
```

**Step 3: Commit**

```bash
git add e2e/setup e2e/fixtures e2e/suites e2e/screenshots e2e/docs-export
git commit -m "chore: scaffold E2E test suite directory structure"
```

---

### Task 2: Create auth-states configuration

**Files:**
- Create: `e2e/setup/auth-states.ts`

**Step 1: Write the auth-states module**

This module defines each test role and its expected permissions. The global setup uses this to create users and store auth state files.

```typescript
// e2e/setup/auth-states.ts
import path from 'path';

export interface TestRole {
  username: string;
  password: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  /** File path for Playwright storageState */
  storageStatePath: string;
  /** Pages this role should be able to access */
  accessibleRoutes: string[];
  /** Pages this role should be denied */
  deniedRoutes: string[];
}

const AUTH_DIR = path.join(__dirname, '..', '.auth');

export const TEST_ROLES: Record<string, TestRole> = {
  admin: {
    username: 'admin',
    password: 'admin',
    email: 'admin@test.local',
    displayName: 'Admin User',
    isAdmin: true,
    storageStatePath: path.join(AUTH_DIR, 'admin.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/users', '/settings', '/security', '/analytics', '/monitoring'],
    deniedRoutes: [],
  },
  developer: {
    username: 'e2e-developer',
    password: 'Developer1!',
    email: 'developer@test.local',
    displayName: 'Dev User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'developer.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/staging', '/plugins', '/webhooks', '/access-tokens', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/analytics', '/monitoring', '/backups'],
  },
  viewer: {
    username: 'e2e-viewer',
    password: 'Viewer1!',
    email: 'viewer@test.local',
    displayName: 'View User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'viewer.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/staging', '/analytics', '/monitoring'],
  },
  'security-auditor': {
    username: 'e2e-security',
    password: 'Security1!',
    email: 'security@test.local',
    displayName: 'Security Auditor',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'security-auditor.json'),
    accessibleRoutes: ['/', '/security', '/quality-gates', '/license-policies', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/analytics', '/monitoring'],
  },
  restricted: {
    username: 'e2e-restricted',
    password: 'Restricted1!',
    email: 'restricted@test.local',
    displayName: 'Restricted User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'restricted.json'),
    accessibleRoutes: ['/', '/profile'],
    deniedRoutes: ['/repositories', '/packages', '/users', '/settings', '/security', '/analytics'],
  },
};

export const ALL_ROLES = Object.keys(TEST_ROLES);
export const NON_ADMIN_ROLES = ALL_ROLES.filter((r) => r !== 'admin');
```

**Step 2: Commit**

```bash
git add e2e/setup/auth-states.ts
git commit -m "feat(e2e): add auth-states config with 5 test roles"
```

---

### Task 3: Create seed-data module

**Files:**
- Create: `e2e/setup/seed-data.ts`

This module creates predictable test data via the backend API. It runs during global setup before any test suite starts.

**Step 1: Write the seed-data module**

```typescript
// e2e/setup/seed-data.ts
import { type APIRequestContext } from '@playwright/test';
import { TEST_ROLES } from './auth-states';

const API_BASE = '/api/v1';

/** Helper to make API requests as admin */
async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const url = `${API_BASE}${path}`;
  const options: Parameters<typeof request.fetch>[1] = { method };
  if (data) options.data = data;
  const resp = await request.fetch(url, options);
  if (!resp.ok()) {
    const body = await resp.text().catch(() => '');
    // 409 = already exists, which is fine for idempotent seeding
    if (resp.status() !== 409) {
      console.warn(`Seed API ${method} ${path} failed (${resp.status()}): ${body}`);
    }
  }
  return resp;
}

/** Create test users (non-admin roles) via the admin API */
export async function seedUsers(request: APIRequestContext): Promise<void> {
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue; // admin already exists
    await api(request, 'POST', '/admin/users', {
      username: role.username,
      password: role.password,
      email: role.email,
      display_name: role.displayName,
      is_admin: role.isAdmin,
    });
  }
}

/** Create test repositories */
export async function seedRepositories(request: APIRequestContext): Promise<void> {
  const repos = [
    { key: 'e2e-maven-local', name: 'E2E Maven Local', format: 'maven', repo_type: 'local' },
    { key: 'e2e-npm-remote', name: 'E2E NPM Remote', format: 'npm', repo_type: 'remote', upstream_url: 'https://registry.npmjs.org' },
    { key: 'e2e-docker-virtual', name: 'E2E Docker Virtual', format: 'docker', repo_type: 'virtual' },
  ];
  for (const repo of repos) {
    await api(request, 'POST', '/repositories', repo);
  }
}

/** Create test groups and assign members */
export async function seedGroups(request: APIRequestContext): Promise<void> {
  const groups = [
    { name: 'e2e-dev-team', description: 'Development team for E2E tests' },
    { name: 'e2e-security-team', description: 'Security team for E2E tests' },
  ];
  for (const group of groups) {
    await api(request, 'POST', '/groups', group);
  }
}

/** Create a test webhook */
export async function seedWebhook(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/webhooks', {
    name: 'e2e-test-webhook',
    url: 'https://httpbin.org/post',
    events: ['artifact_uploaded', 'repository_created'],
  });
}

/** Create a test quality gate */
export async function seedQualityGate(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/quality-gates', {
    name: 'e2e-test-gate',
    description: 'Quality gate for E2E tests',
    max_critical_issues: 0,
    max_high_issues: 5,
    required_checks: ['security'],
    action: 'warn',
  });
}

/** Create a test lifecycle policy */
export async function seedLifecyclePolicy(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/lifecycle/policies', {
    name: 'e2e-test-cleanup',
    description: 'Cleanup policy for E2E tests',
    policy_type: 'max_age_days',
    config: { max_age_days: 30 },
    priority: 10,
  });
}

/** Create a test service account */
export async function seedServiceAccount(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/service-accounts', {
    name: 'e2e-ci-bot',
    description: 'Service account for E2E tests',
  });
}

/** Run all seed functions */
export async function seedAll(request: APIRequestContext): Promise<void> {
  console.log('[seed] Creating test users...');
  await seedUsers(request);
  console.log('[seed] Creating test repositories...');
  await seedRepositories(request);
  console.log('[seed] Creating test groups...');
  await seedGroups(request);
  console.log('[seed] Creating test webhook...');
  await seedWebhook(request);
  console.log('[seed] Creating test quality gate...');
  await seedQualityGate(request);
  console.log('[seed] Creating test lifecycle policy...');
  await seedLifecyclePolicy(request);
  console.log('[seed] Creating test service account...');
  await seedServiceAccount(request);
  console.log('[seed] Done.');
}

/** Clean up seeded data (best-effort, called in teardown) */
export async function cleanupAll(request: APIRequestContext): Promise<void> {
  // Delete in reverse dependency order
  // Service accounts, webhooks, quality gates, lifecycle policies, groups, repos, users
  // Use list + delete pattern; ignore 404s
  console.log('[cleanup] Cleaning up seeded test data...');

  // These are best-effort; failures are logged but don't block
  await api(request, 'DELETE', '/webhooks/e2e-test-webhook').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-maven-local').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-npm-remote').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-docker-virtual').catch(() => {});

  // Users (non-admin)
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    await api(request, 'DELETE', `/admin/users/${role.username}`).catch(() => {});
  }

  console.log('[cleanup] Done.');
}
```

**Step 2: Commit**

```bash
git add e2e/setup/seed-data.ts
git commit -m "feat(e2e): add API-driven data seeding for E2E tests"
```

---

### Task 4: Rewrite global-setup for multi-role auth

**Files:**
- Modify: `e2e/setup/global-setup.ts` (new file, replaces `e2e/global-setup.ts`)

The new global setup:
1. Logs in as admin
2. Seeds all test data via the API
3. Logs in as each non-admin role and saves their auth state

**Step 1: Write the new global-setup**

```typescript
// e2e/setup/global-setup.ts
import { test as setup, expect } from '@playwright/test';
import { TEST_ROLES } from './auth-states';
import { seedAll } from './seed-data';

/** Login as a user and save their storageState */
async function loginAndSaveState(
  page: import('@playwright/test').Page,
  username: string,
  password: string,
  storageStatePath: string,
) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);

  const loginPromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
    { timeout: 15000 },
  );

  await page.getByRole('button', { name: 'Sign In' }).click();
  await loginPromise.catch(() => null);

  // Wait for redirect to dashboard or change-password
  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, { timeout: 15000 });

  // Handle first-login password change if needed
  if (page.url().includes('change-password')) {
    await page.getByLabel(/new password/i).first().fill(password);
    await page.getByLabel(/confirm/i).fill(password);
    await page.getByRole('button', { name: /change|update|save/i }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await page.context().storageState({ path: storageStatePath });
}

setup('authenticate and seed data', async ({ page }) => {
  // 1. Login as admin first
  const admin = TEST_ROLES.admin;
  await loginAndSaveState(page, admin.username, admin.password, admin.storageStatePath);

  // 2. Seed test data using admin's authenticated session
  await seedAll(page.request);

  // 3. Login as each non-admin role and save their auth state
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    // Clear cookies/state before logging in as next user
    await page.context().clearCookies();
    console.log(`[setup] Authenticating as ${roleName}...`);
    await loginAndSaveState(page, role.username, role.password, role.storageStatePath);
  }

  console.log('[setup] All roles authenticated and states saved.');
});
```

**Step 2: Commit**

```bash
git add e2e/setup/global-setup.ts
git commit -m "feat(e2e): multi-role global setup with data seeding"
```

---

### Task 5: Move and extend test-fixtures

**Files:**
- Create: `e2e/fixtures/test-fixtures.ts` (copy + extend from `e2e/helpers/test-fixtures.ts`)

**Step 1: Copy existing fixtures to new location**

```bash
cp e2e/helpers/test-fixtures.ts e2e/fixtures/test-fixtures.ts
```

**Step 2: Add shared component helpers to the new file**

Append the following helper classes to `e2e/fixtures/test-fixtures.ts`:

```typescript
// --- Shared Component Helpers ---

/** Helper for interacting with dialogs across the app */
export class DialogHelper {
  constructor(private page: Page) {}

  async open(buttonName: RegExp): Promise<Locator> {
    await this.page.getByRole('button', { name: buttonName }).click();
    const dialog = this.page.getByRole('dialog');
    await base.expect(dialog).toBeVisible({ timeout: 10000 });
    return dialog;
  }

  async submit(dialog: Locator, buttonName: RegExp = /create|save|submit|confirm/i): Promise<void> {
    await dialog.getByRole('button', { name: buttonName }).click();
    await this.page.waitForTimeout(1000);
  }

  async cancel(dialog: Locator): Promise<void> {
    await dialog.getByRole('button', { name: /cancel|close/i }).click();
    await base.expect(dialog).not.toBeVisible({ timeout: 5000 });
  }

  async fillField(dialog: Locator, label: RegExp, value: string): Promise<void> {
    await dialog.getByLabel(label).fill(value);
  }
}

/** Helper for interacting with data tables */
export class DataTableHelper {
  readonly table: Locator;

  constructor(private page: Page, tableLocator?: Locator) {
    this.table = tableLocator ?? page.getByRole('table').first();
  }

  async getRowCount(): Promise<number> {
    const rows = this.table.getByRole('row');
    // Subtract 1 for header row
    return Math.max(0, (await rows.count()) - 1);
  }

  async hasRow(text: string | RegExp): Promise<boolean> {
    const row = this.table.getByRole('row').filter({ hasText: text });
    return row.isVisible({ timeout: 5000 }).catch(() => false);
  }

  async clickRowAction(rowText: string | RegExp, buttonName: RegExp): Promise<void> {
    const row = this.table.getByRole('row').filter({ hasText: rowText });
    await row.getByRole('button', { name: buttonName }).click();
  }
}

/** Helper for tab interactions */
export class TabHelper {
  constructor(private page: Page) {}

  async switchTo(tabName: string | RegExp): Promise<void> {
    await this.page.getByRole('tablist').getByRole('tab', { name: tabName }).click();
    await this.page.waitForTimeout(500);
  }

  async isActive(tabName: string | RegExp): Promise<boolean> {
    const tab = this.page.getByRole('tablist').getByRole('tab', { name: tabName });
    const selected = await tab.getAttribute('aria-selected');
    return selected === 'true';
  }
}

/** Helper for toast/notification assertions */
export class ToastHelper {
  constructor(private page: Page) {}

  async expectSuccess(text?: string | RegExp): Promise<void> {
    const toast = this.page.locator('[data-sonner-toast][data-type="success"]').or(
      this.page.getByRole('status').filter({ hasText: text ?? /success|created|saved|updated|deleted/i })
    );
    await base.expect(toast.first()).toBeVisible({ timeout: 10000 });
  }

  async expectError(text?: string | RegExp): Promise<void> {
    const toast = this.page.locator('[data-sonner-toast][data-type="error"]').or(
      this.page.getByRole('alert').filter({ hasText: text ?? /error|failed/i })
    );
    await base.expect(toast.first()).toBeVisible({ timeout: 10000 });
  }
}
```

**Step 3: Commit**

```bash
git add e2e/fixtures/test-fixtures.ts
git commit -m "feat(e2e): add shared component helpers (Dialog, DataTable, Tab, Toast)"
```

---

### Task 6: Create core page objects

**Files:**
- Create: `e2e/fixtures/page-objects/LoginPage.ts`
- Create: `e2e/fixtures/page-objects/DashboardPage.ts`
- Create: `e2e/fixtures/page-objects/RepositoriesPage.ts`
- Create: `e2e/fixtures/page-objects/PackagesPage.ts`
- Create: `e2e/fixtures/page-objects/UsersPage.ts`
- Create: `e2e/fixtures/page-objects/GroupsPage.ts`
- Create: `e2e/fixtures/page-objects/index.ts`

These are the first batch of POMs. Additional POMs will be created in later tasks as we migrate each spec file. Each POM follows the same pattern: readonly locators, action methods, no assertions.

**Step 1: Write LoginPage**

```typescript
// e2e/fixtures/page-objects/LoginPage.ts
import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly ldapTabs: Locator;
  readonly ssoButtons: Locator;

  constructor(private page: Page) {
    this.usernameInput = page.getByLabel(/username/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage = page.getByRole('alert');
    this.ldapTabs = page.getByRole('tablist');
    this.ssoButtons = page.locator('button').filter({ hasText: /sso|oauth|saml|oidc/i });
  }

  async goto() { await this.page.goto('/login'); }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

**Step 2: Write DashboardPage**

```typescript
// e2e/fixtures/page-objects/DashboardPage.ts
import { type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly healthCards: Locator;
  readonly statCards: Locator;
  readonly recentReposTable: Locator;
  readonly cveChart: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.healthCards = page.locator('[data-testid="health-card"]').or(
      page.getByText(/healthy|unhealthy|degraded/i).first()
    );
    this.statCards = page.locator('[data-testid="stat-card"]').or(
      page.getByText(/repositories|artifacts|users|storage/i).first()
    );
    this.recentReposTable = page.getByRole('table').first();
    this.cveChart = page.locator('[data-testid="cve-chart"]').or(
      page.getByText(/vulnerabilit|cve/i).first()
    );
  }

  async goto() { await this.page.goto('/'); }
}
```

**Step 3: Write RepositoriesPage**

```typescript
// e2e/fixtures/page-objects/RepositoriesPage.ts
import { type Page, type Locator } from '@playwright/test';

export class RepositoriesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly createButton: Locator;
  readonly repoList: Locator;
  readonly detailPanel: Locator;
  readonly formatFilter: Locator;
  readonly typeFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /repositor/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.createButton = page.getByRole('button', { name: /create/i });
    this.repoList = page.locator('[data-testid="repo-list"]').or(
      page.getByRole('listbox').or(page.getByRole('list'))
    );
    this.detailPanel = page.locator('[data-testid="repo-detail-panel"]');
    this.formatFilter = page.getByRole('combobox', { name: /format/i });
    this.typeFilter = page.getByRole('combobox', { name: /type/i });
  }

  async goto() { await this.page.goto('/repositories'); }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async selectRepo(name: string) {
    await this.repoList.getByText(name).click();
  }
}
```

**Step 4: Write PackagesPage**

```typescript
// e2e/fixtures/page-objects/PackagesPage.ts
import { type Page, type Locator } from '@playwright/test';

export class PackagesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly packageList: Locator;
  readonly gridViewButton: Locator;
  readonly listViewButton: Locator;
  readonly formatFilter: Locator;
  readonly repoFilter: Locator;
  readonly sortSelect: Locator;
  readonly pagination: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /package/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.packageList = page.locator('[data-testid="package-list"]').or(
      page.getByRole('list').first()
    );
    this.gridViewButton = page.getByRole('button', { name: /grid/i });
    this.listViewButton = page.getByRole('button', { name: /list/i });
    this.formatFilter = page.getByRole('combobox', { name: /format/i });
    this.repoFilter = page.getByRole('combobox', { name: /repository/i });
    this.sortSelect = page.getByRole('combobox', { name: /sort/i });
    this.pagination = page.locator('[data-testid="pagination"]').or(
      page.getByRole('navigation', { name: /pagination/i })
    );
  }

  async goto() { await this.page.goto('/packages'); }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
```

**Step 5: Write UsersPage**

```typescript
// e2e/fixtures/page-objects/UsersPage.ts
import { type Page, type Locator } from '@playwright/test';

export class UsersPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly usersTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /user/i }).first();
    this.createButton = page.getByRole('button', { name: /create user/i });
    this.usersTable = page.getByRole('table');
  }

  async goto() { await this.page.goto('/users'); }

  async openCreateDialog() {
    await this.createButton.click();
    return this.page.getByRole('dialog');
  }
}
```

**Step 6: Write GroupsPage**

```typescript
// e2e/fixtures/page-objects/GroupsPage.ts
import { type Page, type Locator } from '@playwright/test';

export class GroupsPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly groupsTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /group/i }).first();
    this.createButton = page.getByRole('button', { name: /create group/i });
    this.groupsTable = page.getByRole('table');
  }

  async goto() { await this.page.goto('/groups'); }
}
```

**Step 7: Write barrel export**

```typescript
// e2e/fixtures/page-objects/index.ts
export { LoginPage } from './LoginPage';
export { DashboardPage } from './DashboardPage';
export { RepositoriesPage } from './RepositoriesPage';
export { PackagesPage } from './PackagesPage';
export { UsersPage } from './UsersPage';
export { GroupsPage } from './GroupsPage';
```

**Step 8: Commit**

```bash
git add e2e/fixtures/page-objects/
git commit -m "feat(e2e): add core page object models (Login, Dashboard, Repos, Packages, Users, Groups)"
```

---

### Task 7: Update Playwright config for multi-project setup

**Files:**
- Modify: `playwright.config.ts`

**Step 1: Write the updated config**

Replace the entire contents of `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://artifactkeeper.possum-fujita.ts.net',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // --- Setup ---
    {
      name: 'setup',
      testDir: './e2e/setup',
      testMatch: /global-setup\.ts/,
    },

    // --- Legacy tests (existing specs, run during migration) ---
    {
      name: 'legacy',
      testDir: './e2e',
      testMatch: /^[^/]+\.spec\.ts$/,  // only top-level spec files
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // --- Interaction tests ---
    {
      name: 'interactions',
      testDir: './e2e/suites/interactions',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // --- RBAC role tests ---
    {
      name: 'roles-admin',
      testDir: './e2e/suites/roles',
      testMatch: /admin\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'roles-developer',
      testDir: './e2e/suites/roles',
      testMatch: /regular-user\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/developer.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'roles-viewer',
      testDir: './e2e/suites/roles',
      testMatch: /viewer\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/viewer.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'roles-security',
      testDir: './e2e/suites/roles',
      testMatch: /security-auditor\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/security-auditor.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'roles-restricted',
      testDir: './e2e/suites/roles',
      testMatch: /restricted\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/restricted.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'roles-unauthenticated',
      testDir: './e2e/suites/roles',
      testMatch: /unauthenticated\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // No storageState - unauthenticated
      },
      dependencies: ['setup'],
    },

    // --- Visual regression ---
    {
      name: 'visual',
      testDir: './e2e/suites/visual',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

**Step 2: Verify config loads**

Run: `cd /Users/khan/ak/artifact-keeper-web && npx playwright test --list --project=setup`
Expected: Lists the setup test without errors.

**Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "feat(e2e): update Playwright config with multi-project setup (interactions, roles, visual)"
```

---

### Task 8: Add visual regression CSS mask

**Files:**
- Create: `e2e/visual-mask.css`

This CSS hides dynamic content (timestamps, random IDs, version numbers) in screenshots to prevent false diffs.

**Step 1: Write the CSS mask**

```css
/* e2e/visual-mask.css */
/* Hide dynamic content that changes between runs */

/* Timestamps and dates */
[data-testid*="timestamp"],
[data-testid*="date"],
time {
  visibility: hidden !important;
}

/* Random IDs and tokens */
[data-testid*="id"],
[data-testid*="token-value"] {
  visibility: hidden !important;
}

/* Animated elements */
[data-testid*="spinner"],
.animate-spin,
.animate-pulse {
  animation: none !important;
  opacity: 0 !important;
}

/* Version numbers in footer/header */
[data-testid="app-version"] {
  visibility: hidden !important;
}
```

**Step 2: Commit**

```bash
git add e2e/visual-mask.css
git commit -m "feat(e2e): add CSS mask for visual regression stability"
```

---

## Phase 2: Migrate Existing Specs

### Task 9: Migrate auth specs

**Files:**
- Move: `e2e/auth.spec.ts` -> `e2e/suites/interactions/auth/login.spec.ts`
- Create: `e2e/suites/interactions/auth/logout.spec.ts`

**Step 1: Copy auth.spec.ts to new location**

```bash
cp e2e/auth.spec.ts e2e/suites/interactions/auth/login.spec.ts
```

**Step 2: Update imports to use new fixture path**

In `e2e/suites/interactions/auth/login.spec.ts`, update the import:
```typescript
import { test, expect } from '../../../fixtures/test-fixtures';
```

**Step 3: Run the migrated test**

Run: `npx playwright test --project=interactions suites/interactions/auth/login.spec.ts --reporter=list`
Expected: Tests pass (same behavior as before).

**Step 4: Create logout spec**

```typescript
// e2e/suites/interactions/auth/logout.spec.ts
import { test, expect } from '../../../fixtures/test-fixtures';

test.describe('Logout', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click logout (usually in user menu dropdown)
    const userMenu = page.getByRole('button', { name: /account|user|profile|admin/i }).first();
    await userMenu.click();
    await page.getByRole('menuitem', { name: /log out|sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
```

**Step 5: Commit**

```bash
git add e2e/suites/interactions/auth/
git commit -m "feat(e2e): migrate auth specs to interactions/auth/"
```

---

### Task 10: Migrate dashboard spec

**Files:**
- Move: `e2e/dashboard.spec.ts` -> `e2e/suites/interactions/dashboard/dashboard.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/dashboard.spec.ts e2e/suites/interactions/dashboard/dashboard.spec.ts
```

Update import paths in the copied file to reference `../../../fixtures/test-fixtures`.

**Step 2: Run**

Run: `npx playwright test --project=interactions suites/interactions/dashboard/ --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/interactions/dashboard/
git commit -m "feat(e2e): migrate dashboard spec to interactions/dashboard/"
```

---

### Task 11: Migrate repository specs

**Files:**
- Move: `e2e/repositories.spec.ts` -> `e2e/suites/interactions/repositories/repo-list.spec.ts`
- Move: `e2e/repository-detail.spec.ts` -> `e2e/suites/interactions/repositories/repo-detail.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/repositories.spec.ts e2e/suites/interactions/repositories/repo-list.spec.ts
cp e2e/repository-detail.spec.ts e2e/suites/interactions/repositories/repo-detail.spec.ts
```

Update import paths in both files.

**Step 2: Run**

Run: `npx playwright test --project=interactions suites/interactions/repositories/ --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/interactions/repositories/
git commit -m "feat(e2e): migrate repository specs to interactions/repositories/"
```

---

### Task 12: Migrate package specs

**Files:**
- Move: `e2e/package-browser.spec.ts` -> `e2e/suites/interactions/packages/package-browse.spec.ts`
- Move: `e2e/package-detail.spec.ts` -> `e2e/suites/interactions/packages/package-detail.spec.ts`
- Move: `e2e/packages.spec.ts` -> `e2e/suites/interactions/packages/packages.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/package-browser.spec.ts e2e/suites/interactions/packages/package-browse.spec.ts
cp e2e/package-detail.spec.ts e2e/suites/interactions/packages/package-detail.spec.ts
cp e2e/packages.spec.ts e2e/suites/interactions/packages/packages.spec.ts
```

**Step 2: Run**

Run: `npx playwright test --project=interactions suites/interactions/packages/ --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/interactions/packages/
git commit -m "feat(e2e): migrate package specs to interactions/packages/"
```

---

### Task 13: Migrate staging specs

**Files:**
- Move: `e2e/staging.spec.ts` -> `e2e/suites/interactions/staging/staging-list.spec.ts`
- Move: `e2e/staging-rejection.spec.ts` -> `e2e/suites/interactions/staging/staging-rejection.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/staging.spec.ts e2e/suites/interactions/staging/staging-list.spec.ts
cp e2e/staging-rejection.spec.ts e2e/suites/interactions/staging/staging-rejection.spec.ts
```

**Step 2: Run and commit**

Run: `npx playwright test --project=interactions suites/interactions/staging/ --reporter=list`

```bash
git add e2e/suites/interactions/staging/
git commit -m "feat(e2e): migrate staging specs to interactions/staging/"
```

---

### Task 14: Migrate admin specs (users, groups, permissions, settings, SSO, backups, migration)

**Files:**
- Move: `e2e/users-mgmt.spec.ts` -> `e2e/suites/interactions/admin/users.spec.ts`
- Move: `e2e/groups-mgmt.spec.ts` -> `e2e/suites/interactions/admin/groups.spec.ts`
- Move: `e2e/permissions-mgmt.spec.ts` -> `e2e/suites/interactions/admin/permissions.spec.ts`
- Move: `e2e/admin.spec.ts` -> `e2e/suites/interactions/admin/settings.spec.ts`
- Move: `e2e/sso.spec.ts` -> `e2e/suites/interactions/admin/sso.spec.ts`
- Move: `e2e/backups-page.spec.ts` -> `e2e/suites/interactions/admin/backups.spec.ts`
- Move: `e2e/migration-page.spec.ts` -> `e2e/suites/interactions/admin/migration.spec.ts`
- Move: `e2e/service-accounts.spec.ts` -> `e2e/suites/interactions/admin/service-accounts.spec.ts`

**Step 1: Copy all admin specs**

```bash
cp e2e/users-mgmt.spec.ts e2e/suites/interactions/admin/users.spec.ts
cp e2e/groups-mgmt.spec.ts e2e/suites/interactions/admin/groups.spec.ts
cp e2e/permissions-mgmt.spec.ts e2e/suites/interactions/admin/permissions.spec.ts
cp e2e/admin.spec.ts e2e/suites/interactions/admin/settings.spec.ts
cp e2e/sso.spec.ts e2e/suites/interactions/admin/sso.spec.ts
cp e2e/backups-page.spec.ts e2e/suites/interactions/admin/backups.spec.ts
cp e2e/migration-page.spec.ts e2e/suites/interactions/admin/migration.spec.ts
cp e2e/service-accounts.spec.ts e2e/suites/interactions/admin/service-accounts.spec.ts
```

**Step 2: Update all imports to use new fixture path**

In each file, change the import to: `import { test, expect } from '../../../fixtures/test-fixtures';`
(If using `@playwright/test` directly, update to use the extended fixtures.)

**Step 3: Run and commit**

Run: `npx playwright test --project=interactions suites/interactions/admin/ --reporter=list`

```bash
git add e2e/suites/interactions/admin/
git commit -m "feat(e2e): migrate admin specs to interactions/admin/"
```

---

### Task 15: Migrate security specs

**Files:**
- Move: `e2e/security-full.spec.ts` -> `e2e/suites/interactions/security/security-dashboard.spec.ts`
- Move: `e2e/quality-gates.spec.ts` -> `e2e/suites/interactions/security/quality-gates.spec.ts`
- Move: `e2e/license-policies-page.spec.ts` -> `e2e/suites/interactions/security/license-policies.spec.ts`
- Move: `e2e/health-dashboard.spec.ts` -> `e2e/suites/interactions/security/health-dashboard.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/security-full.spec.ts e2e/suites/interactions/security/security-dashboard.spec.ts
cp e2e/quality-gates.spec.ts e2e/suites/interactions/security/quality-gates.spec.ts
cp e2e/license-policies-page.spec.ts e2e/suites/interactions/security/license-policies.spec.ts
cp e2e/health-dashboard.spec.ts e2e/suites/interactions/security/health-dashboard.spec.ts
```

**Step 2: Run and commit**

Run: `npx playwright test --project=interactions suites/interactions/security/ --reporter=list`

```bash
git add e2e/suites/interactions/security/
git commit -m "feat(e2e): migrate security specs to interactions/security/"
```

---

### Task 16: Migrate operations specs

**Files:**
- Move: `e2e/analytics-page.spec.ts` -> `e2e/suites/interactions/operations/analytics.spec.ts`
- Move: `e2e/monitoring-page.spec.ts` -> `e2e/suites/interactions/operations/monitoring.spec.ts`
- Move: `e2e/telemetry-page.spec.ts` -> `e2e/suites/interactions/operations/telemetry.spec.ts`
- Move: `e2e/lifecycle-page.spec.ts` -> `e2e/suites/interactions/operations/lifecycle.spec.ts`
- Move: `e2e/approvals.spec.ts` -> `e2e/suites/interactions/operations/approvals.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/analytics-page.spec.ts e2e/suites/interactions/operations/analytics.spec.ts
cp e2e/monitoring-page.spec.ts e2e/suites/interactions/operations/monitoring.spec.ts
cp e2e/telemetry-page.spec.ts e2e/suites/interactions/operations/telemetry.spec.ts
cp e2e/lifecycle-page.spec.ts e2e/suites/interactions/operations/lifecycle.spec.ts
cp e2e/approvals.spec.ts e2e/suites/interactions/operations/approvals.spec.ts
```

**Step 2: Run and commit**

Run: `npx playwright test --project=interactions suites/interactions/operations/ --reporter=list`

```bash
git add e2e/suites/interactions/operations/
git commit -m "feat(e2e): migrate operations specs to interactions/operations/"
```

---

### Task 17: Migrate integrations specs

**Files:**
- Move: `e2e/peers.spec.ts` -> `e2e/suites/interactions/integrations/peers.spec.ts`
- Move: `e2e/replication.spec.ts` -> `e2e/suites/interactions/integrations/replication.spec.ts`
- Move: `e2e/plugins.spec.ts` -> `e2e/suites/interactions/integrations/plugins.spec.ts`
- Move: `e2e/webhooks.spec.ts` -> `e2e/suites/interactions/integrations/webhooks.spec.ts`
- Move: `e2e/access-tokens.spec.ts` -> `e2e/suites/interactions/integrations/access-tokens.spec.ts`
- Move: `e2e/profile.spec.ts` + `e2e/profile-crud.spec.ts` -> `e2e/suites/interactions/integrations/profile.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/peers.spec.ts e2e/suites/interactions/integrations/peers.spec.ts
cp e2e/replication.spec.ts e2e/suites/interactions/integrations/replication.spec.ts
cp e2e/plugins.spec.ts e2e/suites/interactions/integrations/plugins.spec.ts
cp e2e/webhooks.spec.ts e2e/suites/interactions/integrations/webhooks.spec.ts
cp e2e/access-tokens.spec.ts e2e/suites/interactions/integrations/access-tokens.spec.ts
cp e2e/profile.spec.ts e2e/suites/interactions/integrations/profile.spec.ts
cp e2e/profile-crud.spec.ts e2e/suites/interactions/integrations/profile-crud.spec.ts
```

**Step 2: Run and commit**

Run: `npx playwright test --project=interactions suites/interactions/integrations/ --reporter=list`

```bash
git add e2e/suites/interactions/integrations/
git commit -m "feat(e2e): migrate integrations specs to interactions/integrations/"
```

---

### Task 18: Migrate remaining specs (search, builds, setup, API tests)

**Files:**
- Move: `e2e/search.spec.ts` -> `e2e/suites/interactions/dashboard/search.spec.ts`
- Move: `e2e/builds.spec.ts` -> `e2e/suites/interactions/dashboard/builds.spec.ts`
- Move: `e2e/setup.spec.ts` -> `e2e/suites/interactions/dashboard/setup.spec.ts`
- Move: `e2e/api-comprehensive.spec.ts` -> `e2e/suites/interactions/dashboard/api-comprehensive.spec.ts`
- Move: `e2e/api-integration.spec.ts` -> `e2e/suites/interactions/dashboard/api-integration.spec.ts`

**Step 1: Copy and update imports**

```bash
cp e2e/search.spec.ts e2e/suites/interactions/dashboard/search.spec.ts
cp e2e/builds.spec.ts e2e/suites/interactions/dashboard/builds.spec.ts
cp e2e/setup.spec.ts e2e/suites/interactions/dashboard/setup.spec.ts
cp e2e/api-comprehensive.spec.ts e2e/suites/interactions/dashboard/api-comprehensive.spec.ts
cp e2e/api-integration.spec.ts e2e/suites/interactions/dashboard/api-integration.spec.ts
```

**Step 2: Run full interactions suite**

Run: `npx playwright test --project=interactions --reporter=list`
Expected: All migrated tests pass.

**Step 3: Commit**

```bash
git add e2e/suites/interactions/dashboard/
git commit -m "feat(e2e): migrate remaining specs (search, builds, setup, API)"
```

---

### Task 19: Verify full migration and remove legacy specs

**Step 1: Run both legacy and interactions projects**

Run: `npx playwright test --project=legacy --project=interactions --reporter=list`

Compare test counts. Both projects should have the same total tests.

**Step 2: Remove old spec files from root e2e/**

Once all tests pass in the new location, delete the old flat spec files:

```bash
# List all files that were migrated
ls e2e/*.spec.ts
# Remove them (keep global-setup.ts and helpers/ for now)
rm e2e/access-tokens.spec.ts e2e/admin.spec.ts e2e/analytics-page.spec.ts \
   e2e/api-comprehensive.spec.ts e2e/api-integration.spec.ts e2e/approvals.spec.ts \
   e2e/auth.spec.ts e2e/backups-page.spec.ts e2e/builds.spec.ts e2e/dashboard.spec.ts \
   e2e/groups-mgmt.spec.ts e2e/health-dashboard.spec.ts e2e/license-policies-page.spec.ts \
   e2e/lifecycle-page.spec.ts e2e/migration-page.spec.ts e2e/monitoring-page.spec.ts \
   e2e/package-browser.spec.ts e2e/package-detail.spec.ts e2e/packages.spec.ts \
   e2e/peers.spec.ts e2e/permissions-mgmt.spec.ts e2e/plugins.spec.ts \
   e2e/profile-crud.spec.ts e2e/profile.spec.ts e2e/quality-gates.spec.ts \
   e2e/replication.spec.ts e2e/repositories.spec.ts e2e/repository-detail.spec.ts \
   e2e/search.spec.ts e2e/security-full.spec.ts e2e/service-accounts.spec.ts \
   e2e/setup.spec.ts e2e/sso.spec.ts e2e/staging-rejection.spec.ts \
   e2e/staging.spec.ts e2e/telemetry-page.spec.ts e2e/users-mgmt.spec.ts \
   e2e/webhooks.spec.ts
```

**Step 3: Remove legacy project from playwright.config.ts**

Remove the `legacy` project block from `playwright.config.ts`.

**Step 4: Move old global-setup and helpers**

```bash
# Old global-setup is now replaced by e2e/setup/global-setup.ts
rm e2e/global-setup.ts
# Old helpers are now in e2e/fixtures/
rm -r e2e/helpers/
# Old page objects are now in e2e/fixtures/page-objects/
rm -r e2e/pages/
```

**Step 5: Run full suite to confirm**

Run: `npx playwright test --project=interactions --reporter=list`
Expected: All tests pass, same count as before migration.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore(e2e): remove legacy spec files after migration to suites"
```

---

## Phase 3: RBAC Role Tests

### Task 20: Write admin role spec

**Files:**
- Create: `e2e/suites/roles/admin.spec.ts`

**Step 1: Write the admin role test**

This verifies that the admin user can see all pages and all CRUD controls.

```typescript
// e2e/suites/roles/admin.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Admin role access', () => {
  test('sidebar shows all sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));

    // Admin should see all sidebar sections
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    await expect(sidebar.getByText(/repositor/i).first()).toBeVisible();
    await expect(sidebar.getByText(/package/i).first()).toBeVisible();
    await expect(sidebar.getByText(/security/i).first()).toBeVisible();
    await expect(sidebar.getByText(/user/i).first()).toBeVisible();
    await expect(sidebar.getByText(/setting/i).first()).toBeVisible();
    await expect(sidebar.getByText(/analytic/i).first()).toBeVisible();
    await expect(sidebar.getByText(/monitor/i).first()).toBeVisible();
  });

  test('admin pages are accessible', async ({ page }) => {
    const adminPages = ['/users', '/groups', '/settings', '/analytics', '/monitoring', '/backups', '/permissions'];
    for (const route of adminPages) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should NOT be redirected to login or 403
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/error\/403/);
    }
  });

  test('CRUD buttons are visible on admin pages', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create user/i })).toBeVisible();

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /create group/i })).toBeVisible();
  });
});
```

**Step 2: Run**

Run: `npx playwright test --project=roles-admin --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/roles/admin.spec.ts
git commit -m "feat(e2e): add admin RBAC role spec"
```

---

### Task 21: Write unauthenticated role spec

**Files:**
- Create: `e2e/suites/roles/unauthenticated.spec.ts`

**Step 1: Write the spec**

```typescript
// e2e/suites/roles/unauthenticated.spec.ts
import { test, expect } from '@playwright/test';

// This project has no storageState, so the user is unauthenticated

test.describe('Unauthenticated access', () => {
  const protectedRoutes = [
    '/',
    '/repositories',
    '/packages',
    '/profile',
    '/users',
    '/settings',
    '/security',
    '/analytics',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });
  }

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});
```

**Step 2: Run**

Run: `npx playwright test --project=roles-unauthenticated --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/roles/unauthenticated.spec.ts
git commit -m "feat(e2e): add unauthenticated RBAC role spec"
```

---

### Task 22: Write regular-user (developer) role spec

**Files:**
- Create: `e2e/suites/roles/regular-user.spec.ts`

**Step 1: Write the spec**

```typescript
// e2e/suites/roles/regular-user.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Developer role access', () => {
  test('can access repositories', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/repositor/i).first()).toBeVisible();
  });

  test('can access packages', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('can access profile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages redirect or show 403', async ({ page }) => {
    const adminRoutes = ['/users', '/groups', '/settings', '/backups'];
    for (const route of adminRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Should be redirected to 403 or show forbidden message
      const url = page.url();
      const content = await page.textContent('body');
      const isBlocked = url.includes('/error/403') || url.includes('/login') ||
        (content?.includes('forbidden') || content?.includes('Forbidden') || content?.includes('denied') || false);
      expect(isBlocked).toBe(true);
    }
  });

  test('sidebar hides admin section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));

    // Should NOT see admin-only items
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Settings$/)).not.toBeVisible();
  });
});
```

**Step 2: Run**

Run: `npx playwright test --project=roles-developer --reporter=list`
Expected: PASS

**Step 3: Commit**

```bash
git add e2e/suites/roles/regular-user.spec.ts
git commit -m "feat(e2e): add developer RBAC role spec"
```

---

### Task 23: Write remaining role specs (viewer, security-auditor, restricted)

**Files:**
- Create: `e2e/suites/roles/viewer.spec.ts`
- Create: `e2e/suites/roles/security-auditor.spec.ts`
- Create: `e2e/suites/roles/restricted.spec.ts`

**Step 1: Write viewer.spec.ts**

```typescript
// e2e/suites/roles/viewer.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Viewer role access', () => {
  test('can view repositories (read-only)', async ({ page }) => {
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    // Create button should NOT be visible for viewers
    await expect(page.getByRole('button', { name: /create/i })).not.toBeVisible();
  });

  test('can view packages (read-only)', async ({ page }) => {
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages are denied', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const content = await page.textContent('body');
    const isBlocked = url.includes('/error/403') || url.includes('/login') ||
      (content?.includes('forbidden') || content?.includes('denied') || false);
    expect(isBlocked).toBe(true);
  });
});
```

**Step 2: Write security-auditor.spec.ts**

```typescript
// e2e/suites/roles/security-auditor.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Security Auditor role access', () => {
  test('can access security dashboard', async ({ page }) => {
    await page.goto('/security');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/security/i).first()).toBeVisible();
  });

  test('can access quality gates', async ({ page }) => {
    await page.goto('/quality-gates');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('admin pages are denied', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const content = await page.textContent('body');
    const isBlocked = url.includes('/error/403') || url.includes('/login') ||
      (content?.includes('forbidden') || content?.includes('denied') || false);
    expect(isBlocked).toBe(true);
  });
});
```

**Step 3: Write restricted.spec.ts**

```typescript
// e2e/suites/roles/restricted.spec.ts
import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Restricted role access', () => {
  test('can access dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('can access own profile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test('most pages are denied', async ({ page }) => {
    const restrictedRoutes = ['/repositories', '/packages', '/users', '/settings', '/security', '/analytics'];
    for (const route of restrictedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const url = page.url();
      const content = await page.textContent('body');
      const isBlocked = url.includes('/error/403') || url.includes('/login') ||
        (content?.includes('forbidden') || content?.includes('denied') || false);
      expect(isBlocked).toBe(true);
    }
  });

  test('sidebar shows minimal items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(page.getByRole('navigation'));
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    // Most sections should be hidden
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Analytics$/)).not.toBeVisible();
  });
});
```

**Step 4: Run all role tests**

Run: `npx playwright test --project=roles-viewer --project=roles-security --project=roles-restricted --reporter=list`
Expected: PASS

**Step 5: Commit**

```bash
git add e2e/suites/roles/
git commit -m "feat(e2e): add viewer, security-auditor, and restricted RBAC role specs"
```

---

## Phase 4: Visual Regression

### Task 24: Write page-level visual regression specs

**Files:**
- Create: `e2e/suites/visual/pages/core-pages.spec.ts`
- Create: `e2e/suites/visual/pages/admin-pages.spec.ts`

**Step 1: Write core-pages visual spec**

```typescript
// e2e/suites/visual/pages/core-pages.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual regression: core pages', () => {
  const pages = [
    { name: 'dashboard', route: '/' },
    { name: 'repositories', route: '/repositories' },
    { name: 'packages', route: '/packages' },
    { name: 'search', route: '/search' },
    { name: 'login', route: '/login' },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // let animations settle
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: '../../../visual-mask.css',
      });
    });

    test(`${name} - mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-mobile-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: '../../../visual-mask.css',
      });
    });
  }
});
```

**Step 2: Write admin-pages visual spec**

```typescript
// e2e/suites/visual/pages/admin-pages.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual regression: admin pages', () => {
  const pages = [
    { name: 'users', route: '/users' },
    { name: 'groups', route: '/groups' },
    { name: 'settings', route: '/settings' },
    { name: 'security', route: '/security' },
    { name: 'analytics', route: '/analytics' },
    { name: 'monitoring', route: '/monitoring' },
    { name: 'permissions', route: '/permissions' },
    { name: 'quality-gates', route: '/quality-gates' },
    { name: 'backups', route: '/backups' },
    { name: 'lifecycle', route: '/lifecycle' },
    { name: 'telemetry', route: '/telemetry' },
    { name: 'system-health', route: '/system-health' },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: '../../../visual-mask.css',
      });
    });
  }
});
```

**Step 3: Generate initial baselines**

Run: `npx playwright test --project=visual --update-snapshots --reporter=list`
Expected: All tests pass, screenshots saved to `e2e/suites/visual/pages/core-pages.spec.ts-snapshots/` etc.

**Step 4: Commit baselines**

```bash
git add e2e/suites/visual/
git commit -m "feat(e2e): add page-level visual regression specs with initial baselines"
```

---

### Task 25: Write component-level visual regression specs

**Files:**
- Create: `e2e/suites/visual/components/components.spec.ts`

**Step 1: Write component visual spec**

```typescript
// e2e/suites/visual/components/components.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual regression: components', () => {
  test('sidebar - expanded', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('[data-testid="app-sidebar"]').or(
      page.locator('aside').first()
    );
    await expect(sidebar).toHaveScreenshot('sidebar-expanded.png', { maxDiffPixelRatio: 0.01 });
  });

  test('app header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const header = page.locator('header').first();
    await expect(header).toHaveScreenshot('app-header.png', { maxDiffPixelRatio: 0.01 });
  });

  test('users table', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table').first();
    await expect(table).toHaveScreenshot('users-table.png', { maxDiffPixelRatio: 0.01 });
  });

  test('create user dialog', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot('create-user-dialog.png', { maxDiffPixelRatio: 0.01 });
    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('confirm delete dialog', async ({ page }) => {
    // Navigate to a page with delete functionality and trigger the confirm dialog
    await page.goto('/repositories');
    await page.waitForLoadState('networkidle');
    // This is best-effort; skip if no repos exist
    const actionButton = page.getByRole('button', { name: /delete/i }).first();
    if (await actionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionButton.click();
      const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(confirmDialog).toHaveScreenshot('confirm-delete-dialog.png', { maxDiffPixelRatio: 0.01 });
        await confirmDialog.getByRole('button', { name: /cancel/i }).click();
      }
    }
  });
});
```

**Step 2: Generate baselines and commit**

Run: `npx playwright test --project=visual suites/visual/components/ --update-snapshots --reporter=list`

```bash
git add e2e/suites/visual/components/
git commit -m "feat(e2e): add component-level visual regression specs"
```

---

### Task 26: Write state visual regression specs (loading, empty, error)

**Files:**
- Create: `e2e/suites/visual/states/states.spec.ts`

**Step 1: Write state visual spec**

```typescript
// e2e/suites/visual/states/states.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual regression: UI states', () => {
  test('loading skeleton - repositories', async ({ page }) => {
    // Delay API response to capture loading state
    await page.route('**/api/v1/repositories*', async (route) => {
      await new Promise((r) => setTimeout(r, 5000)); // 5s delay
      await route.continue();
    });
    await page.goto('/repositories');
    // Capture during loading (before API responds)
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('loading-repositories.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('empty state - packages', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/v1/packages*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
    await page.goto('/packages');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('empty-packages.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('error state - dashboard API failure', async ({ page }) => {
    // Mock 500 error on stats endpoint
    await page.route('**/api/v1/admin/stats*', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('error-dashboard.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('error state - 403 forbidden page', async ({ page }) => {
    await page.goto('/error/403');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('error-403.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('error state - 500 server error page', async ({ page }) => {
    await page.goto('/error/500');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('error-500.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });
});
```

**Step 2: Generate baselines and commit**

Run: `npx playwright test --project=visual suites/visual/states/ --update-snapshots --reporter=list`

```bash
git add e2e/suites/visual/states/
git commit -m "feat(e2e): add state visual regression specs (loading, empty, error)"
```

---

## Phase 5: CI Pipeline & Docs Export

### Task 27: Create docs-export manifest script

**Files:**
- Create: `e2e/scripts/generate-docs-manifest.ts`

This script reads screenshot baselines and generates the manifest.json for the docs site.

**Step 1: Write the script**

```typescript
// e2e/scripts/generate-docs-manifest.ts
import * as fs from 'fs';
import * as path from 'path';

interface ScreenshotManifestEntry {
  file: string;
  page: string;
  route: string;
  viewport: string;
  role: string;
  description: string;
}

/** Map screenshot filenames to metadata */
const PAGE_METADATA: Record<string, { page: string; route: string; description: string }> = {
  'dashboard': { page: 'Dashboard', route: '/', description: 'Main dashboard with health status and statistics' },
  'repositories': { page: 'Repositories', route: '/repositories', description: 'Repository management with split-panel layout' },
  'packages': { page: 'Packages', route: '/packages', description: 'Package browser with search and filters' },
  'search': { page: 'Search', route: '/search', description: 'Global search across all artifacts' },
  'login': { page: 'Login', route: '/login', description: 'Authentication page with SSO support' },
  'users': { page: 'Users', route: '/users', description: 'User management with RBAC controls' },
  'groups': { page: 'Groups', route: '/groups', description: 'Group management for team access' },
  'settings': { page: 'Settings', route: '/settings', description: 'System configuration and storage settings' },
  'security': { page: 'Security', route: '/security', description: 'Security dashboard with vulnerability overview' },
  'analytics': { page: 'Analytics', route: '/analytics', description: 'Usage analytics and download metrics' },
  'monitoring': { page: 'Monitoring', route: '/monitoring', description: 'System health monitoring' },
  'permissions': { page: 'Permissions', route: '/permissions', description: 'Permission rules management' },
  'quality-gates': { page: 'Quality Gates', route: '/quality-gates', description: 'Artifact quality gate policies' },
  'backups': { page: 'Backups', route: '/backups', description: 'Backup and restore management' },
  'lifecycle': { page: 'Lifecycle', route: '/lifecycle', description: 'Artifact lifecycle policies' },
  'telemetry': { page: 'Telemetry', route: '/telemetry', description: 'Telemetry data and opt-in settings' },
  'system-health': { page: 'System Health', route: '/system-health', description: 'Detailed system health checks' },
};

function parseScreenshotName(filename: string): Partial<ScreenshotManifestEntry> {
  // Format: {page}-{viewport}-{role}.png
  const match = filename.match(/^(.+)-(desktop|mobile)-(\w+)\.png$/);
  if (!match) return {};
  const [, pageName, viewport, role] = match;
  const meta = PAGE_METADATA[pageName] || { page: pageName, route: `/${pageName}`, description: '' };
  return { ...meta, viewport, role, file: filename };
}

function main() {
  const snapshotDirs = [
    'e2e/suites/visual/pages/core-pages.spec.ts-snapshots',
    'e2e/suites/visual/pages/admin-pages.spec.ts-snapshots',
  ];

  const manifest: ScreenshotManifestEntry[] = [];
  const docsExportDir = 'e2e/docs-export';

  for (const dir of snapshotDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
    for (const file of files) {
      const entry = parseScreenshotName(file);
      if (entry.file && entry.page) {
        manifest.push(entry as ScreenshotManifestEntry);
        // Copy to docs-export
        fs.copyFileSync(path.join(dir, file), path.join(docsExportDir, file));
      }
    }
  }

  fs.writeFileSync(
    path.join(docsExportDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Generated manifest with ${manifest.length} entries`);
}

main();
```

**Step 2: Add npm script**

In `package.json`, add:
```json
"test:e2e:docs-export": "npx tsx e2e/scripts/generate-docs-manifest.ts"
```

**Step 3: Commit**

```bash
git add e2e/scripts/generate-docs-manifest.ts package.json
git commit -m "feat(e2e): add docs-export manifest generator script"
```

---

### Task 28: Update CI workflow for parallel suites

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Update the e2e job to run parallel suites**

Replace the existing `e2e` job with three parallel jobs. The key changes:

1. Add `e2e-setup` job that starts docker-compose and runs seed
2. Split into `e2e-interactions` (with sharding), `e2e-roles`, `e2e-visual` jobs
3. Add `e2e-docs-export` job on main branch only

The `e2e-interactions` job uses Playwright's `--shard` flag:

```yaml
e2e-interactions:
  needs: [e2e-setup]
  strategy:
    matrix:
      shard: [1, 2, 3]
  steps:
    - run: npx playwright test --project=interactions --shard=${{ matrix.shard }}/3 --reporter=github,html
```

The `e2e-roles` job:

```yaml
e2e-roles:
  needs: [e2e-setup]
  steps:
    - run: npx playwright test --project=roles-admin --project=roles-developer --project=roles-viewer --project=roles-security --project=roles-restricted --project=roles-unauthenticated --reporter=github,html
```

The `e2e-visual` job:

```yaml
e2e-visual:
  needs: [e2e-setup]
  steps:
    - run: npx playwright test --project=visual --reporter=github,html
    # Upload diff images on failure
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: visual-regression-diffs
        path: test-results/
        retention-days: 7
```

The `e2e-docs-export` job (main branch only):

```yaml
e2e-docs-export:
  if: github.ref == 'refs/heads/main'
  needs: [e2e-visual]
  steps:
    - run: npm run test:e2e:docs-export
    - uses: actions/upload-artifact@v4
      with:
        name: docs-screenshots
        path: e2e/docs-export/
        retention-days: 30
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): update E2E pipeline with parallel suites, sharding, and docs export"
```

---

## Phase 6: Docs Site Gallery

### Task 29: Create UI gallery page on docs site

**Files:**
- Create: `artifact-keeper-site/src/content/docs/docs/ui-gallery.mdx`
- Modify: `artifact-keeper-site/astro.config.mjs` (add sidebar entry)

**Step 1: Write the gallery MDX page**

The gallery page reads screenshots from `public/screenshots/` and displays them in a filterable grid. Since Astro/Starlight supports MDX with components, create a simple gallery component.

```mdx
---
title: UI Gallery
description: Auto-generated screenshots of every page in Artifact Keeper
---

import { Image } from 'astro:assets';

# UI Gallery

Browse screenshots of every page in the Artifact Keeper web interface. These are generated automatically from our Playwright E2E test suite and updated on every release.

## Pages

Screenshots are captured at desktop (1280x720) and mobile (375x812) viewports.

{/* This page will be populated by the CI pipeline that copies screenshots to public/screenshots/ */}
{/* For now, reference screenshots manually as they become available */}

### Dashboard
![Dashboard - Desktop](/screenshots/dashboard-desktop-admin.png)

### Repositories
![Repositories - Desktop](/screenshots/repositories-desktop-admin.png)

### Packages
![Packages - Desktop](/screenshots/packages-desktop-admin.png)

### Security Dashboard
![Security - Desktop](/screenshots/security-desktop-admin.png)

### User Management
![Users - Desktop](/screenshots/users-desktop-admin.png)
```

**Step 2: Add sidebar entry in astro.config.mjs**

Add under the appropriate section:
```javascript
{ label: 'UI Gallery', link: '/docs/ui-gallery' }
```

**Step 3: Commit (in artifact-keeper-site repo)**

```bash
cd /Users/khan/ak/artifact-keeper-site
git add src/content/docs/docs/ui-gallery.mdx astro.config.mjs
git commit -m "feat(docs): add auto-generated UI gallery page for Playwright screenshots"
```

---

### Task 30: Gap analysis - create remaining page objects and interaction specs

After completing Phases 1-5, run the following gap analysis:

**Step 1: List all routes without interaction specs**

Compare `src/app/**/page.tsx` files against `e2e/suites/interactions/**/*.spec.ts`. Any page without a corresponding spec file needs one.

**Step 2: Create missing page objects**

For each page that doesn't have a POM yet, create one in `e2e/fixtures/page-objects/`. Follow the same pattern as Task 6.

Pages likely missing POMs (create as needed):
- `StagingPage.ts`
- `SearchPage.ts`
- `BuildsPage.ts`
- `PluginsPage.ts`
- `PeersPage.ts`
- `ReplicationPage.ts`
- `WebhooksPage.ts`
- `AccessTokensPage.ts`
- `ProfilePage.ts` (already exists but may need expanding)
- `ServiceAccountsPage.ts`
- `PermissionsPage.ts`
- `SettingsPage.ts`
- `SSOPage.ts`
- `BackupsPage.ts`
- `MigrationPage.ts`
- `AnalyticsPage.ts`
- `MonitoringPage.ts`
- `TelemetryPage.ts`
- `LifecyclePage.ts`
- `ApprovalsPage.ts`
- `SecurityDashboardPage.ts`
- `SecurityScansPage.ts`
- `SecurityPoliciesPage.ts`
- `DependencyTrackPage.ts`
- `QualityGatesPage.ts`
- `LicensePoliciesPage.ts`
- `SystemHealthPage.ts`
- `PackageDetailPage.ts`
- `RepositoryDetailPage.ts`

**Step 3: Add missing interaction tests**

For each migrated spec, review whether it covers:
- All CRUD operations (create, read, update, delete)
- Form validation (required fields, invalid input)
- Loading states (skeleton screens)
- Empty states (no data message)
- Error states (simulated API failure via `page.route()`)
- All interactive elements (buttons, dropdowns, tabs, toggles, pagination)

Add tests for any gaps found.

**Step 4: Commit incrementally as POMs and specs are added**

```bash
git add e2e/fixtures/page-objects/ e2e/suites/interactions/
git commit -m "feat(e2e): add remaining page objects and close interaction coverage gaps"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1: Infrastructure | 1-8 | Directory structure, auth states, seed data, fixtures, POMs, Playwright config, visual CSS mask |
| 2: Migration | 9-19 | Migrate all 38 existing specs to new suite structure, remove legacy files |
| 3: RBAC | 20-23 | 6 role specs (admin, developer, viewer, security-auditor, restricted, unauthenticated) |
| 4: Visual | 24-26 | Page screenshots, component screenshots, state screenshots (loading/empty/error) |
| 5: CI + Docs | 27-28 | Manifest generator, parallel CI pipeline with sharding |
| 6: Docs + Gaps | 29-30 | Docs site gallery page, gap analysis for remaining POMs and specs |

Total: 30 tasks, executed sequentially within each phase. Phases 3, 4, and 5 can run in parallel after Phase 2 completes.
