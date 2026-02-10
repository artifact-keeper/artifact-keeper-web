import { type Page, type Locator } from '@playwright/test';

export class ProfilePage {
  readonly apiKeysTab: Locator;
  readonly accessTokensTab: Locator;
  readonly securityTab: Locator;
  readonly generalTab: Locator;

  constructor(private page: Page) {
    this.generalTab = page.getByRole('tab', { name: /general/i }).or(
      page.getByText(/general/i).first()
    );
    this.apiKeysTab = page.getByRole('tab', { name: /api key/i }).or(
      page.getByText(/api key/i).first()
    );
    this.accessTokensTab = page.getByRole('tab', { name: /access token/i }).or(
      page.getByText(/access token/i).first()
    );
    this.securityTab = page.getByRole('tab', { name: /security/i }).or(
      page.getByText(/security/i).first()
    );
  }

  async goto() {
    await this.page.goto('/profile');
  }

  async switchToTab(tab: 'general' | 'api-keys' | 'access-tokens' | 'security') {
    const tabs = {
      'general': this.generalTab,
      'api-keys': this.apiKeysTab,
      'access-tokens': this.accessTokensTab,
      'security': this.securityTab,
    };
    await tabs[tab].click();
  }
}
