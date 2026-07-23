import { type Page, type Locator } from '@playwright/test';

/**
 * Page object for the generic-artifact version-history surfaces (#571):
 *   - the per-repo "Enable versioning" toggle on the Settings tab, and
 *   - the "Versions" tab in the artifact detail dialog with its per-revision
 *     download rows.
 *
 * The version-history UI only appears for Generic/Mlmodel repositories that
 * have `versioning_enabled` set, so callers seed that state via the API before
 * driving the UI.
 */
export class ArtifactVersionsPage {
  readonly settingsTab: Locator;
  readonly versioningHeading: Locator;
  readonly versioningToggle: Locator;
  readonly saveButton: Locator;
  readonly artifactsTable: Locator;
  readonly artifactRows: Locator;
  readonly versionsTab: Locator;
  readonly versionsSection: Locator;
  readonly versionRows: Locator;

  constructor(private page: Page) {
    this.settingsTab = page.getByRole('tab', { name: /settings/i });
    this.versioningHeading = page.getByRole('heading', {
      name: /artifact versioning/i,
    });
    this.versioningToggle = page.getByLabel('Enable versioning');
    this.saveButton = page.getByRole('button', { name: /save changes/i });
    this.artifactsTable = page.getByRole('table').first();
    // The artifact browser renders via the shared <DataTable>, which spreads
    // `role="button"` onto each clickable data <tr> (so a row click opens the
    // detail dialog). That override strips the implicit `row` role, so
    // `getByRole('row')` only ever matches the header. Locate data rows by the
    // DOM structure (`tbody tr`) instead, which is unambiguous and role-neutral.
    this.artifactRows = this.artifactsTable.locator('tbody tr');
    this.versionsTab = page.getByRole('tab', { name: /versions/i });
    this.versionsSection = page.getByTestId('artifact-versions-section');
    this.versionRows = page.getByTestId('artifact-version-row');
  }

  async goto(key: string) {
    await this.page.goto(`/repositories/${key}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** A data row in the artifact browser matching `name` (see artifactRows). */
  artifactRow(name: string): Locator {
    return this.artifactRows.filter({ hasText: name });
  }

  /**
   * Select the repository Settings tab and wait for it to become the active
   * tab before callers assert on its contents. Radix flips `aria-selected` /
   * `data-state=active` once the panel is mounted, so gating on that removes
   * the load-timing race where an assertion runs before the tab has switched.
   */
  async openSettingsTab() {
    await this.settingsTab.click();
    await this.settingsTab
      .and(this.page.locator('[data-state="active"]'))
      .waitFor({ state: 'visible', timeout: 8000 });
  }

  /** Open the artifact detail dialog by clicking the row for `name`. */
  async openArtifactDetail(name: string) {
    await this.artifactRow(name).first().click();
  }

  /** Per-revision download button by revision number. */
  downloadRevisionButton(revision: number): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`download revision ${revision}`, 'i'),
    });
  }
}
