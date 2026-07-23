import { type Page, type Locator } from '@playwright/test';

export class DownloadsPage {
  readonly heading: Locator;
  readonly artifactIdFilter: Locator;
  readonly userIdFilter: Locator;
  readonly ipFilter: Locator;
  readonly fromFilter: Locator;
  readonly toFilter: Locator;
  readonly applyButton: Locator;
  readonly clearButton: Locator;
  readonly eventsTab: Locator;
  readonly byIpTab: Locator;
  readonly byUserTab: Locator;
  readonly table: Locator;
  readonly pagination: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole('heading', { name: /^downloads$/i }).first();
    this.artifactIdFilter = page.locator('#downloads-filter-artifact-id');
    this.userIdFilter = page.locator('#downloads-filter-user-id');
    this.ipFilter = page.locator('#downloads-filter-ip');
    this.fromFilter = page.locator('#downloads-filter-from');
    this.toFilter = page.locator('#downloads-filter-to');
    this.applyButton = page.getByRole('button', { name: /apply filters/i });
    this.clearButton = page.getByRole('button', { name: /clear filters/i });
    this.eventsTab = page.getByRole('tab', { name: /events/i });
    this.byIpTab = page.getByRole('tab', { name: /by ip \/ subnet/i });
    this.byUserTab = page.getByRole('tab', { name: /by user/i });
    this.table = page.getByRole('table');
    this.pagination = page.getByTestId('data-table-pagination');
  }

  async goto() { await this.page.goto('/downloads'); }

  async applyIpFilter(ip: string) {
    await this.ipFilter.fill(ip);
    await this.applyButton.click();
  }
}
