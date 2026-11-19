import { type Page, type Locator } from '@playwright/test';

/** The Servers gallery of an MCP repository and its Install sheet. */
export class McpServerPage {
  readonly serversTab: Locator;
  readonly search: Locator;
  readonly cards: Locator;
  readonly sheet: Locator;
  readonly loadMore: Locator;

  constructor(private page: Page) {
    this.serversTab = page.getByRole('tab', { name: /servers/i });
    this.search = page.getByRole('searchbox', { name: 'Search servers' });
    this.cards = page.getByTestId('mcp-server-card');
    this.sheet = page.getByRole('dialog');
    this.loadMore = page.getByRole('button', { name: 'Load more' });
  }

  async goto(repoKey: string) {
    await this.page.goto(`/repositories/${repoKey}`);
  }

  card(name: string): Locator {
    return this.page.getByRole('article', { name });
  }

  /** Pick an option of one of the gallery's filter selects. */
  async filter(label: 'Transport' | 'Package type' | 'Status', option: string) {
    await this.page.getByRole('combobox', { name: label }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  async openInstall(name: string) {
    await this.page.getByRole('button', { name: `Install ${name}` }).click();
  }

  snippet(label: string): Locator {
    return this.sheet.getByLabel(label, { exact: true });
  }

  async copy(label: string) {
    await this.sheet.getByRole('button', { name: `Copy ${label}` }).click();
  }

  async clientTab(name: string) {
    await this.sheet.getByRole('tab', { name, exact: true }).click();
  }
}
