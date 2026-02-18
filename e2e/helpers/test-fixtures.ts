import { test as base, expect, type APIResponse } from '@playwright/test';

/**
 * Extended test fixtures for Artifact Keeper E2E tests.
 *
 * Provides:
 *  - Automatic console error assertion per test
 *  - API helper for backend requests
 *  - Admin API client with pre-configured auth
 */

// Console errors to ignore (network issues from API calls that haven't loaded yet, etc.)
const IGNORED_CONSOLE_PATTERNS = [
  'net::',
  'Failed to fetch',
  'NetworkError',
  'Failed to load resource',
  'favicon',
  'hydration',
  'Hydration',
];

type TestFixtures = {
  /** Collected console errors (filtered). Asserted empty in afterEach. */
  consoleErrors: string[];
  /** Make an authenticated API request to the backend. */
  adminApi: {
    get: (path: string) => Promise<APIResponse>;
    post: (path: string, data?: unknown) => Promise<APIResponse>;
    put: (path: string, data?: unknown) => Promise<APIResponse>;
    delete: (path: string) => Promise<APIResponse>;
  };
};

export const test = base.extend<TestFixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const isIgnored = IGNORED_CONSOLE_PATTERNS.some((p) => text.includes(p));
        if (!isIgnored) {
          errors.push(text);
        }
      }
    });
    await use(errors);
  },

  adminApi: async ({ page }, use) => {
    const makeRequest = async (method: string, path: string, data?: unknown) => {
      const url = path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`;
      const options: Parameters<typeof page.request.fetch>[1] = { method };
      if (data) {
        options.data = data;
      }
      return page.request.fetch(url, options);
    };

    await use({
      get: (path) => makeRequest('GET', path),
      post: (path, data) => makeRequest('POST', path, data),
      put: (path, data) => makeRequest('PUT', path, data),
      delete: (path) => makeRequest('DELETE', path),
    });
  },
});

export { expect };
