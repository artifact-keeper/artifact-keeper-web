import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tutorials',
  testMatch: /\.tutorial\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://artifactkeeper.possum-fujita.ts.net',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    screenshot: 'off',
    trace: 'off',
    colorScheme: 'dark',
    launchOptions: {
      slowMo: 100,
    },
  },
  projects: [
    {
      name: 'tutorials-setup',
      testDir: './e2e/setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'tutorials',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['tutorials-setup'],
    },
  ],
});
