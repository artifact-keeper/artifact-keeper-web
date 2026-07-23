import { type Page, type Locator } from '@playwright/test';

export class AuditLogPage {
  readonly heading: Locator;
  readonly actionFilter: Locator;
  readonly resourceTypeFilter: Locator;
  readonly userIdFilter: Locator;
  readonly fromFilter: Locator;
  readonly toFilter: Locator;
  readonly applyButton: Locator;
  readonly clearButton: Locator;
  readonly table: Locator;
  readonly pagination: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /audit log/i }).first();
    this.actionFilter = page.locator('#audit-filter-action');
    this.resourceTypeFilter = page.locator('#audit-filter-resource-type');
    this.userIdFilter = page.locator('#audit-filter-user-id');
    this.fromFilter = page.locator('#audit-filter-from');
    this.toFilter = page.locator('#audit-filter-to');
    this.applyButton = page.getByRole('button', { name: /apply filters/i });
    this.clearButton = page.getByRole('button', { name: /clear filters/i });
    this.table = page.getByRole('table');
    this.pagination = page.getByTestId('data-table-pagination');
  }

  async goto() { await this.page.goto('/audit'); }

  async applyActionFilter(action: string) {
    await this.actionFilter.fill(action);
    await this.applyButton.click();
  }
}
