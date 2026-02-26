import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  expect: {
    timeout: 10_000,
  },
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
