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

// ---------------------------------------------------------------------------
// Shared E2E helpers
// ---------------------------------------------------------------------------

import type { Page, Locator } from '@playwright/test';

/** Filter console errors down to critical ones (TypeError, etc.). */
export function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('net::') &&
      !e.includes('Failed to load resource') &&
      (e.includes('TypeError') ||
        e.includes('is not a function') ||
        e.includes('Cannot read'))
  );
}

/** Navigate to a page and wait for network idle. */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Open a dialog by clicking a button, return the dialog locator. */
export async function openDialog(
  page: Page,
  buttonName: RegExp
): Promise<Locator> {
  await page.getByRole('button', { name: buttonName }).click();
  const dialog = page.getByRole('dialog');
  await base.expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

/** Fill a dialog name input (tries label first, then placeholder). */
export async function fillDialogName(
  dialog: Locator,
  value: string,
  placeholder?: RegExp
): Promise<void> {
  const nameInput = dialog
    .getByLabel(/name/i)
    .first()
    .or(dialog.getByPlaceholder(placeholder ?? /name/i).first());
  await nameInput.fill(value);
}

/** Dismiss a "token created" alert by clicking Done if visible. */
export async function dismissTokenAlert(page: Page): Promise<void> {
  const doneBtn = page.getByRole('button', { name: /done/i }).first();
  const visible = await doneBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (visible) {
    await doneBtn.click();
  }
}

/** Assert no application-level errors on the page. */
export async function assertNoAppErrors(page: Page): Promise<void> {
  const content = await page.textContent('body');
  base.expect(content).not.toContain('Application error');
}
