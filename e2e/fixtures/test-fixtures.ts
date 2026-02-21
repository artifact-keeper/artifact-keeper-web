import { test as base, type APIResponse, type Page, type Locator } from '@playwright/test';

export { expect } from '@playwright/test';

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
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React Hook
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

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React Hook
    await use({
      get: (path) => makeRequest('GET', path),
      post: (path, data) => makeRequest('POST', path, data),
      put: (path, data) => makeRequest('PUT', path, data),
      delete: (path) => makeRequest('DELETE', path),
    });
  },
});

// ---------------------------------------------------------------------------
// Shared E2E helpers
// ---------------------------------------------------------------------------

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

/** Click a tab in a tablist and wait for content to load. */
export async function switchTab(page: Page, tabName: RegExp): Promise<void> {
  await page.locator('[role="tablist"]').getByText(tabName).click();
  await page.waitForTimeout(1000);
}

/** Check if a text element is visible on the page. Returns visibility boolean for use with test.skip(). */
export async function isRowVisible(
  page: Page,
  text: string
): Promise<boolean> {
  const row = page.getByText(text).first();
  return row.isVisible({ timeout: 10000 }).catch(() => false);
}

/** Open the token management dialog for a service account row. Clicks the first button in the row. */
export async function openTokenDialogForAccount(
  page: Page,
  accountName: RegExp
): Promise<Locator> {
  const tokenBtn = page
    .getByRole('row', { name: accountName })
    .getByRole('button')
    .first();
  await tokenBtn.click();
  await page.waitForTimeout(1000);
  const dialog = page.getByRole('dialog');
  await base.expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

/** Get the display name input locator (tries label then placeholder). */
export function getDisplayNameInput(page: Page): Locator {
  return page
    .getByLabel('Display Name')
    .or(page.locator('input[placeholder="Your display name"]'));
}

/** Revoke a token/key row by clicking its action button and confirming. */
export async function revokeRowItem(
  page: Page,
  itemName: RegExp
): Promise<void> {
  const revokeBtn = page
    .getByRole('row', { name: itemName })
    .getByRole('button')
    .first();
  await revokeBtn.click();

  const confirmBtn = page.getByRole('button', { name: /revoke/i }).last();
  const confirmVisible = await confirmBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (confirmVisible) {
    await confirmBtn.click();
  }

  await page.waitForTimeout(2000);
  await assertNoAppErrors(page);
}

/** Get action buttons for a table row matching the given name. */
export function getRowActionButtons(page: Page, rowName: RegExp): Locator {
  return page.getByRole('row', { name: rowName }).getByRole('button');
}

/** Click "Create Token" inside a dialog and wait for the form to appear. */
export async function clickCreateTokenInDialog(
  dialog: Locator,
  waitMs = 500
): Promise<void> {
  await dialog.getByRole('button', { name: /create token/i }).first().click();
  await dialog.page().waitForTimeout(waitMs);
}

/** Click the create/submit button in a dialog (handles "Create" or "Create Token" labels). */
export async function submitTokenForm(
  dialog: Locator,
  page: Page
): Promise<void> {
  const createBtn = dialog
    .getByRole('button', { name: /create$/i })
    .or(dialog.getByRole('button', { name: /create token$/i }));
  await createBtn.first().click();
  await page.waitForTimeout(3000);
}

// ---------------------------------------------------------------------------
// Shared Component Helpers
// ---------------------------------------------------------------------------

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
